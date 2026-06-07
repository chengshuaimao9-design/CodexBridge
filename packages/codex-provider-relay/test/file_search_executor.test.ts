import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createCodexProviderRelayFileSearchExecutor,
  type CodexProviderRelayFileSearchExecutorContent,
  type CodexProviderRelayFileSearchSource,
} from '../src/index.js';

async function createTempWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-provider-relay-file-search-'));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.mkdir(path.join(root, 'node_modules', 'ignored'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'agent.ts'), [
    'export function runAgent() {',
    '  return "Codex relay file search target";',
    '}',
  ].join('\n'));
  await fs.writeFile(path.join(root, 'src', 'notes.md'), [
    '# Notes',
    'The bridge supports hosted file search snippets.',
  ].join('\n'));
  await fs.writeFile(path.join(root, 'node_modules', 'ignored', 'ignored.ts'), 'file search target in ignored dependency');
  await fs.writeFile(path.join(root, 'image.png'), '\0not text');
  return root;
}

function baseRequest(argumentsValue: Record<string, any>) {
  return {
    toolName: 'file_search' as const,
    relayToolName: 'relay_file_search',
    callId: 'call_file_search_1',
    arguments: argumentsValue,
    rawArguments: JSON.stringify(argumentsValue),
    model: 'example-model',
    providerKind: 'openai-compatible',
    providerName: 'Example',
  };
}

test('local file_search executor returns snippets from explicit roots only', async () => {
  const root = await createTempWorkspace();
  const deltas: any[] = [];
  const executor = createCodexProviderRelayFileSearchExecutor({
    roots: [root],
    maxResults: 5,
    snippetLines: 1,
  });

  const result = await executor({
    ...baseRequest({
      query: 'Codex relay target',
      path_glob: 'src/*',
    }),
    emitDelta: async (delta, metadata) => {
      deltas.push({ delta, metadata });
    },
  });
  const content = result.content as CodexProviderRelayFileSearchExecutorContent;

  assert.equal(content.provider, 'local-fs');
  assert.equal(content.query, 'Codex relay target');
  assert.equal(content.results.length, 1);
  assert.equal(content.results[0].path, 'src/agent.ts');
  assert.match(content.results[0].snippets.map((snippet) => snippet.text).join('\n'), /file search target/u);
  assert.equal(content.results.some((entry) => entry.path.includes('node_modules')), false);
  assert.equal(deltas.some((entry) => entry.delta === 'scanning roots'), true);
  assert.equal(deltas.some((entry) => entry.delta === 'file matched'), true);
});

test('local file_search executor can omit snippet content', async () => {
  const root = await createTempWorkspace();
  const executor = createCodexProviderRelayFileSearchExecutor({
    roots: [root],
    includeContent: false,
    maxResults: 1,
  });

  const result = await executor(baseRequest({
    query: 'hosted file search',
  }));
  const content = result.content as CodexProviderRelayFileSearchExecutorContent;

  assert.ok(content.results.length >= 1);
  assert.equal(content.results.every((result) => result.snippets.length === 0), true);
});

test('file_search executor aggregates explicit sources without host coupling', async () => {
  const root = await createTempWorkspace();
  const memorySource: CodexProviderRelayFileSearchSource = {
    name: 'memory-documents',
    type: 'memory-documents',
    async search(request) {
      await request.emitDelta?.('memory source searched', {
        query: request.query,
      });
      return {
        results: [{
          title: 'Memory doc',
          uri: 'memory://doc-1',
          path: 'memory/doc-1.md',
          score: 99,
          snippets: [{
            line: 1,
            text: 'A memory document about hosted file search.',
          }],
        }],
      };
    },
  };
  const deltas: any[] = [];
  const executor = createCodexProviderRelayFileSearchExecutor({
    sources: [
      memorySource,
      {
        type: 'local-fs',
        name: 'workspace',
        roots: [root],
      },
    ],
    maxResults: 5,
  });

  const result = await executor({
    ...baseRequest({
      query: 'hosted file search',
    }),
    emitDelta: async (delta, metadata) => {
      deltas.push({ delta, metadata });
    },
  });
  const content = result.content as CodexProviderRelayFileSearchExecutorContent;

  assert.equal(content.provider, 'multi-source');
  assert.equal(content.sourceCount, 2);
  assert.equal(content.results[0].source, 'memory-documents');
  assert.equal(content.results.some((entry) => entry.source === 'workspace'), true);
  assert.equal(deltas.some((entry) => entry.delta === 'searching source'), true);
  assert.equal(deltas.some((entry) => entry.delta === 'memory source searched'), true);
});

test('file_search executor applies total payload bounds across sources', async () => {
  const largeSource: CodexProviderRelayFileSearchSource = {
    name: 'large-source',
    type: 'memory-documents',
    search() {
      return {
        results: Array.from({ length: 5 }, (_, index) => ({
          title: `Large ${index}`,
          uri: `memory://large-${index}`,
          path: `large-${index}.md`,
          score: 50 - index,
          snippets: [{
            line: 1,
            text: 'x'.repeat(1_000),
          }],
        })),
      };
    },
  };
  const executor = createCodexProviderRelayFileSearchExecutor({
    sources: [largeSource],
    maxResults: 5,
    maxPayloadBytes: 1_200,
  });

  const result = await executor(baseRequest({
    query: 'large payload',
  }));
  const content = result.content as CodexProviderRelayFileSearchExecutorContent;

  assert.ok(content.results.length >= 1);
  assert.ok(content.results.length < 5);
});

test('local file_search executor requires explicit roots', () => {
  assert.throws(
    () => createCodexProviderRelayFileSearchExecutor({ roots: [] }),
    /requires at least one source or explicit root/u,
  );
  assert.throws(
    () => createCodexProviderRelayFileSearchExecutor({
      sources: [{
        type: 'local-fs',
        roots: [],
      }],
    }),
    /local-fs source requires at least one explicit root/u,
  );
});
