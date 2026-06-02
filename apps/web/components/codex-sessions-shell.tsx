'use client';

import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { SessionSidebar } from '@/components/session-sidebar';
import { CodexThreadMessages } from '@/components/codex-thread-messages';
import { segmentAssistantStreamingText } from '@/lib/chat-segmentation';
import type { WebCodexThreadMessage, WebCodexThreadSummary } from '@/lib/server/queries';

type CodexSessionsShellProps = {
  activeThreadId?: string | null;
  initialThreadHasMore?: boolean;
  initialThreadMessages?: WebCodexThreadMessage[];
  initialThreads?: WebCodexThreadSummary[];
};

type ThreadListResponse = {
  data: WebCodexThreadSummary[];
};

type ThreadMessagesResponse = {
  items: WebCodexThreadMessage[];
  hasMore: boolean;
};

type ThreadReplyResponse = {
  ok?: boolean;
  runId?: string;
  threadId?: string;
  error?: string;
};

type ReplyRunSnapshot = {
  runId: string;
  sourceThreadId: string;
  finalThreadId: string | null;
  bridgeSessionId: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  assistantText: string;
  commentaryText: string;
  error: string | null;
  turnId: string | null;
  items: WebCodexThreadMessage[] | null;
  hasMore: boolean;
};

const STORAGE_KEY = 'codexbridge-web-sidebar-open';

function createLocalMessageId(prefix: 'local-user' | 'local-assistant') {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) {
    return `${prefix}:${uuid}`;
  }
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

function areThreadListsEqual(
  left: WebCodexThreadSummary[],
  right: WebCodexThreadSummary[],
) {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftThread = left[index];
    const rightThread = right[index];
    if (
      leftThread.threadId !== rightThread.threadId
      || leftThread.updatedAt !== rightThread.updatedAt
      || leftThread.title !== rightThread.title
      || leftThread.isPinned !== rightThread.isPinned
      || leftThread.isArchived !== rightThread.isArchived
      || leftThread.folderLabel !== rightThread.folderLabel
      || leftThread.folderPinned !== rightThread.folderPinned
    ) {
      return false;
    }
  }
  return true;
}

