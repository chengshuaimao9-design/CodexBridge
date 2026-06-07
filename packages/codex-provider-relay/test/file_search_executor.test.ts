import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createCodexProviderRelayEmbeddingsApiProvider,
  createCodexProviderRelayFileSearchExecutor,
  createCodexProviderRelayInMemoryVectorFileSearchSource,
  createCodexProviderRelayLocalVectorFileSearchSource,
  createCodexProviderRelayMemoryLocalVectorIndexStore,
  createCodexProviderRelayMemoryFileSearchSource,
  createCodexProviderRelayOpenRouterEmbeddingProvider,
  createCodexProviderRelaySqliteLocalVectorIndexStore,
  createCodexProviderRelaySqliteFtsFileSearchSource,
  type CodexProviderRelayEmbeddingProvider,
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
    'The bridge supports hosted file search chunks.',
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

function createKeywordEmbeddingProvider(keywords: string[]): CodexProviderRelayEmbeddingProvider {
  return {
    model: 'test-keyword-embedding',
    embed(input) {
      return {
        model: 'test-keyword-embedding',
        dimensions: keywords.length,
        embeddings: input.map((text) => {
          const lower = text.toLowerCase();
          return keywords.map((keyword) => {
            const matches = lower.match(new RegExp(keyword, 'gu'));
            return matches?.length ?? 0;
          });
        }),
      };
    },
  };
}

function createCountingKeywordEmbeddingProvider(keywords: string[]): {
  provider: CodexProviderRelayEmbeddingProvider;
  embeddedTexts: string[];
} {
  const embeddedTexts: string[] = [];
  return {
    embeddedTexts,
    provider: {
      model: 'test-counting-keyword-embedding',
      embed(input) {
        embeddedTexts.push(...input);
        return {
          model: 'test-counting-keyword-embedding',
          dimensions: keywords.length,
          embeddings: input.map((text) => {
            const lower = text.toLowerCase();
            return keywords.map((keyword) => {
              const matches = lower.match(new RegExp(keyword, 'gu'));
              return matches?.length ?? 0;
            });
          }),
        };
      },
    },
  };
}

function createFakeSqliteLocalVectorDatabase() {
  const documents = new Map<string, Record<string, unknown>>();
  const chunks = new Map<string, Record<string, unknown>>();
  const statements: Array<{ operation: 'all' | 'run'; sql: string; params: unknown[] }> = [];
  const database = {
    all(sql: string, params: unknown[] = []): Record<string, unknown>[] {
      statements.push({ operation: 'all', sql, params });
      if (/FROM\s+"[^"]+_documents"/u.test(sql)) {
        const document = documents.get(String(params[0]));
        return document ? [document] : [];
      }
      if (/FROM\s+"[^"]+_chunks"/u.test(sql)) {
        const sourceName = String(params[0]);
        return [...chunks.values()]
          .filter((chunk) => chunk.source_name === sourceName)
          .sort((left, right) => (
            String(left.path).localeCompare(String(right.path))
            || Number(left.chunk_index) - Number(right.chunk_index)
          ));
      }
      return [];
    },
    run(sql: string, params: unknown[] = []): void {
      statements.push({ operation: 'run', sql, params });
      if (/INSERT INTO\s+"[^"]+_documents"/u.test(sql)) {
        const [
          id,
          sourceName,
          root,
          documentPath,
          uri,
          title,
          filename,
          size,
          mtimeMs,
          contentHash,
          embeddingModel,
          updatedAt,
        ] = params;
        documents.set(String(id), {
          id,
          source_name: sourceName,
          root,
          path: documentPath,
          uri,
          title,
          filename,
          size,
          mtime_ms: mtimeMs,
          content_hash: contentHash,
          embedding_model: embeddingModel,
          updated_at: updatedAt,
        });
        return;
      }
      if (/DELETE FROM\s+"[^"]+_chunks"\s+WHERE document_id = \?/u.test(sql)) {
        const documentId = String(params[0]);
        for (const [id, chunk] of chunks.entries()) {
          if (chunk.document_id === documentId) {
            chunks.delete(id);
          }
        }
        return;
      }
      if (/INSERT INTO\s+"[^"]+_chunks"/u.test(sql)) {
        const [
          id,
          documentId,
          sourceName,
          root,
          chunkPath,
          uri,
          title,
          filename,
          text,
          chunkIndex,
          startLine,
          endLine,
          embeddingJson,
          metadataJson,
        ] = params;
        chunks.set(String(id), {
          id,
          document_id: documentId,
          source_name: sourceName,
          root,
          path: chunkPath,
          uri,
          title,
          filename,
          text,
          chunk_index: chunkIndex,
          start_line: startLine,
          end_line: endLine,
          embedding_json: embeddingJson,
          metadata_json: metadataJson,
        });
        return;
      }
      if (/DELETE FROM\s+"[^"]+_documents"\s+WHERE id = \?/u.test(sql)) {
        documents.delete(String(params[0]));
      }
    },
  };
  return { database, statements };
}

