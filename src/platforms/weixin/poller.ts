import { parseSlashCommand } from '../../core/command_parser.js';

interface CompletionLike {
  then?: (onfulfilled?: (value: unknown) => unknown, onrejected?: (reason: unknown) => unknown) => unknown;
}

interface EventOutcome {
  completion?: CompletionLike | null;
  afterCommit?: (() => Promise<void> | void) | null;
}

interface WeixinPollerPlugin {
  loadSyncCursor?: () => string | null;
  pollOnce(params: { syncCursor: string | null }): Promise<{ syncCursor?: string | null; events?: unknown[] }>;
  commitSyncCursor?: (syncCursor: string | null | undefined) => Promise<void>;
}

interface PendingCursorCommit {
  syncCursor: string | null | undefined;
  afterCommitActions: Array<() => Promise<void> | void>;
}

interface WeixinPollerOptions {
  plugin: WeixinPollerPlugin;
  onEvent?: (event: unknown) => Promise<EventOutcome | void> | EventOutcome | void;
  onError?: (error: unknown) => Promise<void> | void;
  onConnectionLost?: () => Promise<void> | void;
  onConnectionRestored?: () => Promise<void> | void;
  sleep?: (ms: number) => Promise<void>;
  maxConsecutiveErrors?: number;
  healthCheckIntervalMs?: number;
}

export class WeixinPoller {
  constructor({
    plugin,
    onEvent = async () => {},
    onError = async () => {},
    onConnectionLost = async () => {},
    onConnectionRestored = async () => {},
    sleep = defaultSleep,
    maxConsecutiveErrors = 10,
    healthCheckIntervalMs = 300_000,
  }: WeixinPollerOptions) {
    this.plugin = plugin;
    this.onEvent = onEvent;
    this.onError = onError;
    this.onConnectionLost = onConnectionLost;
    this.onConnectionRestored = onConnectionRestored;
    this.sleep = sleep;
    this.running = false;
    this.nextSyncCursor = null;
    this.pendingCursorCommits = [];
    this.commitPumpPromise = null;
    this.commitBlocked = false;
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = maxConsecutiveErrors;
    this.healthCheckIntervalMs = healthCheckIntervalMs;
    this.lastHealthCheckAt = 0;
    this.lastSuccessfulPollAt = Date.now();
  }

  plugin: WeixinPollerPlugin;
  onEvent: (event: unknown) => Promise<EventOutcome | void> | EventOutcome | void;
  onError: (error: unknown) => Promise<void> | void;
  onConnectionLost: () => Promise<void> | void;
  onConnectionRestored: () => Promise<void> | void;
  sleep: (ms: number) => Promise<void>;
  running: boolean;
  nextSyncCursor: string | null;
  pendingCursorCommits: PendingCursorCommit[];
  commitPumpPromise: Promise<void> | null;
  commitBlocked: boolean;
  consecutiveErrors: number;
  maxConsecutiveErrors: number;
  healthCheckIntervalMs: number;
  lastHealthCheckAt: number;
  lastSuccessfulPollAt: number;

  async start() {
    this.running = true;
    this.nextSyncCursor = this.plugin.loadSyncCursor?.() ?? null;
    while (this.running) {
      try {
        const result = await this.plugin.pollOnce({ syncCursor: this.nextSyncCursor });
        this.nextSyncCursor = result?.syncCursor ?? this.nextSyncCursor;
        const dispatchOutcome = await this.dispatchEvents(result?.events ?? []);
        void dispatchOutcome.completion.catch(async (error) => {
          // Service-mode cursor persistence must not wait on long-running turn completion.
          // We still surface background failures through onError for observability.
          await this.onError(error);
        });
        this.enqueueCursorCommit({
          syncCursor: result?.syncCursor ?? this.nextSyncCursor,
          afterCommitActions: dispatchOutcome.afterCommitActions,
        });
        this.ensureCommitPump();
      } catch (error) {
        this.consecutiveErrors += 1;
        await this.onError(error);
        // Exponential backoff with circuit breaker: 2s, 4s, 8s, 16s, 30s, then stay at 30s
        let backoffMs = Math.min(2000 * Math.pow(2, this.consecutiveErrors - 1), 30000);
        // After maxConsecutiveErrors/2 failures, add jitter to prevent thundering herd
        if (this.consecutiveErrors > this.maxConsecutiveErrors / 2) {
          backoffMs += Math.floor(Math.random() * 5000);
        }
        await this.sleep(backoffMs);
        // Notify on first loss and periodically after that
        if (this.consecutiveErrors === 1 || this.consecutiveErrors % this.maxConsecutiveErrors === 0) {
          await this.onConnectionLost();
        }
      }
    }
    await this.commitPumpPromise;
  }