export function CodexSessionsShell({
  activeThreadId = null,
  initialThreadHasMore = false,
  initialThreadMessages = [],
  initialThreads = [],
}: CodexSessionsShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [threads, setThreads] = useState<WebCodexThreadSummary[]>(initialThreads);
  const [threadsLoading, setThreadsLoading] = useState(initialThreads.length === 0);
  const [threadMessages, setThreadMessages] = useState<WebCodexThreadMessage[]>(initialThreadMessages);
  const [threadHasMore, setThreadHasMore] = useState(initialThreadHasMore);
  const [threadLoading, setThreadLoading] = useState(activeThreadId ? initialThreadMessages.length === 0 : false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [updatingMeta, setUpdatingMeta] = useState(false);
  const [deletingThread, setDeletingThread] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const replyStreamRef = useRef<EventSource | null>(null);

  function closeReplyStream() {
    replyStreamRef.current?.close();
    replyStreamRef.current = null;
  }

  function updateAssistantDraft(
    draftId: string,
    {
      failed = false,
      pending = false,
      text,
    }: {
      failed?: boolean;
      pending?: boolean;
      text?: string;
    },
  ) {
    setThreadMessages((current) =>
      current.map((message) =>
        message.id === draftId
          ? {
              ...message,
              failed,
              pending,
              text: typeof text === 'string' ? text : message.text,
            }
          : message,
      ),
    );
  }

  function buildStreamAssistantMessages(
    draftId: string,
    timestamp: string,
    assistantText: string,
    commentaryText: string,
    status: ReplyRunSnapshot['status'],
  ): WebCodexThreadMessage[] {
    const { committed, draft } = segmentAssistantStreamingText(assistantText);
    const items: WebCodexThreadMessage[] = committed.map((text, index) => ({
      id: `${draftId}:committed:${index}`,
      role: 'assistant',
      pending: false,
      source: 'stream',
      text,
      timestamp,
    }));

    const processText = commentaryText.trim() || null;
    if (draft) {
      items.push({
        id: `${draftId}:draft`,
        role: 'assistant',
        pending: status === 'queued' || status === 'running',
        processPending: status === 'queued' || status === 'running',
        processText,
        source: 'stream',
        text: draft,
        timestamp,
      });
      return items;
    }

    if (items.length === 0 && (status === 'queued' || status === 'running')) {
      items.push({
        id: `${draftId}:draft`,
        role: 'assistant',
        pending: true,
        processPending: true,
        processText,
        source: 'stream',
        text: '',
        timestamp,
      });
      return items;
    }

    if (processText && items.length > 0) {
      const lastIndex = items.length - 1;
      items[lastIndex] = {
        ...items[lastIndex],
        processPending: status === 'queued' || status === 'running',
        processText,
      };
    }
    return items;
  }

  function attachProcessToFinalAssistantMessages(
    items: WebCodexThreadMessage[],
    commentaryText: string,
  ): WebCodexThreadMessage[] {
    const processText = commentaryText.trim() || null;
    if (!processText) {
      return items;
    }
    const lastAssistantIndex = [...items]
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => message.role === 'assistant')
      .map(({ index }) => index)
      .at(-1);
    if (typeof lastAssistantIndex !== 'number') {
      return items;
    }
    return items.map((message, index) => (
      index === lastAssistantIndex
        ? {
            ...message,
            processPending: false,
            processText,
          }
        : message
    ));
  }

  function replaceStreamAssistantMessages(
    draftId: string,
    timestamp: string,
    assistantText: string,
    commentaryText: string,
    status: ReplyRunSnapshot['status'],
  ) {
    const nextAssistantMessages = buildStreamAssistantMessages(
      draftId,
      timestamp,
      assistantText,
      commentaryText,
      status,
    );
    setThreadMessages((current) => [
      ...current.filter((message) => message.source !== 'stream'),
      ...nextAssistantMessages,
    ]);
  }

  function replaceStreamFailureMessage(draftId: string, timestamp: string, text: string) {
    setThreadMessages((current) => [
      ...current.filter((message) => message.source !== 'stream'),
      {
        id: `${draftId}:failed`,
        role: 'assistant',
        failed: true,
        pending: false,
        source: 'stream',
        text,
        timestamp,
      },
    ]);
  }

  function applyRunSnapshot(snapshot: ReplyRunSnapshot, draftId: string, draftTimestamp: string) {
    replaceStreamAssistantMessages(
      draftId,
      draftTimestamp,
      snapshot.assistantText,
      snapshot.commentaryText,
      snapshot.status,
    );

    if (snapshot.status === 'completed') {
      if (Array.isArray(snapshot.items)) {
        setThreadMessages(attachProcessToFinalAssistantMessages(snapshot.items, snapshot.commentaryText));
        setThreadHasMore(Boolean(snapshot.hasMore));
      } else {
        updateAssistantDraft(draftId, { pending: false });
      }
      setReplyError(null);
      setSendingReply(false);
      closeReplyStream();
      void refreshThreads();
      const nextThreadId = typeof snapshot.finalThreadId === 'string' ? snapshot.finalThreadId.trim() : '';
      if (nextThreadId && nextThreadId !== activeThreadId) {
        window.location.assign(`/sessions/codex/${encodeURIComponent(nextThreadId)}`);
      }
      return;
    }

    if (snapshot.status === 'failed') {
      replaceStreamFailureMessage(draftId, draftTimestamp, snapshot.error || snapshot.assistantText || '发送失败');
      setReplyError(snapshot.error || '发送失败');
      setSendingReply(false);
      closeReplyStream();
    }
  }

  function startReplyStream(runId: string, draftId: string, draftTimestamp: string) {
    closeReplyStream();
    const stream = new EventSource(`/api/codex-threads/${encodeURIComponent(activeThreadId ?? '')}/runs/${encodeURIComponent(runId)}/events`);
    replyStreamRef.current = stream;

    const handleSnapshot = (event: MessageEvent<string>) => {
      try {
        const snapshot = JSON.parse(event.data) as ReplyRunSnapshot;
        applyRunSnapshot(snapshot, draftId, draftTimestamp);
      } catch {
        // ignore malformed events
      }
    };

    stream.addEventListener('snapshot', handleSnapshot);
    stream.addEventListener('started', handleSnapshot);
    stream.addEventListener('assistant', handleSnapshot);
    stream.addEventListener('commentary', handleSnapshot);
    stream.addEventListener('done', handleSnapshot);
    stream.addEventListener('failed', handleSnapshot);
    stream.onerror = () => {
      if (stream.readyState !== EventSource.CLOSED) {
        return;
      }
      replaceStreamFailureMessage(draftId, draftTimestamp, '连接已中断，请稍后重试。');
      setReplyError('连接已中断，请稍后重试。');
      setSendingReply(false);
      closeReplyStream();
    };
  }

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === '0') {
      setSidebarOpen(false);
      return;
    }
    setSidebarOpen(true);
  }, []);

  useEffect(() => {
    setThreads(initialThreads);
    setThreadsLoading(initialThreads.length === 0);
  }, [initialThreads]);

  useEffect(() => {
    setThreadMessages(initialThreadMessages);
    setThreadHasMore(initialThreadHasMore);
    setThreadLoading(activeThreadId ? initialThreadMessages.length === 0 : false);
    setMenuOpen(false);
    setReplyError(null);
    setSendingReply(false);
    closeReplyStream();
  }, [activeThreadId, initialThreadHasMore, initialThreadMessages]);

  useEffect(() => () => {
    closeReplyStream();
  }, []);

  useEffect(() => {
    function handlePointer(event: MouseEvent) {
      if (!menuRef.current) {
        return;
      }
      if (event.target instanceof Node && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    if (!menuOpen) {
      return;
    }
    window.addEventListener('mousedown', handlePointer);
    return () => window.removeEventListener('mousedown', handlePointer);
  }, [menuOpen]);

  useEffect(() => {
    if (!activeThreadId) {
      setThreadMessages([]);
      setThreadHasMore(false);
      setThreadLoading(false);
      return;
    }

    if (initialThreadMessages.length > 0) {
      setThreadLoading(false);
      return;
    }

    let cancelled = false;
    setThreadLoading(true);
    fetch(`/api/codex-threads/${encodeURIComponent(activeThreadId)}/messages?offset=0&limit=8`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) {
          return { items: [], hasMore: false } as ThreadMessagesResponse;
        }
        return response.json() as Promise<ThreadMessagesResponse>;
      })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setThreadMessages(payload.items ?? []);
        setThreadHasMore(Boolean(payload.hasMore));
        setThreadLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setThreadMessages([]);
        setThreadHasMore(false);
        setThreadLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeThreadId, initialThreadHasMore, initialThreadMessages]);

  const activeThread = activeThreadId
    ? threads.find((entry) => entry.threadId === activeThreadId) ?? null
    : null;

  function toggleSidebar() {
    setSidebarOpen((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }

  async function refreshThreads() {
    try {
      const response = await fetch('/api/codex-threads', { cache: 'no-store' });
      const payload = response.ok
        ? await response.json() as ThreadListResponse
        : { data: [] };
      const nextThreads = payload.data ?? [];
      setThreads((current) => (areThreadListsEqual(current, nextThreads) ? current : nextThreads));
    } catch {
      setThreads((current) => (current.length === 0 ? current : []));
    }
  }

  async function applyThreadAction(action: 'pin' | 'unpin' | 'archive' | 'unarchive' | 'delete') {
    if (!activeThreadId || updatingMeta) {
      return;
    }
    setUpdatingMeta(true);
    if (action === 'delete') {
      setDeletingThread(true);
    }
    setMenuOpen(false);
    try {
      const response = await fetch(`/api/codex-threads/${encodeURIComponent(activeThreadId)}/meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json() as {
        metadata?: { isPinned?: boolean; isArchived?: boolean; isDeleted?: boolean };
      };
      if (payload.metadata?.isDeleted) {
        window.location.assign('/sessions');
        return;
      }
      setThreads((current) =>
        current.map((thread) =>
          thread.threadId === activeThreadId
            ? {
                ...thread,
                isPinned: Boolean(payload.metadata?.isPinned),
                isArchived: Boolean(payload.metadata?.isArchived),
              }
            : thread,
        ),
      );
    } finally {
      setDeletingThread(false);
      setUpdatingMeta(false);
    }
  }

  async function handleReplySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeThreadId || sendingReply) {
      return;
    }
    const text = composerText.trim();
    if (!text) {
      return;
    }

    const timestamp = new Date().toISOString();
    const userMessageId = createLocalMessageId('local-user');
    const assistantDraftId = createLocalMessageId('local-assistant');
    const assistantDraftTimestamp = timestamp;
    const optimisticUserMessage: WebCodexThreadMessage = {
      id: userMessageId,
      role: 'user',
      source: 'local',
      text,
      timestamp,
    };

    setThreadMessages((current) => [
      ...current.filter((message) => message.source !== 'stream'),
      optimisticUserMessage,
      ...buildStreamAssistantMessages(assistantDraftId, assistantDraftTimestamp, '', '', 'queued'),
    ]);
    setComposerText('');
    setSendingReply(true);
    setReplyError(null);
    try {
      const response = await fetch(`/api/codex-threads/${encodeURIComponent(activeThreadId)}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const payload = await response.json().catch(() => null) as ThreadReplyResponse | null;
      if (!response.ok || !payload?.ok) {
        const errorMessage = (payload?.error && String(payload.error).trim()) || '发送失败';
        replaceStreamFailureMessage(assistantDraftId, assistantDraftTimestamp, errorMessage);
        setReplyError(errorMessage);
        setSendingReply(false);
        return;
      }
      const runId = typeof payload.runId === 'string' ? payload.runId.trim() : '';
      if (!runId) {
        replaceStreamFailureMessage(assistantDraftId, assistantDraftTimestamp, '回复启动失败。');
        setReplyError('回复启动失败。');
        setSendingReply(false);
        return;
      }
      startReplyStream(runId, assistantDraftId, assistantDraftTimestamp);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '发送失败';
      replaceStreamFailureMessage(assistantDraftId, assistantDraftTimestamp, errorMessage);
      setReplyError(errorMessage);
      setSendingReply(false);
    }
  }

  return (
    <section className={`workspace-shell${sidebarOpen ? ' sidebar-open' : ' sidebar-closed'}`}>
      <div className="workspace-shell-body">
        <div className="workspace-shell-sidebar">
          <SessionSidebar
            activeThreadId={activeThreadId}
            onToggleSidebar={toggleSidebar}
            sessions={threads}
          />
        </div>

        <div className="workspace-shell-main">
          <main className="workspace-main">
            {!activeThreadId ? (
              <div className="workspace-main-scroll">
                {!sidebarOpen ? (
                  <div className="workspace-floating-bar">
                    <button
                      aria-expanded={sidebarOpen}
                      aria-label="展开目录"
                      className="workspace-shell-toggle"
                      onClick={toggleSidebar}
                      type="button"
                    >
                      ≡
                    </button>
                    <div className="workspace-shell-pill" title="CodexBridge">
                      CodexBridge
                    </div>
                  </div>
                ) : null}

                <section className="workspace-empty-state">
                  <div className="workspace-empty-state-inner">
                    <h2>我们先从哪里开始呢？</h2>
                    <div className="workspace-composer-shell" aria-hidden="true">
                      <div className="workspace-composer-leading">＋</div>
                      <div className="workspace-composer-placeholder">打开左侧会话，或从这里开始新的对话</div>
                      <div className="workspace-composer-send">
                        <img alt="" aria-hidden="true" className="workspace-composer-send-icon" src="/icons/send-arrow.svg" />
                      </div>
                    </div>
                    <p className="workspace-subtle">
                      {threadsLoading ? '正在加载目录…' : `左侧已准备好 ${threads.length} 条会话`}
                    </p>
                  </div>
                </section>
              </div>
            ) : (
              <section className="workspace-thread-page">
                {!sidebarOpen ? (
                  <div className="workspace-floating-bar workspace-floating-bar-thread">
                    <button
                      aria-expanded={sidebarOpen}
                      aria-label="展开目录"
                      className="workspace-shell-toggle"
                      onClick={toggleSidebar}
                      type="button"
                    >
                      ≡
                    </button>
                    <div className="workspace-shell-pill" title={activeThread?.title ?? 'CodexBridge'}>
                      {activeThread?.title ?? 'CodexBridge'}
                    </div>
                  </div>
                ) : null}

                <section className="workspace-thread-topbar">
                  <div className="workspace-thread-topbar-inner">
                    <div className="workspace-thread-topbar-main">
                      <h2>{activeThread?.title ?? '加载中…'}</h2>
                      <p className="workspace-copy">
                        {activeThread
                          ? `${activeThread.cwd ?? '未记录目录'} · ${activeThread.updatedAtLabel}`
                          : '正在加载当前会话信息…'}
                      </p>
                    </div>
                    {activeThread ? (
                      <div className="workspace-thread-menu" ref={menuRef}>
                        <button
                          aria-expanded={menuOpen}
                          aria-label="更多操作"
                          className="workspace-thread-menu-trigger"
                          onClick={() => setMenuOpen((current) => !current)}
                          type="button"
                        >
                          …
                        </button>
                        {menuOpen ? (
                          <div className="workspace-thread-menu-popover">
                            <button
                              className="workspace-thread-menu-item"
                              disabled={updatingMeta}
                              onClick={() => void applyThreadAction(activeThread.isPinned ? 'unpin' : 'pin')}
                              type="button"
                            >
                              {activeThread.isPinned ? '取消置顶' : '置顶'}
                            </button>
                            <button
                              className="workspace-thread-menu-item"
                              disabled={updatingMeta}
                              onClick={() => void applyThreadAction(activeThread.isArchived ? 'unarchive' : 'archive')}
                              type="button"
                            >
                              {activeThread.isArchived ? '取消归档' : '归档'}
                            </button>
                            <button
                              className="workspace-thread-menu-item danger"
                              disabled={updatingMeta || deletingThread}
                              onClick={() => void applyThreadAction('delete')}
                              type="button"
                            >
                              {deletingThread ? '删除中…' : '删除'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="workspace-thread-stream">
                  {threadLoading ? (
                    <div className="workspace-note compact">
                      <strong>正在加载</strong>
                      <span>当前会话的最近消息正在准备中。</span>
                    </div>
                  ) : (
                    <CodexThreadMessages
                      initialHasMore={threadHasMore}
                      initialItems={threadMessages}
                      threadId={activeThreadId}
                    />
                  )}
                </section>

                <section className="workspace-thread-composer">
                  <form className="workspace-composer-shell workspace-composer-shell-live workspace-composer-form" onSubmit={handleReplySubmit}>
                    <button className="workspace-composer-leading" disabled={sendingReply} type="button">
                      ＋
                    </button>
                    <textarea
                      className="workspace-composer-input"
                      onChange={(replyEvent) => setComposerText(replyEvent.target.value)}
                      onKeyDown={(keyEvent) => {
                        if (keyEvent.key === 'Enter' && !keyEvent.shiftKey) {
                          keyEvent.preventDefault();
                          keyEvent.currentTarget.form?.requestSubmit();
                        }
                      }}
                      placeholder="继续这个对话…"
                      rows={1}
                      value={composerText}
                    />
                    <button
                      aria-label="发送"
                      className="workspace-composer-send"
                      disabled={sendingReply || !composerText.trim()}
                      type="submit"
                    >
                      <img alt="" aria-hidden="true" className="workspace-composer-send-icon" src="/icons/send-arrow.svg" />
                    </button>
                  </form>
                  {replyError ? <p className="workspace-reply-error">{replyError}</p> : null}
                </section>
              </section>
            )}
          </main>
        </div>
      </div>
    </section>
  );
}