test('local file_search executor returns OpenAI-style chunks from explicit roots only', async () => {
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
  assert.equal('results' in (content as any), false);
  assert.equal(content.data.length, 1);
  assert.equal(content.data[0].attributes.path, 'src/agent.ts');
  assert.match(content.data[0].content.map((chunk) => chunk.text).join('\n'), /file search target/u);
  assert.equal(content.data.some((entry) => String(entry.attributes.path).includes('node_modules')), false);
  assert.equal(deltas.some((entry) => entry.delta === 'scanning roots'), true);
  assert.equal(deltas.some((entry) => entry.delta === 'file matched'), true);
});

test('local file_search executor can omit chunk content', async () => {
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

  assert.ok(content.data.length >= 1);
  assert.equal(content.data.every((result) => result.content.length === 0), true);
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
  assert.equal(content.data[0].attributes.source, 'memory-documents');
  assert.equal(content.data.some((entry) => entry.attributes.source === 'workspace'), true);
  assert.equal(deltas.some((entry) => entry.delta === 'searching source'), true);
  assert.equal(deltas.some((entry) => entry.delta === 'memory document matched'), true);
});

test('file_search executor emits OpenAI-compatible search result data', async () => {
  const executor = createCodexProviderRelayFileSearchExecutor({
    sources: [
      createCodexProviderRelayMemoryFileSearchSource({
        name: 'knowledge-base',
        documents: [{
          id: 'doc-1',
          title: 'Hosted search guide',
          path: 'docs/hosted-search.md',
          content: 'Hosted file search returns OpenAI-compatible chunk data.',
          metadata: {
            category: 'docs',
          },
        }, {
          id: 'doc-2',
          title: 'Second hosted search guide',
          path: 'docs/second.md',
          content: 'Hosted file search has another matching document.',
          metadata: {
            category: 'docs',
          },
        }],
      }),
    ],
    maxResults: 5,
  });

  const result = await executor(baseRequest({
    query: 'hosted file search',
    max_num_results: 1,
  }));
  const content = result.content as CodexProviderRelayFileSearchExecutorContent;

  assert.equal(content.object, 'vector_store.search_results.page');
  assert.equal(content.search_query, 'hosted file search');
  assert.equal('results' in (content as any), false);
  assert.equal(content.data.length, 1);
  assert.equal(content.search_results.length, 1);
  assert.ok(content.data[0].file_id.startsWith('file_'));
  assert.equal(content.data[0].filename, 'hosted-search.md');
  assert.equal(content.data[0].attributes.category, 'docs');
  assert.equal(content.data[0].content[0].type, 'text');
  assert.match(content.data[0].content[0].text, /OpenAI-compatible/u);
  assert.ok(content.data[0].score > 0);
  assert.ok(content.data[0].score <= 1);
});

