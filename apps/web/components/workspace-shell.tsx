'use client';

import { useEffect, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'codexbridge-web-sidebar-open';

type WorkspaceShellProps = {
  sidebar: ReactNode;
  children: ReactNode;
};

export function WorkspaceShell({ sidebar, children }: WorkspaceShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === '0') {
      setSidebarOpen(false);
      return;
    }
    if (saved === '1') {
      setSidebarOpen(true);
      return;
    }
    setSidebarOpen(true);
  }, []);

  function toggleSidebar() {
    setSidebarOpen((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }

  return (
    <section className={`workspace-shell${sidebarOpen ? ' sidebar-open' : ' sidebar-closed'}`}>
      <div className="workspace-shell-toolbar">
        <button
          aria-expanded={sidebarOpen}
          className="workspace-shell-toggle"
          onClick={toggleSidebar}
          type="button"
        >
          {sidebarOpen ? '隐藏目录' : '显示目录'}
        </button>
      </div>

      <div className="workspace-shell-body">
        <div className="workspace-shell-sidebar">{sidebar}</div>
        <div className="workspace-shell-main">{children}</div>
      </div>
    </section>
  );
}
