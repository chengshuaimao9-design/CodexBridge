import { formatPlatformScopeKey } from './contracts.js';
import { createI18n, type Translator } from '../i18n/index.js';
import type { PlatformScopeRef, TurnArtifactDeliveryState } from '../types/core.js';
import type { ProviderApprovalRequest } from '../types/provider.js';

interface ActiveTurnRecord {
  scopeRef: PlatformScopeRef;
  bridgeSessionId: string | null;
  providerProfileId: string | null;
  threadId: string | null;
  turnId: string | null;
  interruptRequested: boolean;
  interruptDispatched: boolean;
  pendingApprovals: ProviderApprovalRequest[];
  artifactDelivery: TurnArtifactDeliveryState | null;
  createdAt: number;
  updatedAt: number;
}

interface BeginScopeTurnOptions {
  bridgeSessionId?: string | null;
  providerProfileId?: string | null;
  threadId?: string | null;
  turnId?: string | null;
}

interface ActiveTurnRegistryOptions {
  now?: () => number;
  locale?: string | null;
}

export class ActiveTurnRegistry {
  private readonly now: () => number;

  private readonly scopeTurns: Map<string, ActiveTurnRecord>;

  /** Tracks when each pending approval was added, keyed by scopeKey:requestId */
  private readonly pendingApprovalTimestamps: Map<string, number>;

  private readonly i18n: Translator;

  constructor({ now = () => Date.now(), locale = null }: ActiveTurnRegistryOptions = {}) {
    this.now = now;
    this.scopeTurns = new Map();
    this.pendingApprovalTimestamps = new Map();
    this.i18n = createI18n(locale);
  }

  resolveScopeTurn(scopeRef: PlatformScopeRef): ActiveTurnRecord | null {
    return this.scopeTurns.get(buildScopeKey(scopeRef)) ?? null;
  }

  listActiveTurns(): ActiveTurnRecord[] {
    return [...this.scopeTurns.values()];
  }

  hasAnyActiveTurn(): boolean {
    return this.scopeTurns.size > 0;
  }

  beginScopeTurn(scopeRef: PlatformScopeRef, initial: BeginScopeTurnOptions = {}): ActiveTurnRecord {
    const scopeKey = buildScopeKey(scopeRef);
    if (this.scopeTurns.has(scopeKey)) {
      throw new Error(this.i18n.t('service.activeTurn.alreadyExists', { scope: scopeKey }));
    }
    const now = this.now();
    const record: ActiveTurnRecord = {
      scopeRef: {
        platform: scopeRef.platform,
        externalScopeId: scopeRef.externalScopeId,
      },
      bridgeSessionId: initial.bridgeSessionId ?? null,
      providerProfileId: initial.providerProfileId ?? null,
      threadId: initial.threadId ?? null,
      turnId: initial.turnId ?? null,
      interruptRequested: false,
      interruptDispatched: false,
      pendingApprovals: [],
      artifactDelivery: null,
      createdAt: now,
      updatedAt: now,
    };
    this.scopeTurns.set(scopeKey, record);
    return record;
  }

  updateScopeTurn(
    scopeRef: PlatformScopeRef,
    updates: Partial<ActiveTurnRecord> = {},
  ): ActiveTurnRecord | null {
    const record = this.resolveScopeTurn(scopeRef);
    if (!record) {
      return null;
    }
    Object.assign(record, updates, {
      updatedAt: this.now(),
    });
    return record;
  }

  requestInterrupt(scopeRef: PlatformScopeRef): ActiveTurnRecord | null {
    return this.updateScopeTurn(scopeRef, {
      interruptRequested: true,
    });
  }

  noteInterruptDispatched(scopeRef: PlatformScopeRef, value = true): ActiveTurnRecord | null {
    return this.updateScopeTurn(scopeRef, {
      interruptDispatched: value,
    });
  }

  addPendingApproval(scopeRef: PlatformScopeRef, request: ProviderApprovalRequest): ActiveTurnRecord | null {
    const record = this.resolveScopeTurn(scopeRef);
    if (!record) {
      return null;
    }
    const scopeKey = buildScopeKey(scopeRef);
    const next = record.pendingApprovals.filter((entry) => entry.requestId !== request.requestId);
    next.push(request);
    // Track when this approval was added for auto-expiry
    this.pendingApprovalTimestamps.set(`${scopeKey}:${request.requestId}`, this.now());
    return this.updateScopeTurn(scopeRef, {
      pendingApprovals: next,
    });
  }

  clearPendingApproval(scopeRef: PlatformScopeRef, requestId: string): ActiveTurnRecord | null {
    const record = this.resolveScopeTurn(scopeRef);
    if (!record) {
      return null;
    }
    const scopeKey = buildScopeKey(scopeRef);
    this.pendingApprovalTimestamps.delete(`${scopeKey}:${requestId}`);
    return this.updateScopeTurn(scopeRef, {
      pendingApprovals: record.pendingApprovals.filter((entry) => entry.requestId !== requestId),
    });
  }

  clearPendingApprovals(scopeRef: PlatformScopeRef): ActiveTurnRecord | null {
    const scopeKey = buildScopeKey(scopeRef);
    // Clean all timestamp entries for this scope
    for (const key of this.pendingApprovalTimestamps.keys()) {
      if (key.startsWith(`${scopeKey}:`)) {
        this.pendingApprovalTimestamps.delete(key);
      }
    }
    return this.updateScopeTurn(scopeRef, {
      pendingApprovals: [],
    });
  }

  /** Remove pending approvals older than maxAgeMs and return cleaned record */
  filterExpiredPendingApprovals(scopeRef: PlatformScopeRef, maxAgeMs: number): ActiveTurnRecord | null {
    const record = this.resolveScopeTurn(scopeRef);
    if (!record || record.pendingApprovals.length === 0) {
      return record;
    }
    const scopeKey = buildScopeKey(scopeRef);
    const cutoff = this.now() - maxAgeMs;
    const fresh: ProviderApprovalRequest[] = [];
    let changed = false;
    for (const req of record.pendingApprovals) {
      const tsKey = `${scopeKey}:${req.requestId}`;
      const addedAt = this.pendingApprovalTimestamps.get(tsKey);
      if (addedAt != null && addedAt < cutoff) {
        // Expired - remove timestamp and skip
        this.pendingApprovalTimestamps.delete(tsKey);
        changed = true;
      } else {
        fresh.push(req);
      }
    }
    if (!changed) {
      return record;
    }
    return this.updateScopeTurn(scopeRef, {
      pendingApprovals: fresh,
    });
  }

  endScopeTurn(scopeRef: PlatformScopeRef): ActiveTurnRecord | null {
    const scopeKey = buildScopeKey(scopeRef);
    const record = this.scopeTurns.get(scopeKey) ?? null;
    this.scopeTurns.delete(scopeKey);
    // Clean up timestamp entries for this scope
    for (const key of this.pendingApprovalTimestamps.keys()) {
      if (key.startsWith(`${scopeKey}:`)) {
        this.pendingApprovalTimestamps.delete(key);
      }
    }
    return record;
  }
}

function buildScopeKey(scopeRef: PlatformScopeRef): string {
  return formatPlatformScopeKey(scopeRef.platform, scopeRef.externalScopeId);
}
