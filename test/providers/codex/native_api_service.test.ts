import assert from 'node:assert/strict';
import test from 'node:test';
import { CodexNativeApiService } from '../../../src/providers/codex/native_api_service.js';
import { CodexNativeRuntime } from '../../../src/providers/codex/native_runtime.js';

function makeProfile(overrides = {}) {
  return {
    id: 'openai-default',
    providerKind: 'openai-native',
    displayName: 'Codex OpenAI',
    config: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeProviderProfiles(profiles: any[]) {
  return {
    get(id: string) {
      return profiles.find((profile) => profile.id === id) ?? null;
    },
    list() {
      return [...profiles];
    },
  };
}

test('CodexNativeApiService starts a standalone localhost server against the selected provider profile', async () => {
  const runtime = new CodexNativeRuntime({
    now: () => 111,
    readAccountIdentity: () => ({
      email: 'native@example.com',
      name: 'Native Runtime',
      authMode: 'chatgpt',
      accountId: 'acc_native',
      plan: 'plus',
      authPath: '/tmp/native-api-auth.json',
    }),
  });
  const service = new CodexNativeApiService({
    runtime,
    providerProfiles: makeProviderProfiles([makeProfile()]) as any,
    providerRegistry: {
      getProvider() {
        return {
          async listModels() {
            return [{
              id: 'gpt-5.4',
              model: 'gpt-5.4',
              displayName: 'GPT-5.4',
              description: 'Frontier coding model.',
              isDefault: true,
              supportedReasoningEfforts: ['medium', 'high'],
              defaultReasoningEffort: 'medium',
            }];
          },
        } as any;
      },
    } as any,
    authPath: '/tmp/native-api-auth.json',
  });

  assert.deepEqual(service.describeBinding(), {
    providerProfileId: 'openai-default',
    providerKind: 'openai-native',
    providerDisplayName: 'Codex OpenAI',
    authPath: '/tmp/native-api-auth.json',
  });

  await service.start();
  try {
    const response = await fetch(`${service.baseUrl}/v1/models`);
    const body = await response.json() as any;
    assert.equal(response.status, 200);
    assert.equal(body.meta.native_runtime.provider_profile_id, 'openai-default');
    assert.equal(body.meta.native_runtime.account_identity.account_id, 'acc_native');
  } finally {
    await service.stop();
  }
});

test('CodexNativeApiService rejects unknown provider profile overrides before startup', async () => {
  const service = new CodexNativeApiService({
    providerProfiles: makeProviderProfiles([makeProfile()]) as any,
    providerRegistry: {
      getProvider() {
        return {} as any;
      },
    } as any,
    providerProfileId: 'missing-profile',
  });

  await assert.rejects(
    () => service.start(),
    /Unknown Codex native API provider profile: missing-profile/,
  );
});
