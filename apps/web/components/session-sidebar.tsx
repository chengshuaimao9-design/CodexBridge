'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { WebCodexThreadSummary } from '@/lib/server/queries';

type SessionSidebarProps = {
  sessions: WebCodexThreadSummary[];
  activeThreadId?: string | null;
  onToggleSidebar?: () => void;
  onThreadsChanged?: () => Promise<void>;
};

type SessionGroup = {
  key: string;
  label: string;
  cwd: string | null;
  isPinned: boolean;
  sessions: WebCodexThreadSummary[];
};

const SIDEBAR_SCROLL_KEY = 'codexbridge-web-sidebar-scroll-top';

function getProjectLabel(cwd: string | null) {
  if (!cwd) {
    return '未归类';
  }
  const normalized = cwd.replace(/\/+$/u, '');
  const parts = normalized.split('/').filter(Boolean);
  const base = parts[parts.length - 1] ?? '';
  return base || normalized || '未归类';
}

function buildGroups(sessions: WebCodexThreadSummary[]) {
  const pinned = sessions.filter((session) => session.isPinned);
  const normal = sessions.filter((session) => !session.isPinned && !session.isArchived);
  const archived = sessions.filter((session) => session.isArchived);

  const map = new Map<string, SessionGroup>();
  for (const session of normal) {
    const key = session.folderKey?.trim() || session.cwd?.trim() || '__ungrouped__';
    const current = map.get(key);
    if (current) {
      current.sessions.push(session);
      current.isPinned = current.isPinned || session.folderPinned;
      if (!current.cwd && session.cwd) {
        current.cwd = session.cwd;
      }
      if (!current.label && session.folderLabel?.trim()) {
        current.label = session.folderLabel.trim();
      }
      continue;
    }
    map.set(key, {
      key,
      label: session.folderLabel?.trim() || getProjectLabel(session.cwd),
      cwd: session.cwd,
      isPinned: session.folderPinned,
      sessions: [session],
    });
  }

  const groups: SessionGroup[] = Array.from(map.values())
    .map((group) => ({
      ...group,
      sessions: group.sessions.sort((left, right) => right.updatedAt - left.updatedAt),
    }))
    .sort((left, right) => {
      if (left.isPinned !== right.isPinned) {
        return left.isPinned ? -1 : 1;
      }
      return left.label.localeCompare(right.label, 'zh-CN');
    });

  return {
    pinned: pinned.sort((left, right) => right.updatedAt - left.updatedAt),
    groups,
    archived: archived.sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 10),
  };
}

function SessionEntry({
  session,
  active,
  onNavigate,
}: {
  session: WebCodexThreadSummary;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={`sidebar-session-entry${active ? ' active' : ''}`}
      onClick={() => {
        onNavigate?.();
      }}
      title={session.title}
      type="button"
    >
      <span className="sidebar-session-title">{session.title}</span>
    </button>
  );
}