test('file_search executor applies vector store ids, filters, and ranking threshold', async () => {
  const executor = createCodexProviderRelayFileSearchExecutor({
    sources: [
      createCodexProviderRelayMemoryFileSearchSource({
        name: 'store-a',
        documents: [{
          id: 'strong',
          title: 'Alpha beta guide',
          path: 'docs/strong.md',
          content: 'alpha beta alpha beta',
          metadata: {
            category: 'docs',
            version: 2,
          },
        }, {
          id: 'weak',
          title: 'Alpha note',
          path: 'docs/weak.md',
          content: 'alpha only',
          metadata: {
            category: 'docs',
            version: 1,
          },
        }],
      }),
      createCodexProviderRelayMemoryFileSearchSource({
        name: 'store-b',
        documents: [{
          id: 'other',
          title: 'Alpha beta external',
          path: 'external/other.md',
          content: 'alpha beta alpha beta should be ignored by vector_store_ids.',
          metadata: {
            category: 'docs',
            version: 2,
          },
        }],
      }),
    ],
  });

  const result = await executor(baseRequest({
    query: 'alpha beta',
    vector_store_ids: ['store-a'],
    filters: {
      type: 'and',
      filters: [
        { type: 'eq', key: 'category', value: 'docs' },
        { type: 'gte', key: 'version', value: 2 },
      ],
    },
    ranking_options: {
      ranker: 'auto',
      score_threshold: 0.75,
      hybrid_search: {
        embedding_weight: 0.7,
        text_weight: 0.3,
      },
    },
  }));
  const content = result.content as CodexProviderRelayFileSearchExecutorContent;

  assert.equal(content.sourceCount, 1);
  assert.deepEqual(content.vector_store_ids, ['store-a']);
  assert.equal(content.ranking_options.scoreThreshold, 0.75);
  assert.equal(content.ranking_options.hybridSearch?.embeddingWeight, 0.7);
  assert.equal(content.data.length, 1);
  assert.equal(content.data[0].attributes.path, 'docs/strong.md');
  assert.equal(content.data[0].filename, 'strong.md');
  assert.equal(content.data.some((entry) => entry.filename === 'other.md'), false);
});

test('memory file_search source searches title and content with optional chunks', async () => {
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
  assert.equal(content.data.length, 1);
  assert.equal(content.data[0].attributes.path, 'summaries/session.md');
  assert.equal(content.data[0].attributes.source_type, 'memory-documents');
  assert.match(content.data[0].content.map((chunk) => chunk.text).join('\n'), /project summaries/u);
});

test('memory file_search source can omit chunks', async () => {
  const executor = createCodexProviderRelayFileSearchExecutor({
    sources: [
      createCodexProviderRelayMemoryFileSearchSource({
        includeContent: false,
        documents: [{
          id: 'doc-1',
          title: 'Hosted search',
          content: 'Hosted file search should match without returning chunks.',
        }],
      }),
    ],
  });

  const result = await executor(baseRequest({
    query: 'hosted search',
  }));
  const content = result.content as CodexProviderRelayFileSearchExecutorContent;

  assert.equal(content.data.length, 1);
  assert.equal(content.data[0].content.length, 0);
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
  assert.equal(content.data.length, 1);
  assert.equal(content.data[0].attributes.source, 'project-index');
  assert.equal(content.data[0].attributes.source_type, 'sqlite-fts');
  assert.equal(content.data[0].attributes.path, 'docs/sqlite.md');
  assert.ok(content.data[0].score > 0);
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
            content: 'Hosted SQLite file search returns no chunks when disabled.',
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

  assert.equal(content.data.length, 1);
  assert.equal(content.data[0].content.length, 0);
});

test('in-memory vector file_search source ranks by embedding similarity', async () => {
  const executor = createCodexProviderRelayFileSearchExecutor({
    sources: [
      createCodexProviderRelayInMemoryVectorFileSearchSource({
        name: 'vector-docs',
        embeddingProvider: createKeywordEmbeddingProvider(['payment', 'invoice', 'recipe']),
        documents: [{
          id: 'invoice',
          title: 'Invoice payment runbook',
          path: 'finance/invoice.md',
          content: 'payment invoice invoice reconciliation',
          metadata: {
            category: 'finance',
          },
        }, {
          id: 'recipe',
          title: 'Cooking recipe',
          path: 'food/recipe.md',
          content: 'recipe tomato pasta',
          metadata: {
            category: 'food',
          },
        }],
      }),
    ],
  });

  const result = await executor(baseRequest({
    query: 'payment invoice',
    vector_store_ids: ['vector-docs'],
  }));
  const content = result.content as CodexProviderRelayFileSearchExecutorContent;

  assert.equal(content.provider, 'in-memory-vector');
  assert.equal(content.data.length, 1);
  assert.equal(content.data[0].filename, 'invoice.md');
  assert.equal(content.data[0].attributes.source_type, 'in-memory-vector');
  assert.equal(content.data[0].attributes.embedding_model, 'test-keyword-embedding');
  assert.equal(content.data[0].attributes.category, 'finance');
  assert.match(content.data[0].content.map((chunk) => chunk.text).join('\n'), /payment invoice/u);
});

