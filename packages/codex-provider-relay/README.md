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

This package currently defines the fixed target, tool strategy types, and Codex provider config builders. The next implementation phase will move the existing OpenAI-compatible app-server launch path from CodexBridge into this package and reuse `packages/codex-gateway` for protocol conversion.

See [docs/TARGET.md](docs/TARGET.md) for the locked target and phased migration plan.