export function SessionSidebar({
  sessions,
  activeThreadId = null,
  onToggleSidebar,
  onThreadsChanged,
}: SessionSidebarProps) {
  const router = useRouter();
  const { pinned, groups, archived } = buildGroups(sessions);
  const [openGroupMenu, setOpenGroupMenu] = useState<string | null>(null);
  const [creatingCwd, setCreatingCwd] = useState<string | null>(null);
  const [folderActioningKey, setFolderActioningKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const restoredScrollRef = useRef(false);

  useEffect(() => {
    function handlePointer(event: MouseEvent) {
      if (!menuRef.current) {
        return;
      }
      if (event.target instanceof Node && !menuRef.current.contains(event.target)) {
        setOpenGroupMenu(null);
      }
    }
    if (!openGroupMenu) {
      return;
    }
    window.addEventListener('mousedown', handlePointer);
    return () => window.removeEventListener('mousedown', handlePointer);
  }, [openGroupMenu]);

  useEffect(() => {
    if (restoredScrollRef.current) {
      return;
    }
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) {
      return;
    }
    const raw = window.sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    const nextScrollTop = raw ? Number(raw) : 0;
    if (Number.isFinite(nextScrollTop) && nextScrollTop > 0) {
      scrollContainer.scrollTop = nextScrollTop;
    }
    restoredScrollRef.current = true;
  }, [sessions.length]);

  function persistSidebarScroll() {
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    window.sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(scrollTop));
  }

  async function createThreadForFolder(cwd: string | null) {
    if (!cwd || creatingCwd) {
      return;
    }
    setCreatingCwd(cwd);
    setOpenGroupMenu(null);
    try {
      const response = await fetch('/api/codex-folders/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; threadId?: string; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.threadId) {
        window.alert((payload?.error && String(payload.error).trim()) || '创建会话失败');
        return;
      }
      await onThreadsChanged?.();
      persistSidebarScroll();
      router.push(`/sessions/codex/${encodeURIComponent(payload.threadId)}`, { scroll: false });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '创建会话失败');
    } finally {
      setCreatingCwd(null);
    }
  }

  async function applyFolderAction(
    group: SessionGroup,
    action: 'pin' | 'unpin' | 'rename' | 'archive' | 'remove',
  ) {
    const cwd = group.cwd?.trim();
    if (!cwd || folderActioningKey) {
      return;
    }

    let value: string | null | undefined;
    if (action === 'rename') {
      const nextName = window.prompt('输入新的文件夹显示名称', group.label);
      if (nextName === null) {
        return;
      }
      value = nextName.trim();
    }

    if (action === 'archive') {
      const confirmed = window.confirm(`归档“${group.label}”下的全部对话？`);
      if (!confirmed) {
        return;
      }
    }

    if (action === 'remove') {
      const confirmed = window.confirm(`从侧栏移除“${group.label}”？`);
      if (!confirmed) {
        return;
      }
    }

    setFolderActioningKey(group.key);
    setOpenGroupMenu(null);
    try {
      const response = await fetch('/api/codex-folders/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cwd,
          action,
          value,
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        window.alert((payload?.error && String(payload.error).trim()) || '操作失败');
        return;
      }
      await onThreadsChanged?.();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '操作失败');
    } finally {
      setFolderActioningKey(null);
    }
  }

  return (
    <aside className="workspace-sidebar">
      <div className="workspace-sidebar-top">
        <div className="workspace-sidebar-brand-row">
          <h1 className="workspace-sidebar-brand">CodexBridge</h1>
          <button
            aria-label="收起目录"
            className="workspace-sidebar-collapse"
            onClick={onToggleSidebar}
            type="button"
          >
            <span aria-hidden="true">⟨</span>
          </button>
        </div>
        <div className="workspace-sidebar-shortcuts">
          <Link className="workspace-sidebar-shortcut workspace-sidebar-shortcut-primary" href="/sessions" scroll={false}>
            <img alt="" aria-hidden="true" className="workspace-sidebar-shortcut-icon" src="/icons/new-thread.svg" />
            <span>新聊天</span>
          </Link>
          <button className="workspace-sidebar-shortcut" disabled type="button">
            <span aria-hidden="true">⌕</span>
            <span>搜索聊天</span>
          </button>
        </div>
      </div>

      <div className="workspace-sidebar-scroll" onScroll={persistSidebarScroll} ref={scrollRef}>
        {pinned.length > 0 ? (
          <section className="sidebar-section">
            <h2 className="sidebar-section-title">置顶</h2>
            <div className="sidebar-session-list">
              {pinned.map((session) => (
                <SessionEntry
                  key={session.threadId}
                  active={session.threadId === activeThreadId}
                  onNavigate={() => {
                    persistSidebarScroll();
                    router.push(session.href, { scroll: false });
                  }}
                  session={session}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="sidebar-section">
          <h2 className="sidebar-section-title">项目</h2>
          <div className="sidebar-project-groups">
            {groups.length === 0 ? (
              <div className="sidebar-empty">当前没有可展示的 Codex 会话。</div>
            ) : (
              groups.map((group) => (
                <details className="sidebar-project-group" key={group.key} open>
                  <summary className="sidebar-project-header">
                    <span aria-hidden="true" className="sidebar-folder-icon" />
                    <span className="sidebar-project-label">{group.label}</span>
                    <div
                      className="sidebar-project-actions"
                      data-open={openGroupMenu === group.key ? 'true' : 'false'}
                      onClick={(event) => event.preventDefault()}
                    >
                      <div className="sidebar-project-menu" ref={openGroupMenu === group.key ? menuRef : null}>
                        <button
                          aria-expanded={openGroupMenu === group.key}
                          aria-label={`${group.label} 更多操作`}
                          className="sidebar-project-action-button sidebar-project-action-more"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setOpenGroupMenu((current) => current === group.key ? null : group.key);
                          }}
                          title="更多操作"
                          type="button"
                        >
                          <img alt="" aria-hidden="true" className="sidebar-project-action-icon" src="/icons/more-horizontal.svg" />
                        </button>
                        {openGroupMenu === group.key ? (
                          <div className="sidebar-project-menu-popover">
                            <button
                              className="sidebar-project-menu-item"
                              disabled={folderActioningKey === group.key}
                              onClick={() => void applyFolderAction(group, group.isPinned ? 'unpin' : 'pin')}
                              type="button"
                            >
                              <span className="sidebar-project-menu-item-inner">
                                <img alt="" aria-hidden="true" className="sidebar-project-menu-item-icon" src="/icons/pin.svg" />
                                <span>{group.isPinned ? '取消置顶' : '置顶'}</span>
                              </span>
                            </button>
                            <button
                              className="sidebar-project-menu-item"
                              disabled={folderActioningKey === group.key}
                              onClick={() => void applyFolderAction(group, 'rename')}
                              type="button"
                            >
                              <span className="sidebar-project-menu-item-inner">
                                <img alt="" aria-hidden="true" className="sidebar-project-menu-item-icon" src="/icons/rename.svg" />
                                <span>重命名</span>
                              </span>
                            </button>
                            <button
                              className="sidebar-project-menu-item"
                              disabled={folderActioningKey === group.key}
                              onClick={() => void applyFolderAction(group, 'archive')}
                              type="button"
                            >
                              <span className="sidebar-project-menu-item-inner">
                                <img alt="" aria-hidden="true" className="sidebar-project-menu-item-icon" src="/icons/archive.svg" />
                                <span>归档</span>
                              </span>
                            </button>
                            <button
                              className="sidebar-project-menu-item danger"
                              disabled={folderActioningKey === group.key}
                              onClick={() => void applyFolderAction(group, 'remove')}
                              type="button"
                            >
                              <span className="sidebar-project-menu-item-inner">
                                <img alt="" aria-hidden="true" className="sidebar-project-menu-item-icon" src="/icons/remove.svg" />
                                <span>移除</span>
                              </span>
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <button
                        aria-label={`在 ${group.label} 下新建会话`}
                        className="sidebar-project-action-button"
                        disabled={creatingCwd === group.cwd}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void createThreadForFolder(group.cwd);
                        }}
                        title="在当前文件夹下新建会话"
                        type="button"
                      >
                        <img alt="" aria-hidden="true" className="sidebar-project-action-icon" src="/icons/new-thread.svg" />
                      </button>
                    </div>
                  </summary>
                  <div className="sidebar-session-list">
                    {group.sessions.map((session) => (
                      <SessionEntry
                        key={session.threadId}
                        active={session.threadId === activeThreadId}
                        onNavigate={() => {
                          persistSidebarScroll();
                          router.push(session.href, { scroll: false });
                        }}
                        session={session}
                      />
                    ))}
                  </div>
                </details>
              ))
            )}
          </div>
        </section>

        {archived.length > 0 ? (
          <section className="sidebar-section">
            <h2 className="sidebar-section-title">最近归档</h2>
            <div className="sidebar-session-list">
              {archived.map((session) => (
                <SessionEntry
                  key={session.threadId}
                  active={session.threadId === activeThreadId}
                  onNavigate={() => {
                    persistSidebarScroll();
                    router.push(session.href, { scroll: false });
                  }}
                  session={session}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div className="workspace-sidebar-footer">
        <a className="workspace-settings-link" href="/runtime">
          <span className="workspace-settings-icon">⚙</span>
          <span>设置</span>
        </a>
      </div>
    </aside>
  );
}
