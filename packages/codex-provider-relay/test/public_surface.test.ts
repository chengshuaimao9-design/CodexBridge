import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  assessCodexGatewayProtocolBoundary,
  CODEX_PROVIDER_RELAY_DOES_NOT_OWN,
  CODEX_PROVIDER_RELAY_OWNS,
  CODEX_PROVIDER_RELAY_PACKAGE_NAME,
  CODEX_PROVIDER_RELAY_PACKAGE_PHASE,
  CODEX_PROVIDER_RELAY_RELEASE_CHANNEL,
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
  assert.deepEqual(packageJson.files, ['dist', 'README.md', 'docs']);
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
  assert.deepEqual(packageJson.files, ['dist', 'README.md', 'docs']);
});

test('codex provider relay root entrypoint exports profile and protocol surfaces', () => {
  const indexPath = path.resolve(import.meta.dirname, '../src/index.ts');
  const source = fs.readFileSync(indexPath, 'utf8');

  assert.match(source, /export \* from '\.\/codex_config\.js'/);
  assert.match(source, /export \* from '\.\/runtime\.js'/);
  assert.match(source, /export \{\s*[\s\S]*getOpenAICompatibleProviderPreset/);
  assert.match(source, /export type \{\s*[\s\S]*OpenAICompatibleProviderCapabilities/);
  assert.match(source, /export \{\s*[\s\S]*OpenAICompatibleResponsesAdapterServer/);
});
