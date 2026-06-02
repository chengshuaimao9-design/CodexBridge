'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { usePathname } from 'next/navigation';
import { SessionSidebar } from '@/components/session-sidebar';
import { WorkspaceShell } from '@/components/workspace-shell';
import type { WebCodexThreadSummary } from '@/lib/server/queries';

const SIDEBAR_OPEN_STORAGE_KEY = 'codexbridge-web-sidebar-open';
const SIDEBAR_WIDTH_STORAGE_KEY = 'codexbridge-web-sidebar-width';
const DEFAULT_SIDEBAR_WIDTH = 284;
const MIN_SIDEBAR_WIDTH = 224;
const MAX_SIDEBAR_WIDTH = 420;

type ThreadListResponse = {
  data: WebCodexThreadSummary[];
};

type CodexWorkspaceContextValue = {
  activeThreadId: string | null;
  refreshThreads: () => Promise<void>;
  setThreads: Dispatch<SetStateAction<WebCodexThreadSummary[]>>;
  sidebarOpen: boolean;
  sidebarWidth: number;
  threads: WebCodexThreadSummary[];
  toggleSidebar: () => void;
};

const CodexWorkspaceContext = createContext<CodexWorkspaceContextValue | null>(null);

function clampSidebarWidth(value: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value));
}

function parseActiveThreadId(pathname: string | null) {
  if (!pathname) {
    return null;
  }
  const match = pathname.match(/^\/sessions\/codex\/([^/]+)$/u);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
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
      || leftThread.folderKey !== rightThread.folderKey
      || leftThread.folderLabel !== rightThread.folderLabel
      || leftThread.folderPinned !== rightThread.folderPinned
      || leftThread.folderRemoved !== rightThread.folderRemoved
    ) {
      return false;
    }
  }
  return true;
}

export function CodexWorkspaceProvider({
  children,
  initialThreads,
}: {
  children: ReactNode;
  initialThreads: WebCodexThreadSummary[];
}) {
  const pathname = usePathname();
  const activeThreadId = parseActiveThreadId(pathname);
  const [threads, setThreads] = useState<WebCodexThreadSummary[]>(initialThreads);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  useEffect(() => {
    const savedOpen = window.localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY);
    if (savedOpen === '0') {
      setSidebarOpen(false);
    } else {
      setSidebarOpen(true);
    }

    const savedWidth = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    if (Number.isFinite(savedWidth) && savedWidth > 0) {
      setSidebarWidth(clampSidebarWidth(savedWidth));
    }
  }, []);

  useEffect(() => {
    setThreads((current) => (areThreadListsEqual(current, initialThreads) ? current : initialThreads));
  }, [initialThreads]);

  const refreshThreads = useCallback(async () => {
    try {
      const response = await fetch('/api/codex-threads', { cache: 'no-store' });
      const payload = response.ok
        ? await response.json() as ThreadListResponse
        : { data: [] };
      const nextThreads = payload.data ?? [];
      setThreads((current) => (areThreadListsEqual(current, nextThreads) ? current : nextThreads));
    } catch {
      setThreads((current) => current);
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const handleSidebarWidthChange = useCallback((nextWidth: number) => {
    const clamped = clampSidebarWidth(nextWidth);
    setSidebarWidth(clamped);
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped));
  }, []);

  const value = useMemo<CodexWorkspaceContextValue>(() => ({
    activeThreadId,
    refreshThreads,
    setThreads,
    sidebarOpen,
    sidebarWidth,
    threads,
    toggleSidebar,
  }), [activeThreadId, refreshThreads, sidebarOpen, sidebarWidth, threads, toggleSidebar]);

  return (
    <CodexWorkspaceContext.Provider value={value}>
      <WorkspaceShell
        onSidebarWidthChange={handleSidebarWidthChange}
        sidebar={(
          <SessionSidebar
            activeThreadId={activeThreadId}
            onToggleSidebar={toggleSidebar}
            onThreadsChanged={refreshThreads}
            sessions={threads}
          />
        )}
        sidebarOpen={sidebarOpen}
        sidebarWidth={sidebarWidth}
      >
        {children}
      </WorkspaceShell>
    </CodexWorkspaceContext.Provider>
  );
}

export function useCodexWorkspace() {
  const context = useContext(CodexWorkspaceContext);
  if (!context) {
    throw new Error('useCodexWorkspace must be used within CodexWorkspaceProvider');
  }
  return context;
}
