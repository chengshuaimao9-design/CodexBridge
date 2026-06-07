import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createCodexProviderRelayFileSearchExecutor,
  createCodexProviderRelayMemoryFileSearchSource,
  createCodexProviderRelaySqliteFtsFileSearchSource,
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
  const memorySource = createCodexProviderRelayMemoryFileSearchSource({
    name: 'memory-documents',
    documents: [{
      id: 'doc-1',
      title: 'Memory doc',
      uri: 'memory://doc-1',
      path: 'memory/doc-1.md',
      content: 'A memory document about hosted file search.',
    }],
  });
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
  assert.equal(deltas.some((entry) => entry.delta === 'memory document matched'), true);
});

test('memory file_search source searches title and content with optional snippets', async () => {
  const executor = createCodexProviderRelayFileSearchExecutor({
    sources: [
      createCodexProviderRelayMemoryFileSearchSource({
        documents: [{
          id: 'session-summary',
          title: 'CodexNext session summary',
          uri: 'memory://session-summary',
          path: 'summaries/session.md',
          content: [
            'The relay supports memory documents.',
            'Hosted file search can read project summaries.',
          ].join('\n'),
        }, {
          id: 'other',
          title: 'Other note',
          path: 'notes/other.md',
          content: 'No matching content here.',
        }],
      }),
    ],
    maxResults: 3,
  });

  const result = await executor(baseRequest({
    query: 'CodexNext project summaries',
    path_glob: 'summaries/*',
  }));
  const content = result.content as CodexProviderRelayFileSearchExecutorContent;

  assert.equal(content.provider, 'memory-documents');
  assert.equal(content.results.length, 1);
  assert.equal(content.results[0].path, 'summaries/session.md');
  assert.equal(content.results[0].sourceType, 'memory-documents');
  assert.match(content.results[0].snippets.map((snippet) => snippet.text).join('\n'), /project summaries/u);
});

test('memory file_search source can omit snippets', async () => {
  const executor = createCodexProviderRelayFileSearchExecutor({
    sources: [
      createCodexProviderRelayMemoryFileSearchSource({
        includeContent: false,
        documents: [{
          id: 'doc-1',
          title: 'Hosted search',
          content: 'Hosted file search should match without returning snippets.',
        }],
      }),
    ],
  });

  const result = await executor(baseRequest({
    query: 'hosted search',
  }));
  const content = result.content as CodexProviderRelayFileSearchExecutorContent;

  assert.equal(content.results.length, 1);
  assert.equal(content.results[0].snippets.length, 0);
});

test('sqlite fts file_search source queries injected database and normalizes rows', async () => {
  const executed: Array<{ sql: string; params: unknown[] }> = [];
  const executor = createCodexProviderRelayFileSearchExecutor({
    sources: [
      createCodexProviderRelaySqliteFtsFileSearchSource({
        name: 'project-index',
        table: 'documents_fts',
        database: {
          all(sql, params) {
            executed.push({ sql, params });
            return [{
              id: 'doc-1',
              title: 'SQLite FTS Guide',
              uri: 'sqlite://doc-1',
              path: 'docs/sqlite.md',
              content: [
                'SQLite FTS stores project summaries.',
                'Hosted file search can query persisted indexes.',
              ].join('\n'),
              score: 42,
            }, {
              id: 'doc-2',
              title: 'Filtered note',
              path: 'notes/filtered.md',
              content: 'SQLite FTS should be filtered by path glob.',
              score: 99,
            }];
          },
        },
      }),
    ],
    maxResults: 5,
  });

  const result = await executor(baseRequest({
    query: 'SQLite project summaries',
    path_glob: 'docs/*',
  }));
  const content = result.content as CodexProviderRelayFileSearchExecutorContent;

  assert.equal(content.provider, 'sqlite-fts');
  assert.equal(content.results.length, 1);
  assert.equal(content.results[0].source, 'project-index');
  assert.equal(content.results[0].sourceType, 'sqlite-fts');
  assert.equal(content.results[0].path, 'docs/sqlite.md');
  assert.ok(content.results[0].score > 42);
  assert.equal(executed.length, 1);
  assert.match(executed[0].sql, /FROM "documents_fts"/u);
  assert.match(executed[0].sql, /"documents_fts" MATCH \?/u);
  assert.match(executed[0].sql, /"path" GLOB \?/u);
  assert.deepEqual(executed[0].params, ['"sqlite" OR "project" OR "summaries"', 'docs/*', 5]);
});

test('sqlite fts file_search source supports includeContent false and custom query function', async () => {
  const executor = createCodexProviderRelayFileSearchExecutor({
    sources: [
      createCodexProviderRelaySqliteFtsFileSearchSource({
        table: 'documents_fts',
        includeContent: false,
        query(request) {
          assert.match(request.sql, /LIMIT \?/u);
          assert.equal(request.ftsQuery, '"hosted" OR "sqlite"');
          return [{
            id: 'doc-1',
            title: 'Hosted SQLite',
            path: 'docs/hosted-sqlite.md',
            content: 'Hosted SQLite file search returns no snippets when disabled.',
            score: 10,
          }];
        },
      }),
    ],
  });

  const result = await executor(baseRequest({
    query: 'hosted sqlite',
  }));
  const content = result.content as CodexProviderRelayFileSearchExecutorContent;

  assert.equal(content.results.length, 1);
  assert.equal(content.results[0].snippets.length, 0);
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