test('in-memory vector source honors hybrid_search weights', async () => {
  const executor = createCodexProviderRelayFileSearchExecutor({
    sources: [
      createCodexProviderRelayInMemoryVectorFileSearchSource({
        name: 'hybrid-docs',
        embeddingProvider: createKeywordEmbeddingProvider(['semantic']),
        vectorWeight: 1,
        textWeight: 0,
        documents: [{
          id: 'semantic',
          title: 'Semantic target',
          path: 'docs/semantic.md',
          content: 'semantic semantic semantic',
        }, {
          id: 'lexical',
          title: 'Lexical target',
          path: 'docs/lexical.md',
          content: 'queryterm queryterm queryterm queryterm queryterm',
        }],
      }),
    ],
    maxResults: 2,
  });

  const vectorOnly = await executor(baseRequest({
    query: 'semantic queryterm',
    ranking_options: {
      hybrid_search: {
        embedding_weight: 1,
        text_weight: 0,
      },
    },
  }));
  const textOnly = await executor(baseRequest({
    query: 'semantic queryterm',
    ranking_options: {
      hybrid_search: {
        embedding_weight: 0,
        text_weight: 1,
      },
    },
  }));

  const vectorContent = vectorOnly.content as CodexProviderRelayFileSearchExecutorContent;
  const textContent = textOnly.content as CodexProviderRelayFileSearchExecutorContent;
  assert.equal(vectorContent.data[0].filename, 'semantic.md');
  assert.equal(textContent.data[0].filename, 'lexical.md');
});

test('local-vector file_search source chunks files and reuses cached embeddings', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-provider-relay-local-vector-'));
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.mkdir(path.join(root, 'node_modules', 'ignored'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs', 'invoice.md'), [
    '# Invoice runbook',
    'Payment invoice reconciliation is the semantic search target.',
    'The second paragraph keeps enough text to force chunking.',
    'Invoice approvals and payment batches should rank highly.',
  ].join('\n'));
  await fs.writeFile(path.join(root, 'node_modules', 'ignored', 'invoice.md'), 'invoice should stay ignored');
  const { provider, embeddedTexts } = createCountingKeywordEmbeddingProvider(['invoice', 'payment', 'recipe']);
  const deltas: any[] = [];
  const executor = createCodexProviderRelayFileSearchExecutor({
    sources: [
      createCodexProviderRelayLocalVectorFileSearchSource({
        name: 'workspace-vector',
        roots: [root],
        embeddingProvider: provider,
        indexStore: createCodexProviderRelayMemoryLocalVectorIndexStore(),
        chunking: {
          maxChars: 90,
          overlapChars: 0,
        },
      }),
    ],
    maxResults: 3,
  });

  const first = await executor({
    ...baseRequest({
      query: 'payment invoice',
    }),
    emitDelta: async (delta, metadata) => {
      deltas.push({ delta, metadata });
    },
  });
  const firstContent = first.content as CodexProviderRelayFileSearchExecutorContent;
  const afterFirstSearchEmbeddings = embeddedTexts.length;

  const second = await executor({
    ...baseRequest({
      query: 'payment invoice',
    }),
    emitDelta: async (delta, metadata) => {
      deltas.push({ delta, metadata });
    },
  });
  const secondContent = second.content as CodexProviderRelayFileSearchExecutorContent;
  const afterSecondSearchEmbeddings = embeddedTexts.length;
  await fs.rm(path.join(root, 'docs', 'invoice.md'));
  const third = await executor({
    ...baseRequest({
      query: 'payment invoice',
    }),
    emitDelta: async (delta, metadata) => {
      deltas.push({ delta, metadata });
    },
  });
  const thirdContent = third.content as CodexProviderRelayFileSearchExecutorContent;

  assert.equal(firstContent.provider, 'local-vector');
  assert.equal(firstContent.data.length, 1);
  assert.equal(firstContent.data[0].filename, 'invoice.md');
  assert.equal(firstContent.data[0].attributes.source_type, 'local-vector');
  assert.equal(firstContent.data[0].attributes.embedding_model, 'test-counting-keyword-embedding');
  assert.match(firstContent.data[0].content.map((chunk) => chunk.text).join('\n'), /payment invoice/iu);
  assert.equal(firstContent.data.some((entry) => String(entry.attributes.path).includes('node_modules')), false);
  assert.equal(secondContent.data[0].filename, 'invoice.md');
  assert.ok(afterFirstSearchEmbeddings > 1);
  assert.equal(afterSecondSearchEmbeddings, afterFirstSearchEmbeddings + 1);
  assert.equal(embeddedTexts.length, afterSecondSearchEmbeddings + 1);
  assert.equal(thirdContent.data.length, 0);
  assert.equal(deltas.some((entry) => entry.delta === 'local vector file indexed'), true);
  assert.equal(deltas.some((entry) => entry.delta === 'local vector file cache hit'), true);
  assert.equal(deltas.some((entry) => entry.delta === 'local vector stale documents removed'), true);
});

