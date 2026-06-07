import {
  CodexProviderRelayRuntime,
  createCodexProviderRelayCodeInterpreterExecutor,
} from '@codexbridge/codex-provider-relay';

const codeInterpreter = createCodexProviderRelayCodeInterpreterExecutor({
  async execute(request) {
    await request.emitStdout('custom sandbox received code\n');
    return {
      stdout: `language=${request.language ?? 'unknown'}\n`,
      result: {
        // Replace this with a real host-owned sandbox. The relay package does
        // not execute arbitrary code by default.
        accepted: true,
        codeBytes: Buffer.byteLength(request.code, 'utf8'),
      },
      files: [],
    };
  },
});

const runtime = new CodexProviderRelayRuntime({
  apiKey: mustGetEnv('OPENROUTER_API_KEY'),
  upstreamBaseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat',
  providerLabel: 'openrouter',
  profileMode: 'mixed',
  toolStrategy: 'relay-emulated',
  hostedTools: [{ name: 'code_interpreter', mode: 'relay-emulated' }],
  hostedToolExecutors: { code_interpreter: codeInterpreter },
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
