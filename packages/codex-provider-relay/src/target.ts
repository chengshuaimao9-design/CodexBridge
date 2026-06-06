export const CODEX_PROVIDER_RELAY_TARGET =
  'Let non-OpenAI models participate in the Codex native tool-call loop.' as const;

export const CODEX_PROVIDER_RELAY_TARGET_ZH =
  '让非 OpenAI 模型也能参与 Codex 的原生工具调用闭环。' as const;

export const CODEX_PROVIDER_RELAY_INVARIANTS = [
  'Codex app-server remains the owner of threads, approvals, local tools, workspace mutations, and continuation.',
  'The relay preserves Codex Responses API semantics and translates provider tool calls back into Codex-compatible events.',
  'Hosted tool support must be explicit: provider-native or relay-emulated, never silently assumed.',
  'CodexBridge UI/session/platform state must stay outside this package.',
  'codex-gateway and codex-native-api remain separate packages with separate responsibilities.',
] as const;

export const CODEX_PROVIDER_RELAY_NON_GOALS = [
  'Merge codex-gateway and codex-native-api.',
  'Move BridgeSession or platform adapters into the relay package.',
  'Treat every upstream provider as if it supports OpenAI hosted tools.',
  'Hardcode CodexBridge-specific runtime state.',
] as const;
