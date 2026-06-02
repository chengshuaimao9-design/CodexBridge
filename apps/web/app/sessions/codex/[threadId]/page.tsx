import { CodexThreadPane } from '@/components/codex-sessions-shell';
import { getWebCodexThreadRecentMessages } from '@/lib/server/queries';

export const dynamic = 'force-dynamic';

export default async function CodexThreadDetailPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const initialMessages = await getWebCodexThreadRecentMessages(threadId, 8);

  return (
    <CodexThreadPane
      initialThreadHasMore={initialMessages.hasMore}
      initialThreadMessages={initialMessages.items}
      threadId={threadId}
    />
  );
}