test('local-vector source honors hybrid_search weights', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-provider-relay-local-vector-hybrid-'));
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs', 'semantic.md'), [
    'semantic semantic semantic',
    'background note without the lexical query marker',
  ].join('\n'));
  await fs.writeFile(path.join(root, 'docs', 'lexical.md'), [
    'queryterm queryterm queryterm queryterm queryterm',
    'plain lexical-only note',
  ].join('\n'));
  const executor = createCodexProviderRelayFileSearchExecutor({
    sources: [{
      type: 'local-vector',
      name: 'local-hybrid',
      roots: [root],
      embeddingProvider: createKeywordEmbeddingProvider(['semantic']),
      indexStore: createCodexProviderRelayMemoryLocalVectorIndexStore(),
      vectorWeight: 1,
      textWeight: 0,
    }],
    maxResults: 2,
  });

  const vectorOnly = await executor(baseRequest({
    query: 'semantic queryterm',
    ranking_options: {
      hybrid_search: {
        embedding_weight: 1,
        text_weight: 0,
      },
    },
  }));
  const textOnly = await executor(baseRequest({
    query: 'semantic queryterm',
    ranking_options: {
      hybrid_search: {
        embedding_weight: 0,
        text_weight: 1,
      },
    },
  }));

  const vectorContent = vectorOnly.content as CodexProviderRelayFileSearchExecutorContent;
  const textContent = textOnly.content as CodexProviderRelayFileSearchExecutorContent;
  assert.equal(vectorContent.data[0].filename, 'semantic.md');
  assert.equal(textContent.data[0].filename, 'lexical.md');
});

test('sqlite local-vector index store persists documents and chunks', async () => {
  const { database, statements } = createFakeSqliteLocalVectorDatabase();
  const store = createCodexProviderRelaySqliteLocalVectorIndexStore({
    database,
    tablePrefix: 'relay_vec',
  });
  const document = {
    id: 'doc-1',
    sourceName: 'sqlite-vector',
    root: '/repo',
    path: 'docs/sqlite-vector.md',
    uri: 'file:///repo/docs/sqlite-vector.md',
    title: 'docs/sqlite-vector.md',
    filename: 'sqlite-vector.md',
    size: 42,
    mtimeMs: 1234,
    contentHash: 'hash-1',
    embeddingModel: 'test-embedding',
    updatedAt: '2026-06-07T00:00:00.000Z',
  };
  const chunk = {
    id: 'chunk-1',
    documentId: 'doc-1',
    sourceName: 'sqlite-vector',
    root: '/repo',
    path: 'docs/sqlite-vector.md',
    uri: 'file:///repo/docs/sqlite-vector.md',
    title: 'docs/sqlite-vector.md',
    filename: 'sqlite-vector.md',
    text: 'sqlite vector chunk text',
    chunkIndex: 0,
    startLine: 1,
    endLine: 2,
    embedding: [1, 0, 0],
    metadata: {
      category: 'docs',
    },
  };

  await store.upsertDocument(document, [chunk]);
  const loadedDocument = await store.getDocument('doc-1');
  const loadedChunks = await store.listChunks('sqlite-vector');
  await store.deleteDocuments(['doc-1']);

  assert.equal(loadedDocument?.path, 'docs/sqlite-vector.md');
  assert.equal(loadedDocument?.embeddingModel, 'test-embedding');
  assert.equal(loadedChunks.length, 1);
  assert.deepEqual(loadedChunks[0].embedding, [1, 0, 0]);
  assert.equal(loadedChunks[0].metadata?.category, 'docs');
  assert.equal((await store.getDocument('doc-1')), null);
  assert.equal((await store.listChunks('sqlite-vector')).length, 0);
  assert.equal(statements.some((statement) => /CREATE TABLE IF NOT EXISTS "relay_vec_documents"/u.test(statement.sql)), true);
  assert.equal(statements.some((statement) => /CREATE TABLE IF NOT EXISTS "relay_vec_chunks"/u.test(statement.sql)), true);
});

