import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CODEX_GATEWAY_DOES_NOT_OWN,
  CODEX_GATEWAY_OWNS,
  CODEX_GATEWAY_PACKAGE_NAME,
  CODEX_GATEWAY_PACKAGE_PHASE,
} from '../src/index.js';

test('codex gateway package exposes the migration boundary contract', () => {
  assert.equal(CODEX_GATEWAY_PACKAGE_NAME, '@codexbridge/codex-gateway');
  assert.equal(CODEX_GATEWAY_PACKAGE_PHASE, 'phase-4-contracts');
  assert.ok(CODEX_GATEWAY_OWNS.includes('responses-to-chat-conversion'));
  assert.ok(CODEX_GATEWAY_OWNS.includes('local-codex-gateway-server'));
  assert.ok(CODEX_GATEWAY_DOES_NOT_OWN.includes('wechat-transport'));
  assert.ok(CODEX_GATEWAY_DOES_NOT_OWN.includes('assistant-records'));
});