  stop() {
    this.running = false;
  }

  async dispatchEvents(events: unknown[]) {
    const completions: Promise<void>[] = [];
    const afterCommitActions: Array<() => Promise<void> | void> = [];
    for (const event of collapseRestartEvents(events)) {
      const outcome = await this.onEvent(event);
      const completion = extractCompletionPromise(outcome);
      if (completion) {
        completions.push(completion);
      }
      const afterCommit = extractAfterCommitAction(outcome);
      if (afterCommit) {
        afterCommitActions.push(afterCommit);
      }
    }
    return {
      completion: completions.length === 0 ? Promise.resolve() : Promise.all(completions).then(() => {}),
      afterCommitActions,
    };
  }

  enqueueCursorCommit(entry: PendingCursorCommit) {
    this.pendingCursorCommits.push(entry);
  }

  ensureCommitPump() {
    if (this.commitPumpPromise || this.commitBlocked) {
      return;
    }
    this.commitPumpPromise = this.runCommitPump()
      .finally(() => {
        this.commitPumpPromise = null;
        if (this.pendingCursorCommits.length > 0 && !this.commitBlocked) {
          this.ensureCommitPump();
        }
      });
  }

  async runCommitPump() {
    while (this.pendingCursorCommits.length > 0) {
      const entry = this.pendingCursorCommits[0];
      try {
        await this.plugin.commitSyncCursor?.(entry.syncCursor);
        for (const afterCommit of entry.afterCommitActions) {
          await afterCommit();
        }
        this.pendingCursorCommits.shift();
      } catch (error) {
        this.commitBlocked = true;
        await this.onError(error);
        // Reset commitBlocked after a delay to recover from transient failures
        setTimeout(() => { this.commitBlocked = false; }, 5000);
        return;
      }
    }
  }
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractCompletionPromise(outcome: EventOutcome | void): Promise<void> | null {
  if (!outcome) {
    return null;
  }
  const completion = outcome.completion;
  if (!completion || typeof completion.then !== 'function') {
    return null;
  }
  return Promise.resolve(completion).then(() => {});
}

function extractAfterCommitAction(outcome: EventOutcome | void): (() => Promise<void> | void) | null {
  if (!outcome || typeof outcome.afterCommit !== 'function') {
    return null;
  }
  return outcome.afterCommit;
}

function collapseRestartEvents(events: unknown[]) {
  const latestRestartIndexByScope = new Map<string, number>();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index] as any;
    const scopeId = typeof event?.externalScopeId === 'string' ? event.externalScopeId : '';
    const command = parseSlashCommand(String(event?.text ?? ''));
    if (!scopeId || command?.name !== 'restart') {
      continue;
    }
    const previousIndex = latestRestartIndexByScope.get(scopeId);
    if (previousIndex === undefined) {
      latestRestartIndexByScope.set(scopeId, index);
      continue;
    }
    const previousEvent = events[previousIndex] as any;
    const previousMessageId = parseMessageId(previousEvent?.metadata?.weixin?.messageId);
    const currentMessageId = parseMessageId(event?.metadata?.weixin?.messageId);
    if (currentMessageId !== null && previousMessageId !== null) {
      if (currentMessageId >= previousMessageId) {
        latestRestartIndexByScope.set(scopeId, index);
      }
      continue;
    }
    latestRestartIndexByScope.set(scopeId, index);
  }

  return events.filter((event, index) => {
    const anyEvent = event as any;
    const scopeId = typeof anyEvent?.externalScopeId === 'string' ? anyEvent.externalScopeId : '';
    const command = parseSlashCommand(String(anyEvent?.text ?? ''));
    if (!scopeId || command?.name !== 'restart') {
      return true;
    }
    return latestRestartIndexByScope.get(scopeId) === index;
  });
}

function parseMessageId(value: unknown): bigint | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}
