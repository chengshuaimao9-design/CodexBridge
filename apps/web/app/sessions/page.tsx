import { CodexSessionsShell } from '@/components/codex-sessions-shell';
import { listWebCodexThreads } from '@/lib/server/queries';

export const dynamic = 'force-dynamic';

export default async function SessionsPage() {
  const initialThreads = await listWebCodexThreads();
  return <CodexSessionsShell initialThreads={initialThreads} />;
}
