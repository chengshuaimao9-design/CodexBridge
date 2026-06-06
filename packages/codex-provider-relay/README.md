# Codex Provider Relay

`@codexbridge/codex-provider-relay` is the reusable relay SDK for CodexBridge, CodexNext, and future Codex app-server projects.

## Fixed Goal

Let non-OpenAI models participate in the Codex native tool-call loop.

This package exists so DeepSeek, OpenRouter, Claude-compatible relays, and other OpenAI-compatible upstreams can be used by Codex app-server while preserving the Codex loop:

```text
Codex app-server
  -> Responses API request and SSE events
  -> codex-provider-relay
  -> upstream provider API
  -> translated Responses events
  -> Codex local tool execution and continuation
```

## Non-Goals

- Do not merge `codex-gateway` and `codex-native-api`.
- Do not move BridgeSession, platform adapters, or Web UI state into this package.
- Do not pretend every upstream provider has OpenAI hosted tools.
- Do not hardcode CodexBridge-specific runtime state.

## Canonical Strategy

The default strategy is `codex-local-first`.

Codex app-server remains responsible for local tools, approvals, workspace operations, MCP tools, and continuation orchestration. The relay is responsible for model protocol compatibility and tool-call event translation.

Provider-native tools and relay-emulated tools are explicit opt-ins:

- `codex-local-first`: keep Codex as the tool executor and translate model tool calls.
- `provider-native`: forward provider-supported hosted tools when the upstream truly supports them.
- `relay-emulated`: implement missing hosted tools in the relay or via MCP/search/file services.

## First Stable Surface

This package currently defines the fixed target, tool strategy types, protocol-aware Codex provider config builders, and Codex++-style local proxy URL helpers.

For `responses` upstreams, Codex provider `base_url` points at the upstream Responses endpoint. For `chat-completions` upstreams, Codex provider `base_url` points at the local Responses proxy, while the third-party Chat Completions endpoint remains relay-owned configuration. This is required so the Codex native tool-call loop passes through `packages/codex-gateway` instead of bypassing conversion.

The existing OpenAI-compatible Codex launch args now reuse this package. The next implementation phase will move the adapter server lifecycle wrapper from CodexBridge into this package and continue reusing `packages/codex-gateway` for protocol conversion.

See [docs/TARGET.md](docs/TARGET.md) for the locked target and phased migration plan.

See [docs/CODEX_PLUS_PLUS_CONVERSION_PORTING.md](docs/CODEX_PLUS_PLUS_CONVERSION_PORTING.md) for the detailed Codex++ protocol conversion porting checklist.
