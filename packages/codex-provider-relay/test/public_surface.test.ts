import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  assessCodexGatewayProtocolBoundary,
  createCodexProviderRelayStandaloneServerConfigFromEnv,
  createCodexProviderRelayStandaloneServerFromEnv,
  CODEX_PROVIDER_RELAY_DOES_NOT_OWN,
  CODEX_PROVIDER_RELAY_OWNS,
  CODEX_PROVIDER_RELAY_PACKAGE_NAME,
  CODEX_PROVIDER_RELAY_PACKAGE_PHASE,
  CODEX_PROVIDER_RELAY_RELEASE_CHANNEL,
  loadCodexProviderRelayStandaloneEnvFile,
  resolveCodexProviderRelayStandaloneServerEnv,
} from '../src/index.js';

test('codex provider relay package exposes the unified relay boundary contract', () => {
  assert.equal(CODEX_PROVIDER_RELAY_PACKAGE_NAME, '@codexbridge/codex-provider-relay');
  assert.equal(CODEX_PROVIDER_RELAY_PACKAGE_PHASE, 'phase-6-unified-relay-package');
  assert.equal(CODEX_PROVIDER_RELAY_RELEASE_CHANNEL, 'internal-only');
  assert.ok(CODEX_PROVIDER_RELAY_OWNS.includes('codex-provider-config'));
  assert.ok(CODEX_PROVIDER_RELAY_OWNS.includes('responses-to-chat-conversion'));
  assert.ok(CODEX_PROVIDER_RELAY_OWNS.includes('local-responses-adapter-server'));
  assert.ok(CODEX_PROVIDER_RELAY_DOES_NOT_OWN.includes('codex-native-api'));
  assert.ok(CODEX_PROVIDER_RELAY_DOES_NOT_OWN.includes('wechat-transport'));
  assert.ok(CODEX_PROVIDER_RELAY_DOES_NOT_OWN.includes('assistant-records'));
  assert.equal(assessCodexGatewayProtocolBoundary('openai-chat-compatible').strategy, 'responses-to-chat-direct');
});

test('codex provider relay package metadata stays internal-only while the boundary stabilizes', () => {
  const packageJsonPath = path.resolve(import.meta.dirname, '../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    bin?: Record<string, string>;
    private?: boolean;
    exports?: Record<string, unknown>;
    files?: string[];
  };

  assert.equal(packageJson.private, true);
  assert.deepEqual(Object.keys(packageJson.exports ?? {}).sort(), ['.', './package.json']);
  assert.equal(packageJson.bin?.['codex-provider-relay-server'], './dist/cli.js');
  assert.equal(packageJson.bin?.['codex-gateway-server'], './dist/cli.js');
  assert.deepEqual(packageJson.files, ['dist', 'README.md', 'docs', 'examples']);
});

test('codex provider relay package metadata and build layout stay aligned', () => {
  const packageJsonPath = path.resolve(import.meta.dirname, '../package.json');
  const tsconfigPath = path.resolve(import.meta.dirname, '../tsconfig.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
    bin?: Record<string, string>;
    exports?: Record<string, { types?: string; default?: string } | string>;
    files?: string[];
  };
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8')) as {
    compilerOptions?: { outDir?: string; rootDir?: string };
  };

  assert.equal(tsconfig.compilerOptions?.rootDir, 'src');
  assert.equal(tsconfig.compilerOptions?.outDir, 'dist');
  assert.equal((packageJson.exports?.['.'] as { types?: string })?.types, './dist/index.d.ts');
  assert.equal((packageJson.exports?.['.'] as { default?: string })?.default, './dist/index.js');
  assert.equal(packageJson.bin?.['codex-provider-relay-server'], './dist/cli.js');
  assert.equal(packageJson.bin?.['codex-gateway-server'], './dist/cli.js');
  assert.deepEqual(packageJson.files, ['dist', 'README.md', 'docs', 'examples']);
});