test('local-vector source reuses sqlite index store across store instances', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-provider-relay-local-vector-sqlite-'));
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs', 'persisted.md'), [
    'Persistent invoice payment knowledge.',
    'The sqlite vector store should keep chunk embeddings between source instances.',
  ].join('\n'));
  const { database } = createFakeSqliteLocalVectorDatabase();
  const { provider, embeddedTexts } = createCountingKeywordEmbeddingProvider(['invoice', 'payment']);
  const firstExecutor = createCodexProviderRelayFileSearchExecutor({
    sources: [
      createCodexProviderRelayLocalVectorFileSearchSource({
        name: 'sqlite-vector',
        roots: [root],
        embeddingProvider: provider,
        indexStore: createCodexProviderRelaySqliteLocalVectorIndexStore({
          database,
          tablePrefix: 'relay_vec',
        }),
      }),
    ],
  });

  const first = await firstExecutor(baseRequest({
    query: 'invoice payment',
  }));
  const afterFirstSearchEmbeddings = embeddedTexts.length;
  const secondExecutor = createCodexProviderRelayFileSearchExecutor({
    sources: [
      createCodexProviderRelayLocalVectorFileSearchSource({
        name: 'sqlite-vector',
        roots: [root],
        embeddingProvider: provider,
        indexStore: createCodexProviderRelaySqliteLocalVectorIndexStore({
          database,
          tablePrefix: 'relay_vec',
        }),
      }),
    ],
  });
  const second = await secondExecutor(baseRequest({
    query: 'invoice payment',
  }));
  const firstContent = first.content as CodexProviderRelayFileSearchExecutorContent;
  const secondContent = second.content as CodexProviderRelayFileSearchExecutorContent;

  assert.equal(firstContent.data[0].filename, 'persisted.md');
  assert.equal(secondContent.data[0].filename, 'persisted.md');
  assert.ok(afterFirstSearchEmbeddings > 1);
  assert.equal(embeddedTexts.length, afterFirstSearchEmbeddings + 1);
});

test('embeddings API provider posts OpenAI-compatible embedding requests', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const provider = createCodexProviderRelayEmbeddingsApiProvider({
    apiKey: 'embedding-test',
    model: 'vendor/test-embedding',
    endpoint: 'https://embeddings.example.test/v1/embeddings',
    headers: {
      'X-Provider': 'example',
    },
    fetchImpl: (async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({
        model: 'vendor/test-embedding',
        data: [{
          object: 'embedding',
          index: 0,
          embedding: [1, 0, 0],
        }, {
          object: 'embedding',
          index: 1,
          embedding: [0, 1, 0],
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch,
  });

  const result = await provider.embed(['first', 'second']);
  const body = JSON.parse(String(calls[0].init.body));

  assert.equal(calls[0].url, 'https://embeddings.example.test/v1/embeddings');
  assert.equal((calls[0].init.headers as any).Authorization, 'Bearer embedding-test');
  assert.equal((calls[0].init.headers as any)['X-Provider'], 'example');
  assert.equal(body.model, 'vendor/test-embedding');
  assert.deepEqual(body.input, ['first', 'second']);
  assert.deepEqual(result.embeddings, [[1, 0, 0], [0, 1, 0]]);
  assert.equal(result.dimensions, 3);
});

test('OpenRouter embedding provider is only a default wrapper over the generic embeddings API provider', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const provider = createCodexProviderRelayOpenRouterEmbeddingProvider({
    apiKey: 'openrouter-test',
    fetchImpl: (async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({
        model: 'qwen/qwen3-embedding-8b',
        data: [{ embedding: [1, 2, 3] }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch,
  });

  await provider.embed(['hello']);
  const body = JSON.parse(String(calls[0].init.body));

  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/embeddings');
  assert.equal((calls[0].init.headers as any).Authorization, 'Bearer openrouter-test');
  assert.equal(body.model, 'qwen/qwen3-embedding-8b');
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
          content: [{
            type: 'text' as const,
            line: 1,
            text: 'x'.repeat(1_000),
            start_line: 1,
            end_line: 1,
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

  assert.ok(content.data.length >= 1);
  assert.ok(content.data.length < 5);
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
