import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCodexProviderRelayCliArgs,
  buildCodexProviderRelayConfig,
  buildCodexProviderRelayTomlFragment,
  normalizeProviderLabel,
} from '../src/index.js';

test('builds Codex auth compatible provider config by default', () => {
  const config = buildCodexProviderRelayConfig({
    providerLabel: 'Codex++ Relay',
    providerName: 'Codex++ Relay',
    relayBaseUrl: 'http://127.0.0.1:57321/v1/',
    defaultModel: 'deepseek-coder',
    experimentalBearerToken: 'sk-test',
  });

  assert.equal(config.providerLabel, 'Codex_Relay');
  assert.equal(config.authMode, 'codex-auth-compatible');
  assert.equal(config.toolStrategy, 'codex-local-first');
  assert.deepEqual(config.entries, [
    { key: 'model', value: 'deepseek-coder' },
    { key: 'model_provider', value: 'Codex_Relay' },
    { key: 'model_providers.Codex_Relay.name', value: 'Codex++ Relay' },
    { key: 'model_providers.Codex_Relay.base_url', value: 'http://127.0.0.1:57321/v1' },
    { key: 'model_providers.Codex_Relay.wire_api', value: 'responses' },
    { key: 'model_providers.Codex_Relay.requires_openai_auth', value: true },
    { key: 'model_providers.Codex_Relay.supports_websockets', value: false },
    { key: 'model_providers.Codex_Relay.experimental_bearer_token', value: 'sk-test' },
  ]);
});

test('builds api-key compatible fallback config', () => {
  const toml = buildCodexProviderRelayTomlFragment({
    providerLabel: 'openrouter',
    relayBaseUrl: 'http://127.0.0.1:41000/v1',
    defaultModel: 'openrouter/deepseek/deepseek-chat',
    authMode: 'api-key-compatible',
    apiKeyEnv: 'OPENROUTER_API_KEY',
  });

  assert.equal(toml, [
    'model = "openrouter/deepseek/deepseek-chat"',
    'model_provider = "openrouter"',
    '',
    '[model_providers.openrouter]',
    'name = "Codex Provider Relay"',
    'base_url = "http://127.0.0.1:41000/v1"',
    'wire_api = "responses"',
    'requires_openai_auth = false',
    'supports_websockets = false',
    'env_key = "OPENROUTER_API_KEY"',
    '',
  ].join('\n'));
});

test('builds CLI -c args from config entries', () => {
  const args = buildCodexProviderRelayCliArgs({
    providerLabel: 'relay',
    relayBaseUrl: 'http://127.0.0.1:57321/v1',
    defaultModel: 'gpt-5.4',
    extraProviderFields: {
      custom_field: 'enabled',
      priority: 3,
    },
  });

  assert.deepEqual(args.slice(0, 6), [
    '-c',
    'model="gpt-5.4"',
    '-c',
    'model_provider="relay"',
    '-c',
    'model_providers.relay.name="Codex Provider Relay"',
  ]);
  assert.ok(args.includes('model_providers.relay.requires_openai_auth=true'));
  assert.ok(args.includes('model_providers.relay.custom_field="enabled"'));
  assert.ok(args.includes('model_providers.relay.priority=3'));
});

test('normalizes provider labels for TOML path usage', () => {
  assert.equal(normalizeProviderLabel('123 deep seek'), 'provider_123_deep_seek');
  assert.equal(normalizeProviderLabel('deep-seek_v3'), 'deep-seek_v3');
});