test('codex provider relay root entrypoint exports profile and protocol surfaces', () => {
  const indexPath = path.resolve(import.meta.dirname, '../src/index.ts');
  const source = fs.readFileSync(indexPath, 'utf8');

  assert.match(source, /export \* from '\.\/codex_config\.js'/);
  assert.match(source, /export \* from '\.\/builtin-tools\/index\.js'/);
  assert.match(source, /export \* from '\.\/code_interpreter_executor\.js'/);
  assert.match(source, /export \* from '\.\/computer_executor\.js'/);
  assert.match(source, /export \* from '\.\/image_generation_executor\.js'/);
  assert.match(source, /export \* from '\.\/runtime\.js'/);
  assert.match(source, /export \{\s*[\s\S]*getOpenAICompatibleProviderPreset/);
  assert.match(source, /export type \{\s*[\s\S]*OpenAICompatibleProviderCapabilities/);
  assert.match(source, /export \{\s*[\s\S]*OpenAICompatibleResponsesAdapterServer/);
  assert.match(source, /CodexProviderRelayTraceEvent/);
  assert.match(source, /createCodexProviderRelayStandaloneServerConfigFromEnv/);
  assert.match(source, /createCodexProviderRelayStandaloneServerFromEnv/);
  assert.match(source, /loadCodexProviderRelayStandaloneEnvFile/);
  assert.match(source, /resolveCodexProviderRelayStandaloneServerEnv/);

  assert.equal(typeof createCodexProviderRelayStandaloneServerConfigFromEnv, 'function');
  assert.equal(typeof createCodexProviderRelayStandaloneServerFromEnv, 'function');
  assert.equal(typeof loadCodexProviderRelayStandaloneEnvFile, 'function');
  assert.equal(typeof resolveCodexProviderRelayStandaloneServerEnv, 'function');
});

test('codex provider relay package includes public examples and package readiness docs', () => {
  const packageRoot = path.resolve(import.meta.dirname, '..');
  const requiredFiles = [
    'docs/OPENAI_BUILTIN_TOOL_COMPATIBILITY.md',
    'docs/INDEPENDENT_PACKAGE_CHECKLIST.md',
    'docs/LIVE_SMOKE_RECIPES.md',
    'docs/RELEASE_READINESS.md',
    'docs/RECIPES.md',
    'docs/UNSAFE_TOOL_SECURITY.md',
    'examples/mixed-openrouter-runtime.ts',
    'examples/relay-emulated-web-search.ts',
    'examples/relay-emulated-file-search-local-vector.ts',
    'examples/relay-emulated-image-generation.ts',
    'examples/relay-emulated-code-interpreter-custom-executor.ts',
    'examples/codexnext-integration.ts',
  ];

  for (const relativePath of requiredFiles) {
    assert.equal(fs.existsSync(path.join(packageRoot, relativePath)), true, `${relativePath} should exist`);
  }
});

test('codex provider relay release readiness docs keep unsafe tools disabled by default', () => {
  const packageRoot = path.resolve(import.meta.dirname, '..');
  const securityDoc = fs.readFileSync(path.join(packageRoot, 'docs/UNSAFE_TOOL_SECURITY.md'), 'utf8');
  const releaseDoc = fs.readFileSync(path.join(packageRoot, 'docs/RELEASE_READINESS.md'), 'utf8');
  const checklist = fs.readFileSync(path.join(packageRoot, 'docs/INDEPENDENT_PACKAGE_CHECKLIST.md'), 'utf8');

  assert.match(securityDoc, /No shell executor is bundled/u);
  assert.match(securityDoc, /No local computer controller is bundled/u);
  assert.match(securityDoc, /No code interpreter sandbox is bundled/u);
  assert.match(releaseDoc, /Keep `private: true`/u);
  assert.match(releaseDoc, /Final package name and npm scope/u);
  assert.match(checklist, /final public package name is intentionally not locked/u);
});
