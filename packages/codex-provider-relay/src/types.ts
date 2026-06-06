export type CodexProviderRelayAuthMode =
  | 'codex-auth-compatible'
  | 'api-key-compatible';

export type CodexProviderRelayToolStrategy =
  | 'codex-local-first'
  | 'provider-native'
  | 'relay-emulated';

export type CodexProviderRelayTomlPrimitive = string | number | boolean;

export interface CodexProviderRelayTokenSource {
  experimentalBearerToken?: string | null;
  apiKeyEnv?: string | null;
}

export interface BuildCodexProviderRelayConfigInput extends CodexProviderRelayTokenSource {
  providerLabel: string;
  relayBaseUrl: string;
  defaultModel: string;
  providerName?: string | null;
  authMode?: CodexProviderRelayAuthMode | null;
  supportsWebsockets?: boolean | null;
  toolStrategy?: CodexProviderRelayToolStrategy | null;
  extraProviderFields?: Record<string, CodexProviderRelayTomlPrimitive | null | undefined> | null;
}

export interface CodexProviderRelayConfigEntry {
  key: string;
  value: CodexProviderRelayTomlPrimitive;
}

export interface CodexProviderRelayConfig {
  providerLabel: string;
  providerName: string;
  authMode: CodexProviderRelayAuthMode;
  toolStrategy: CodexProviderRelayToolStrategy;
  entries: CodexProviderRelayConfigEntry[];
}
