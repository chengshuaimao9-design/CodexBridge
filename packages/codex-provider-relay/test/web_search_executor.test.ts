import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCodexProviderRelayWebSearchExecutor,
  type CodexProviderRelayWebSearchExecutorContent,
} from '../src/index.js';

function baseRequest(argumentsValue: Record<string, any>) {
  return {
    toolName: 'web_search' as const,
    relayToolName: 'relay_web_search',
    callId: 'call_search_1',
    arguments: argumentsValue,
    rawArguments: JSON.stringify(argumentsValue),
    model: 'example-model',
    providerKind: 'openai-compatible',
    providerName: 'Example',
  };
}

test('Tavily web_search executor posts Bearer-authenticated search requests', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const executor = createCodexProviderRelayWebSearchExecutor({
    provider: 'tavily',
    apiKey: 'tvly-test',
    maxResults: 2,
    fetchImpl: (async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({
        answer: 'short answer',
        results: [{
          title: 'Result A',
          url: 'https://example.com/a',
          content: 'Snippet A',
          score: 0.9,
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch,
  });

  const result = await executor(baseRequest({
    query: 'codex relay',
    search_context_size: 'high',
  }));
  const body = JSON.parse(String(calls[0].init.body));

  assert.equal(calls[0].url, 'https://api.tavily.com/search');
  assert.equal((calls[0].init.headers as any).Authorization, 'Bearer tvly-test');
  assert.equal(body.query, 'codex relay');
  assert.equal(body.search_depth, 'advanced');
  const content = result.content as CodexProviderRelayWebSearchExecutorContent;
  assert.equal(content.provider, 'tavily');
  assert.equal(content.answer, 'short answer');
  assert.equal(content.results[0].url, 'https://example.com/a');
});

test('Brave web_search executor maps web.results into normalized results', async () => {
  const calls: string[] = [];
  const executor = createCodexProviderRelayWebSearchExecutor({
    provider: 'brave',
    apiKey: 'brave-test',
    maxResults: 3,
    country: 'us',
    language: 'en',
    fetchImpl: (async (url, init) => {
      calls.push(String(url));
      assert.equal((init?.headers as any)['X-Subscription-Token'], 'brave-test');
      return new Response(JSON.stringify({
        web: {
          results: [{
            title: 'Brave Result',
            url: 'https://example.com/brave',
            description: 'Brave snippet',
            page_age: '2026-06-07',
          }],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch,
  });

  const result = await executor(baseRequest({ query: 'brave query' }));
  const url = new URL(calls[0]);

  assert.equal(url.origin + url.pathname, 'https://api.search.brave.com/res/v1/web/search');
  assert.equal(url.searchParams.get('q'), 'brave query');
  assert.equal(url.searchParams.get('count'), '3');
  assert.equal(url.searchParams.get('country'), 'US');
  const content = result.content as CodexProviderRelayWebSearchExecutorContent;
  assert.equal(content.provider, 'brave');
  assert.equal(content.results[0].snippet, 'Brave snippet');
});

test('Serper web_search executor maps organic results and answer boxes', async () => {
  const calls: RequestInit[] = [];
  const executor = createCodexProviderRelayWebSearchExecutor({
    provider: 'serper',
    apiKey: 'serper-test',
    maxResults: 1,
    fetchImpl: (async (_url, init) => {
      calls.push(init ?? {});
      return new Response(JSON.stringify({
        answerBox: {
          answer: 'answer box',
        },
        organic: [{
          title: 'Serper Result',
          link: 'https://example.com/serper',
          snippet: 'Serper snippet',
          position: 1,
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch,
  });

  const result = await executor(baseRequest({ query: 'serper query' }));
  const body = JSON.parse(String(calls[0].body));

  assert.equal((calls[0].headers as any)['X-API-KEY'], 'serper-test');
  assert.equal(body.q, 'serper query');
  assert.equal(body.num, 1);
  const content = result.content as CodexProviderRelayWebSearchExecutorContent;
  assert.equal(content.provider, 'serper');
  assert.equal(content.answer, 'answer box');
  assert.equal(content.results[0].url, 'https://example.com/serper');
});
