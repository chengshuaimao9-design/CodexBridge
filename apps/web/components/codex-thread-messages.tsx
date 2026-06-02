'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { WebCodexThreadMessage } from '@/lib/server/queries';

type CodexThreadMessagesProps = {
  initialItems: WebCodexThreadMessage[];
  initialHasMore: boolean;
  threadId: string;
};

type MessageResponse = {
  items: WebCodexThreadMessage[];
  hasMore: boolean;
};

function MarkdownMessage({ text }: { text: string }) {
  return (
    <ReactMarkdown
      components={{
        a: ({ node: _node, ...props }) => (
          <a {...props} rel="noreferrer" target="_blank" />
        ),
        code: ({ className, children, ...props }) => {
          const isBlock = typeof className === 'string' && className.includes('language-');
          if (isBlock) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }
          return (
            <code {...props}>
              {children}
            </code>
          );
        },
      }}
      remarkPlugins={[remarkGfm]}
    >
      {text}
    </ReactMarkdown>
  );
}

export function CodexThreadMessages({
  initialItems,
  initialHasMore,
  threadId,
}: CodexThreadMessagesProps) {
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [openProcesses, setOpenProcesses] = useState<Record<string, boolean>>({});
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const previousThreadIdRef = useRef<string | null>(null);
  const previousCountRef = useRef(0);
  const previousTailSignatureRef = useRef('');
  const restoringOlderRef = useRef(false);
  const olderMetricsRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);

  useEffect(() => {
    setItems(initialItems);
    setHasMore(initialHasMore);
  }, [initialHasMore, initialItems, threadId]);

  useEffect(() => {
    setOpenProcesses({});
  }, [threadId]);

  useEffect(() => {
    setOpenProcesses((current) => {
      let changed = false;
      const next = { ...current };
      for (const message of items) {
        if (
          message.role === 'assistant'
          && message.processPending
          && message.processText
          && typeof next[message.id] === 'undefined'
        ) {
          next[message.id] = true;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [items]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      previousThreadIdRef.current = threadId;
      previousCountRef.current = items.length;
      previousTailSignatureRef.current = items.at(-1)
        ? `${items.at(-1)?.id ?? ''}:${items.at(-1)?.text ?? ''}:${items.at(-1)?.processText ?? ''}:${items.at(-1)?.pending ? '1' : '0'}:${items.at(-1)?.processPending ? '1' : '0'}`
        : '';
      return;
    }

    if (restoringOlderRef.current && olderMetricsRef.current) {
      const previousMetrics = olderMetricsRef.current;
      viewport.scrollTop = viewport.scrollHeight - previousMetrics.scrollHeight + previousMetrics.scrollTop;
      restoringOlderRef.current = false;
      olderMetricsRef.current = null;
      previousThreadIdRef.current = threadId;
      previousCountRef.current = items.length;
      previousTailSignatureRef.current = items.at(-1)
        ? `${items.at(-1)?.id ?? ''}:${items.at(-1)?.text ?? ''}:${items.at(-1)?.processText ?? ''}:${items.at(-1)?.pending ? '1' : '0'}:${items.at(-1)?.processPending ? '1' : '0'}`
        : '';
      return;
    }

    const threadChanged = previousThreadIdRef.current !== threadId;
    const countGrew = items.length > previousCountRef.current;
    const nextTailSignature = items.at(-1)
      ? `${items.at(-1)?.id ?? ''}:${items.at(-1)?.text ?? ''}:${items.at(-1)?.processText ?? ''}:${items.at(-1)?.pending ? '1' : '0'}:${items.at(-1)?.processPending ? '1' : '0'}`
      : '';
    const tailChanged = previousTailSignatureRef.current !== nextTailSignature;
    if (threadChanged || countGrew || tailChanged) {
      viewport.scrollTop = viewport.scrollHeight;
    }

    previousThreadIdRef.current = threadId;
    previousCountRef.current = items.length;
    previousTailSignatureRef.current = nextTailSignature;
  }, [items, threadId]);

  useEffect(() => {
    if (!hasMore || loading) {
      return;
    }
    const node = sentinelRef.current;
    const root = viewportRef.current;
    if (!node || !root) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }
      void loadMore();
    }, {
      root,
      rootMargin: '160px 0px 0px 0px',
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, items.length, threadId]);

  async function loadMore() {
    if (loading || !hasMore) {
      return;
    }
    const viewport = viewportRef.current;
    if (viewport) {
      restoringOlderRef.current = true;
      olderMetricsRef.current = {
        scrollHeight: viewport.scrollHeight,
        scrollTop: viewport.scrollTop,
      };
    }
    setLoading(true);
    try {
      const response = await fetch(
        `/api/codex-threads/${encodeURIComponent(threadId)}/messages?offset=${items.length}&limit=8`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        return;
      }
      const data = await response.json() as MessageResponse;
      setItems((current) => [...data.items, ...current]);
      setHasMore(data.hasMore);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="thread-messages">
      <div className="thread-messages-viewport" ref={viewportRef}>
        {hasMore ? (
          <div className="thread-messages-load-more" ref={sentinelRef}>
            <button
              className="workspace-shell-toggle"
              disabled={loading}
              onClick={() => void loadMore()}
              type="button"
            >
              {loading ? '继续加载中…' : '继续加载更早消息'}
            </button>
          </div>
        ) : null}

        {items.length === 0 ? (
          <div className="sidebar-empty">当前还没有可展示的用户/助手消息。</div>
        ) : (
          <div className="thread-message-list">
            {items.map((message) => (
              <article className={`thread-message ${message.role}${message.pending ? ' pending' : ''}${message.failed ? ' failed' : ''}`} key={message.id}>
                <header className="thread-message-header">
                  <strong>{message.role === 'user' ? '你' : 'Codex'}</strong>
                  <span>{message.timestamp ? new Date(message.timestamp).toLocaleString('zh-CN') : '未记录'}</span>
                </header>
                <div className="thread-message-body">
                  {message.text
                    ? <MarkdownMessage text={message.text} />
                    : (
                        <p className="thread-message-placeholder">
                          {message.pending ? '正在思考…' : '\u00A0'}
                        </p>
                      )}
                </div>
                {message.role === 'assistant' && message.processText ? (
                  <div className="thread-message-process">
                    <button
                      aria-expanded={Boolean(openProcesses[message.id])}
                      className="thread-message-process-toggle"
                      onClick={() => {
                        setOpenProcesses((current) => ({
                          ...current,
                          [message.id]: !current[message.id],
                        }));
                      }}
                      type="button"
                    >
                      <span>{openProcesses[message.id] ? '隐藏过程' : '查看过程'}</span>
                      {message.processPending ? <em>实时更新中</em> : null}
                    </button>
                    {openProcesses[message.id] ? (
                      <div className="thread-message-process-body">
                        <MarkdownMessage text={message.processText} />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
