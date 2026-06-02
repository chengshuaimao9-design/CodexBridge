import { CodexSessionsShell } from '@/components/codex-sessions-shell';
import { getWebCodexThreadRecentMessages, listWebCodexThreads } from '@/lib/server/queries';

export const dynamic = 'force-dynamic';

export default async function CodexThreadDetailPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const [initialThreads, initialMessages] = await Promise.all([
    listWebCodexThreads(),
    getWebCodexThreadRecentMessages(threadId, 8),
  ]);

  return (
    <CodexSessionsShell
      activeThreadId={threadId}
      initialThreadHasMore={initialMessages.hasMore}
      initialThreadMessages={initialMessages.items}
      initialThreads={initialThreads}
    />
  );
}
