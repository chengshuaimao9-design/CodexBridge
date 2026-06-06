# Codex Provider Relay Target

## Immutable Target

Let non-OpenAI models participate in the Codex native tool-call loop.

This target is intentionally narrower than "support more providers" and broader than "proxy chat completions":

- Codex app-server must still own thread orchestration, approvals, local tools, workspace mutations, and continuation.
- The relay must preserve the Responses API shape Codex expects.
- The relay must translate provider tool calls back into Codex-compatible Responses events.
- The relay must make hosted-tool gaps explicit instead of silently dropping capabilities.

## Architecture Boundary

```text
CodexBridge / CodexNext / future app-server UI
  -> codex-provider-relay package
     -> codex-gateway protocol conversion
     -> upstream provider client
  -> Codex app-server
```

`codex-provider-relay` is the integration SDK. It may depend on protocol conversion from `codex-gateway`, but it must not depend on CodexBridge platform adapters, Web UI components, session stores, or provider-specific UI state.

`codex-native-api` remains separate. It exposes logged-in Codex runtime behavior as an API facade; it is not the provider relay.

## Required Modes

### Codex Auth Compatible

The relay should support the Codex++-style provider configuration:

```toml
model_provider = "custom"
model = "gpt-5.4"

[model_providers.custom]
name = "custom"
wire_api = "responses"
requires_openai_auth = true
base_url = "http://127.0.0.1:57321/v1"
experimental_bearer_token = "sk-..."
supports_websockets = false
```

This mode is the canonical path for preserving Codex-native behavior while redirecting model requests.

### API Key Compatible

The relay may also keep the existing OpenAI-compatible fallback:

```toml
requires_openai_auth = false
env_key = "OPENAI_API_KEY"
```

This mode is useful for compatibility, but it is not the long-term default for full Codex tool-loop parity.

## Tool Strategy Contract

### `codex-local-first`

Default. Codex remains the executor for local tools and approvals. The relay translates tool declarations and tool-call events so non-OpenAI models can request Codex tools.

### `provider-native`

Only for upstream providers that truly support a hosted tool capability. The relay may forward provider-native tool options when declared in provider capabilities.

### `relay-emulated`

For capabilities such as web search or file search when the upstream provider does not natively support them. The relay or an attached MCP/search/file service must execute the tool and feed results back into the model loop.

## Migration Plan

1. Establish this package with the fixed target, config builders, and public types.
2. Move Codex app-server provider config generation out of `src/providers/openai_compatible/plugin.ts`.
3. Wrap the existing `OpenAICompatibleResponsesAdapterServer` through this package instead of instantiating it directly from CodexBridge provider code.
4. Add Codex++ compatible auth mode using `requires_openai_auth = true`.
5. Add contract tests for `function_call`, `custom_tool_call`, `namespace`, `apply_patch`, `web_search`, and streaming tool deltas.
6. Switch CodexBridge provider code to consume this package.
7. Allow CodexNext to consume the same package without importing CodexBridge internals.
