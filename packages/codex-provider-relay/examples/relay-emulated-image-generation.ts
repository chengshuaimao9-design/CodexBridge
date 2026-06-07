import {
  CodexProviderRelayRuntime,
  createCodexProviderRelayImageGenerationExecutor,
  createCodexProviderRelayOpenAICompatibleImageGenerationProvider,
} from '@codexbridge/codex-provider-relay';

const imageGeneration = createCodexProviderRelayImageGenerationExecutor({
  generate: createCodexProviderRelayOpenAICompatibleImageGenerationProvider({
    apiKey: mustGetEnv('IMAGE_API_KEY'),
    endpoint: process.env.IMAGE_API_ENDPOINT,
    model: process.env.IMAGE_MODEL,
  }),
});

const runtime = new CodexProviderRelayRuntime({
  apiKey: mustGetEnv('OPENROUTER_API_KEY'),
  upstreamBaseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat',
  providerLabel: 'openrouter',
  profileMode: 'mixed',
  toolStrategy: 'relay-emulated',
  hostedTools: [{ name: 'image_generation', mode: 'relay-emulated' }],
  hostedToolExecutors: { image_generation: imageGeneration },
  emitHostedToolSseEvents: true,
});

await runtime.start();

function mustGetEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
