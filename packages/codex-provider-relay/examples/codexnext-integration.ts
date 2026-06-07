import {
  CodexProviderRelayRuntime,
  type CodexProviderRelayRuntimeState,
} from '@codexbridge/codex-provider-relay';

export interface CodexNextRelayOptions {
  apiKey: string;
  upstreamBaseUrl: string;
  model: string;
  providerLabel: string;
  adapterHost?: string | null;
  adapterPort?: number | null;
}

export async function startCodexNextRelay(
  options: CodexNextRelayOptions,
): Promise<CodexProviderRelayRuntimeState> {
  const runtime = new CodexProviderRelayRuntime({
    apiKey: options.apiKey,
    upstreamBaseUrl: options.upstreamBaseUrl,
    defaultModel: options.model,
    providerLabel: options.providerLabel,
    profileMode: 'mixed',
    toolStrategy: 'codex-local-first',
    adapterHost: options.adapterHost ?? '127.0.0.1',
    adapterPort: options.adapterPort ?? 0,
  });

  return runtime.start();
}
