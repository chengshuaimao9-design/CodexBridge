import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  CandidateFile,
  CodexProviderRelayEmbeddingProvider,
  CodexProviderRelayFileSearchSource,
  CodexProviderRelayFileSearchSourceMatch,
  CodexProviderRelayFileSearchSourceRequest,
  CodexProviderRelayFileSearchSourceResult,
  CodexProviderRelayInMemoryVectorFileSearchSourceOptions,
  CodexProviderRelayLocalFileSearchSourceOptions,
  CodexProviderRelayLocalVectorFileSearchSourceOptions,
  CodexProviderRelayLocalVectorIndexChunk,
  CodexProviderRelayLocalVectorIndexDocument,
  CodexProviderRelayMemoryFileSearchDocument,
  CodexProviderRelayMemoryFileSearchSourceOptions,
  CodexProviderRelaySqliteFtsFileSearchSourceOptions,
  CodexProviderRelaySqliteFtsQueryFunction,
  CodexProviderRelaySqliteFtsQueryRequest,
  EmbeddedMemoryFileSearchDocument,
  JsonRecord,
  LocalFileSearchRoot,
  LocalVectorTextChunk,
  NormalizedInMemoryVectorFileSearchOptions,
  NormalizedLocalFileSearchOptions,
  NormalizedLocalVectorChunkingOptions,
  NormalizedLocalVectorFileSearchOptions,
  NormalizedMemoryFileSearchDocument,
  NormalizedMemoryFileSearchOptions,
  NormalizedSqliteFtsFileSearchOptions,
} from './types.js';
import { createCodexProviderRelayMemoryLocalVectorIndexStore } from './stores.js';
import {
  DEFAULT_IGNORE_DIRECTORIES,
  DEFAULT_IGNORE_EXTENSIONS,
  clampInteger,
  clampNumber,
  contentChunksForTerms,
  cosineSimilarity,
  createFileSearchSourceMatchFromDocument,
  escapeRegExp,
  firstNonEmptyString,
  isPathInsideRoot,
  isSafeSymlinkTarget,
  lexicalScoreForText,
  looksBinary,
  normalizeEmbeddingVector,
  normalizeFileSearchAttributes,
  normalizeNonNegativeInteger,
  normalizeRelativePath,
  normalizeSqlIdentifier,
  normalizeString,
  pathMatchesGlob,
  sqlAliasFromIdentifier,
  sqliteFtsQueryFromTerms,
  stableContentHash,
  stableFileSearchFileId,
} from './shared.js';

export function createCodexProviderRelayLocalFileSearchSource(
  options: CodexProviderRelayLocalFileSearchSourceOptions,
): CodexProviderRelayFileSearchSource {
  assertExplicitLocalFileSearchRoots(options.roots);
  const normalizedOptionsPromise = normalizeLocalFileSearchOptions(options);
  const sourceName = normalizeString(options.name) || 'local-fs';
  return {
    name: sourceName,
    type: 'local-fs',
    async search(request: CodexProviderRelayFileSearchSourceRequest): Promise<CodexProviderRelayFileSearchSourceResult> {
      const normalizedOptions = await normalizedOptionsPromise;
      const maxResults = request.maxResults;
      const includeContent = typeof request.includeContent === 'boolean'
        ? request.includeContent
        : normalizedOptions.includeContent;
      const maxBytesPerFile = Math.min(request.maxBytesPerFile, normalizedOptions.maxBytesPerFile);
      const snippetLines = Math.min(request.snippetLines, normalizedOptions.snippetLines);

      await request.emitDelta?.('scanning roots', {
        source: normalizedOptions.name,
        roots: normalizedOptions.roots.map((root) => root.path),
        maxResults,
      });
      const candidates = await collectCandidateFiles(normalizedOptions, request.pathGlob);
      await request.emitDelta?.('candidate files collected', {
        source: normalizedOptions.name,
        count: candidates.length,
      });

      const results: CodexProviderRelayFileSearchSourceMatch[] = [];
      let scannedFiles = 0;
      let skippedFiles = 0;
      for (const candidate of candidates) {
        if (scannedFiles >= normalizedOptions.maxFilesScanned || results.length >= maxResults) {
          break;
        }
        const stat = await fs.stat(candidate.absolutePath).catch(() => null);
        if (!stat || !stat.isFile() || stat.size > maxBytesPerFile) {
          skippedFiles += 1;
          continue;
        }
        const content = await fs.readFile(candidate.absolutePath, 'utf8').catch(() => null);
        scannedFiles += 1;
        if (!content || looksBinary(content)) {
          skippedFiles += 1;
          continue;
        }
        const result = searchFileContent({
          candidate,
          content,
          terms: request.terms,
          includeContent,
          snippetLines,
          sourceName: normalizedOptions.name,
        });
        if (result) {
          results.push(result);
          await request.emitDelta?.('file matched', {
            source: normalizedOptions.name,
            path: result.path,
            score: result.score,
            resultCount: results.length,
          });
        }
      }

      results.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
      return {
        results: results.slice(0, maxResults),
        scannedFiles,
        skippedFiles,
        metadata: {
          provider: 'local-fs',
          source: normalizedOptions.name,
        },
      };
    },
  };
}

export function createCodexProviderRelayLocalVectorFileSearchSource(
  options: CodexProviderRelayLocalVectorFileSearchSourceOptions,
): CodexProviderRelayFileSearchSource {
  assertExplicitLocalFileSearchRoots(options.roots);
  const normalizedOptionsPromise = normalizeLocalVectorFileSearchOptions(options);
  const sourceName = normalizeString(options.name) || 'local-vector';
  return {
    name: sourceName,
    type: 'local-vector',
    async search(request: CodexProviderRelayFileSearchSourceRequest): Promise<CodexProviderRelayFileSearchSourceResult> {
      const normalizedOptions = await normalizedOptionsPromise;
      const maxResults = request.maxResults;
      const includeContent = typeof request.includeContent === 'boolean'
        ? request.includeContent
        : normalizedOptions.local.includeContent;
      const maxBytesPerFile = Math.min(request.maxBytesPerFile, normalizedOptions.local.maxBytesPerFile);

      await request.emitDelta?.('indexing local vector files', {
        source: normalizedOptions.name,
        roots: normalizedOptions.local.roots.map((root) => root.path),
        embeddingModel: normalizedOptions.embeddingProvider.model,
      });

      const candidates = await collectCandidateFiles(normalizedOptions.local, request.pathGlob);
      const staleDocumentIds = request.pathGlob
        ? []
        : await deleteStaleLocalVectorDocuments(normalizedOptions, candidates);
      if (staleDocumentIds.length > 0) {
        await request.emitDelta?.('local vector stale documents removed', {
          source: normalizedOptions.name,
          count: staleDocumentIds.length,
        });
      }
      let scannedFiles = 0;
      let skippedFiles = 0;
      let indexedFiles = 0;
      let cachedFiles = 0;
      for (const candidate of candidates) {
        if (scannedFiles >= normalizedOptions.local.maxFilesScanned) {
          break;
        }
        scannedFiles += 1;
        const indexResult = await indexLocalVectorCandidate({
          candidate,
          options: normalizedOptions,
          maxBytesPerFile,
        });
        if (indexResult.status === 'skipped') {
          skippedFiles += 1;
        } else if (indexResult.status === 'cached') {
          cachedFiles += 1;
          await request.emitDelta?.('local vector file cache hit', {
            source: normalizedOptions.name,
            path: candidate.relativePath,
          });
        } else {
          indexedFiles += 1;
          await request.emitDelta?.('local vector file indexed', {
            source: normalizedOptions.name,
            path: candidate.relativePath,
            chunkCount: indexResult.chunkCount,
          });
        }
      }

      const queryEmbedding = normalizeEmbeddingVector(
        (await normalizedOptions.embeddingProvider.embed([request.query])).embeddings[0],
      );
      if (queryEmbedding.length === 0) {
        return {
          results: [],
          scannedFiles,
          skippedFiles,
          metadata: {
            provider: 'local-vector',
            source: normalizedOptions.name,
            indexedFiles,
            cachedFiles,
          },
        };
      }

      await request.emitDelta?.('querying local vector index', {
        source: normalizedOptions.name,
        embeddingModel: normalizedOptions.embeddingProvider.model,
        indexedFiles,
        cachedFiles,
        maxResults,
      });

      const textWeight = request.rankingOptions.hybridSearch?.textWeight ?? normalizedOptions.textWeight;
      const vectorWeight = request.rankingOptions.hybridSearch?.embeddingWeight ?? normalizedOptions.vectorWeight;
      const chunks = await normalizedOptions.indexStore.listChunks(normalizedOptions.name);
      const groupedResults = new Map<string, {
        chunkScores: Array<{
          chunk: CodexProviderRelayLocalVectorIndexChunk;
          score: number;
          vectorScore: number;
          lexicalScore: number;
        }>;
        maxVectorScore: number;
        maxLexicalScore: number;
        score: number;
      }>();

      for (const chunk of chunks) {
        if (request.pathGlob && !pathMatchesGlob(chunk.path, request.pathGlob)) {
          continue;
        }
        const vectorScore = cosineSimilarity(queryEmbedding, chunk.embedding);
        const lexicalScore = lexicalScoreForText({
          title: chunk.title,
          path: chunk.path,
          content: chunk.text,
          terms: request.terms,
        });
        if (vectorScore <= 0 && lexicalScore <= 0) {
          continue;
        }
        const normalizedLexicalScore = Math.min(1, lexicalScore / 40);
        const score = (vectorScore * vectorWeight * 100) + (normalizedLexicalScore * textWeight * 100);
        const entry = groupedResults.get(chunk.documentId) ?? {
          chunkScores: [],
          maxVectorScore: 0,
          maxLexicalScore: 0,
          score: 0,
        };
        entry.chunkScores.push({
          chunk,
          score,
          vectorScore,
          lexicalScore: normalizedLexicalScore,
        });
        entry.score = Math.max(entry.score, score);
        entry.maxVectorScore = Math.max(entry.maxVectorScore, vectorScore);
        entry.maxLexicalScore = Math.max(entry.maxLexicalScore, normalizedLexicalScore);
        groupedResults.set(chunk.documentId, entry);
      }

      const results: CodexProviderRelayFileSearchSourceMatch[] = [];
      for (const entry of groupedResults.values()) {
        entry.chunkScores.sort((left, right) => right.score - left.score || left.chunk.chunkIndex - right.chunk.chunkIndex);
        const bestChunk = entry.chunkScores[0]?.chunk;
        if (!bestChunk || entry.score <= 0) {
          continue;
        }
        const content = includeContent
          ? entry.chunkScores.slice(0, 4).map(({ chunk }) => ({
            type: 'text' as const,
            text: chunk.text.slice(0, 1_500),
            line: chunk.startLine,
            start_line: chunk.startLine,
            end_line: chunk.endLine,
          }))
          : [];
        results.push({
          file_id: stableFileSearchFileId(normalizedOptions.name, bestChunk.path),
          filename: bestChunk.filename,
          title: bestChunk.title,
          uri: bestChunk.uri,
          path: bestChunk.path,
          root: bestChunk.root,
          source: normalizedOptions.name,
          sourceType: 'local-vector',
          score: entry.score,
          attributes: normalizeFileSearchAttributes({
            ...(bestChunk.metadata && typeof bestChunk.metadata === 'object' ? bestChunk.metadata : {}),
            filename: bestChunk.filename,
            path: bestChunk.path,
            root: bestChunk.root,
            source: normalizedOptions.name,
            source_type: 'local-vector',
            embedding_model: normalizedOptions.embeddingProvider.model,
            vector_score: Number(entry.maxVectorScore.toFixed(6)),
            lexical_score: Number(entry.maxLexicalScore.toFixed(6)),
            chunk_count: entry.chunkScores.length,
          }),
          content,
        });
        await request.emitDelta?.('local vector chunk matched', {
          source: normalizedOptions.name,
          path: bestChunk.path,
          score: entry.score,
          resultCount: results.length,
        });
      }

      results.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
      return {
        results: results.slice(0, maxResults),
        scannedFiles,
        skippedFiles,
        metadata: {
          provider: 'local-vector',
          source: normalizedOptions.name,
          embeddingModel: normalizedOptions.embeddingProvider.model,
          indexedFiles,
          cachedFiles,
          chunkCount: chunks.length,
        },
      };
    },
  };
}

export function createCodexProviderRelayMemoryFileSearchSource(
  options: CodexProviderRelayMemoryFileSearchSourceOptions,
): CodexProviderRelayFileSearchSource {
  const normalizedOptions = normalizeMemoryFileSearchOptions(options);
  return {
    name: normalizedOptions.name,
    type: 'memory-documents',
    async search(request: CodexProviderRelayFileSearchSourceRequest): Promise<CodexProviderRelayFileSearchSourceResult> {
      const maxResults = request.maxResults;
      const includeContent = typeof request.includeContent === 'boolean'
        ? request.includeContent
        : normalizedOptions.includeContent;
      const maxBytesPerDocument = Math.min(request.maxBytesPerFile, normalizedOptions.maxBytesPerDocument);
      const snippetLines = Math.min(request.snippetLines, normalizedOptions.snippetLines);

      await request.emitDelta?.('scanning memory documents', {
        source: normalizedOptions.name,
        documentCount: normalizedOptions.documents.length,
        maxResults,
      });

      const results: CodexProviderRelayFileSearchSourceMatch[] = [];
      let scannedDocuments = 0;
      let skippedDocuments = 0;
      for (const document of normalizedOptions.documents) {
        if (scannedDocuments >= normalizedOptions.maxDocumentsScanned || results.length >= maxResults) {
          break;
        }
        if (request.pathGlob && !pathMatchesGlob(document.path, request.pathGlob)) {
          continue;
        }
        const documentBytes = Buffer.byteLength(document.content, 'utf8');
        if (documentBytes > maxBytesPerDocument) {
          skippedDocuments += 1;
          continue;
        }
        scannedDocuments += 1;
        const result = searchTextContent({
          title: document.title,
          uri: document.uri,
          path: document.path,
          root: null,
          sourceName: normalizedOptions.name,
          sourceType: 'memory-documents',
          attributes: document.metadata,
          content: document.content,
          terms: request.terms,
          includeContent,
          snippetLines,
        });
        if (result) {
          results.push(result);
          await request.emitDelta?.('memory document matched', {
            source: normalizedOptions.name,
            path: result.path,
            score: result.score,
            resultCount: results.length,
          });
        }
      }

      results.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
      return {
        results: results.slice(0, maxResults),
        scannedFiles: scannedDocuments,
        skippedFiles: skippedDocuments,
        metadata: {
          provider: 'memory-documents',
          source: normalizedOptions.name,
          scannedDocuments,
          skippedDocuments,
        },
      };
    },
  };
}

export function createCodexProviderRelaySqliteFtsFileSearchSource(
  options: CodexProviderRelaySqliteFtsFileSearchSourceOptions,
): CodexProviderRelayFileSearchSource {
  const normalizedOptions = normalizeSqliteFtsFileSearchOptions(options);
  return {
    name: normalizedOptions.name,
    type: 'sqlite-fts',
    async search(request: CodexProviderRelayFileSearchSourceRequest): Promise<CodexProviderRelayFileSearchSourceResult> {
      const maxResults = request.maxResults;
      const includeContent = typeof request.includeContent === 'boolean'
        ? request.includeContent
        : normalizedOptions.includeContent;
      const maxBytesPerDocument = Math.min(request.maxBytesPerFile, normalizedOptions.maxBytesPerDocument);
      const snippetLines = Math.min(request.snippetLines, normalizedOptions.snippetLines);
      const ftsQuery = sqliteFtsQueryFromTerms(request.terms);
      if (!ftsQuery) {
        return {
          results: [],
          scannedFiles: 0,
          skippedFiles: 0,
        };
      }
      const querySpec = buildSqliteFtsQuery({
        options: normalizedOptions,
        ftsQuery,
        pathGlob: request.pathGlob,
        maxResults: Math.min(maxResults, normalizedOptions.maxRows),
      });

      await request.emitDelta?.('querying sqlite fts', {
        source: normalizedOptions.name,
        table: normalizedOptions.table,
        maxResults,
      });

      const rows = await normalizedOptions.query({
        sql: querySpec.sql,
        params: querySpec.params,
        query: request.query,
        ftsQuery,
        pathGlob: request.pathGlob,
        maxResults,
        terms: request.terms,
      });

      const results: CodexProviderRelayFileSearchSourceMatch[] = [];
      let scannedRows = 0;
      let skippedRows = 0;
      for (const row of Array.isArray(rows) ? rows : []) {
        if (scannedRows >= normalizedOptions.maxRows || results.length >= maxResults) {
          break;
        }
        const document = sqliteFtsRowToMemoryDocument(row, normalizedOptions);
        if (!document) {
          skippedRows += 1;
          continue;
        }
        if (request.pathGlob && !pathMatchesGlob(document.path, request.pathGlob)) {
          continue;
        }
        const documentBytes = Buffer.byteLength(document.content, 'utf8');
        if (documentBytes > maxBytesPerDocument) {
          skippedRows += 1;
          continue;
        }
        scannedRows += 1;
        const result = searchTextContent({
          title: document.title,
          uri: document.uri,
          path: document.path,
          root: null,
          sourceName: normalizedOptions.name,
          sourceType: 'sqlite-fts',
          attributes: document.metadata,
          content: document.content,
          terms: request.terms,
          includeContent,
          snippetLines,
        });
        if (result) {
          result.score += sqliteFtsScoreFromRow(row, normalizedOptions);
          results.push(result);
          await request.emitDelta?.('sqlite fts row matched', {
            source: normalizedOptions.name,
            path: result.path,
            score: result.score,
            resultCount: results.length,
          });
        }
      }

      results.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
      return {
        results: results.slice(0, maxResults),
        scannedFiles: scannedRows,
        skippedFiles: skippedRows,
        metadata: {
          provider: 'sqlite-fts',
          source: normalizedOptions.name,
          table: normalizedOptions.table,
          scannedRows,
          skippedRows,
        },
      };
    },
  };
}

export function createCodexProviderRelayInMemoryVectorFileSearchSource(
  options: CodexProviderRelayInMemoryVectorFileSearchSourceOptions,
): CodexProviderRelayFileSearchSource {
  const normalizedOptions = normalizeInMemoryVectorFileSearchOptions(options);
  let indexedDocumentsPromise: Promise<EmbeddedMemoryFileSearchDocument[]> | null = null;
  return {
    name: normalizedOptions.name,
    type: 'in-memory-vector',
    async search(request: CodexProviderRelayFileSearchSourceRequest): Promise<CodexProviderRelayFileSearchSourceResult> {
      const maxResults = request.maxResults;
      const includeContent = typeof request.includeContent === 'boolean'
        ? request.includeContent
        : normalizedOptions.includeContent;
      const maxBytesPerDocument = Math.min(request.maxBytesPerFile, normalizedOptions.maxBytesPerDocument);
      const snippetLines = Math.min(request.snippetLines, normalizedOptions.snippetLines);
      indexedDocumentsPromise ??= embedMemoryDocuments(normalizedOptions);
      const indexedDocuments = await indexedDocumentsPromise;

      await request.emitDelta?.('querying in-memory vector index', {
        source: normalizedOptions.name,
        documentCount: indexedDocuments.length,
        embeddingModel: normalizedOptions.embeddingProvider.model,
        maxResults,
      });

      const queryEmbedding = (await normalizedOptions.embeddingProvider.embed([request.query])).embeddings[0];
      if (!queryEmbedding || queryEmbedding.length === 0) {
        return {
          results: [],
          scannedFiles: 0,
          skippedFiles: 0,
        };
      }

      const textWeight = request.rankingOptions.hybridSearch?.textWeight ?? normalizedOptions.textWeight;
      const vectorWeight = request.rankingOptions.hybridSearch?.embeddingWeight ?? normalizedOptions.vectorWeight;
      const scored: CodexProviderRelayFileSearchSourceMatch[] = [];
      let scannedDocuments = 0;
      let skippedDocuments = 0;
      for (const entry of indexedDocuments) {
        const document = entry.document;
        if (scannedDocuments >= normalizedOptions.maxDocumentsScanned) {
          break;
        }
        if (request.pathGlob && !pathMatchesGlob(document.path, request.pathGlob)) {
          continue;
        }
        const documentBytes = Buffer.byteLength(document.content, 'utf8');
        if (documentBytes > maxBytesPerDocument) {
          skippedDocuments += 1;
          continue;
        }
        scannedDocuments += 1;
        const vectorScore = cosineSimilarity(queryEmbedding, entry.embedding);
        const lexicalScore = lexicalScoreForText({
          title: document.title,
          path: document.path,
          content: document.content,
          terms: request.terms,
        });
        if (vectorScore <= 0 && lexicalScore <= 0) {
          continue;
        }
        const normalizedLexicalScore = Math.min(1, lexicalScore / 40);
        const score = (vectorScore * vectorWeight * 100) + (normalizedLexicalScore * textWeight * 100);
        const result = createFileSearchSourceMatchFromDocument({
          document,
          sourceName: normalizedOptions.name,
          sourceType: 'in-memory-vector',
          score,
          includeContent,
          snippetLines,
          terms: request.terms,
          attributes: {
            ...document.metadata,
            embedding_model: normalizedOptions.embeddingProvider.model,
            vector_score: Number(vectorScore.toFixed(6)),
            lexical_score: Number(normalizedLexicalScore.toFixed(6)),
          },
        });
        if (result) {
          scored.push(result);
          await request.emitDelta?.('in-memory vector document matched', {
            source: normalizedOptions.name,
            path: result.path,
            score: result.score,
            resultCount: scored.length,
          });
        }
      }

      scored.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
      return {
        results: scored.slice(0, maxResults),
        scannedFiles: scannedDocuments,
        skippedFiles: skippedDocuments,
        metadata: {
          provider: 'in-memory-vector',
          source: normalizedOptions.name,
          embeddingModel: normalizedOptions.embeddingProvider.model,
          scannedDocuments,
          skippedDocuments,
        },
      };
    },
  };
}

async function normalizeLocalFileSearchOptions(
  options: CodexProviderRelayLocalFileSearchSourceOptions,
): Promise<NormalizedLocalFileSearchOptions> {
  const roots = Array.isArray(options.roots)
    ? options.roots.map((root) => path.resolve(root)).filter(Boolean)
    : [];
  if (roots.length === 0) {
    throw new Error('file_search local-fs source requires at least one explicit root.');
  }
  const normalizedRoots: LocalFileSearchRoot[] = [];
  for (const root of [...new Set(roots)]) {
    const realPath = await fs.realpath(root).catch(() => root);
    normalizedRoots.push({
      path: root,
      realPath,
    });
  }
  return {
    name: normalizeString(options.name) || 'local-fs',
    type: 'local-fs',
    roots: normalizedRoots,
    maxFilesScanned: clampInteger(options.maxFilesScanned, 1, 20_000, 2_000),
    maxBytesPerFile: clampInteger(options.maxBytesPerFile, 1_024, 2 * 1024 * 1024, 256 * 1024),
    snippetLines: clampInteger(options.snippetLines, 1, 8, 2),
    includeContent: options.includeContent !== false,
    followSymlinks: Boolean(options.followSymlinks),
    ignoreDirectories: new Set([
      ...DEFAULT_IGNORE_DIRECTORIES,
      ...(Array.isArray(options.ignoreDirectories) ? options.ignoreDirectories : []),
    ].map((entry) => entry.toLowerCase())),
    ignoreExtensions: new Set([
      ...DEFAULT_IGNORE_EXTENSIONS,
      ...(Array.isArray(options.ignoreExtensions) ? options.ignoreExtensions : []),
    ].map((entry) => entry.toLowerCase())),
  };
}

async function normalizeLocalVectorFileSearchOptions(
  options: CodexProviderRelayLocalVectorFileSearchSourceOptions,
): Promise<NormalizedLocalVectorFileSearchOptions> {
  const embeddingProvider = options.embeddingProvider;
  if (!embeddingProvider || typeof embeddingProvider.embed !== 'function') {
    throw new Error('local-vector file_search source requires an embedding provider.');
  }
  const {
    type: _type,
    embeddingProvider: _embeddingProvider,
    indexStore: _indexStore,
    chunking: _chunking,
    vectorWeight: _vectorWeight,
    textWeight: _textWeight,
    embeddingBatchSize: _embeddingBatchSize,
    ...localOptions
  } = options;
  const local = await normalizeLocalFileSearchOptions({
    ...localOptions,
    name: normalizeString(options.name) || 'local-vector',
  });
  const chunking = options.chunking && typeof options.chunking === 'object'
    ? options.chunking
    : {};
  return {
    local: {
      ...local,
      name: normalizeString(options.name) || 'local-vector',
    },
    name: normalizeString(options.name) || 'local-vector',
    type: 'local-vector',
    embeddingProvider,
    indexStore: options.indexStore ?? createCodexProviderRelayMemoryLocalVectorIndexStore(),
    chunking: {
      maxChars: clampInteger(chunking.maxChars, 400, 12_000, 1_600),
      overlapChars: clampInteger(chunking.overlapChars, 0, 2_000, 200),
      maxChunksPerFile: clampInteger(chunking.maxChunksPerFile, 1, 2_000, 200),
    },
    vectorWeight: clampNumber(options.vectorWeight, 0, 1, 0.7),
    textWeight: clampNumber(options.textWeight, 0, 1, 0.3),
    embeddingBatchSize: clampInteger(options.embeddingBatchSize, 1, 256, 32),
  };
}

function assertExplicitLocalFileSearchRoots(value: unknown): void {
  if (!Array.isArray(value) || value.map((root) => normalizeString(root)).filter(Boolean).length === 0) {
    throw new Error('file_search local-fs source requires at least one explicit root.');
  }
}

function normalizeMemoryFileSearchOptions(
  options: CodexProviderRelayMemoryFileSearchSourceOptions,
): NormalizedMemoryFileSearchOptions {
  const documents = Array.isArray(options.documents)
    ? options.documents.map(normalizeMemoryFileSearchDocument).filter(Boolean)
    : [];
  return {
    name: normalizeString(options.name) || 'memory-documents',
    type: 'memory-documents',
    documents,
    maxDocumentsScanned: clampInteger(options.maxDocumentsScanned, 1, 100_000, 5_000),
    maxBytesPerDocument: clampInteger(options.maxBytesPerDocument, 1_024, 2 * 1024 * 1024, 256 * 1024),
    snippetLines: clampInteger(options.snippetLines, 1, 8, 2),
    includeContent: options.includeContent !== false,
  };
}

function normalizeMemoryFileSearchDocument(
  document: CodexProviderRelayMemoryFileSearchDocument,
): NormalizedMemoryFileSearchDocument | null {
  if (!document || typeof document !== 'object') {
    return null;
  }
  const id = normalizeString(document.id);
  const content = normalizeString(document.content);
  if (!id || !content) {
    return null;
  }
  const pathValue = normalizeRelativePath(firstNonEmptyString([
    document.path,
    document.title,
    id,
  ]));
  const safePath = pathValue && !path.isAbsolute(pathValue) && !pathValue.split('/').includes('..')
    ? pathValue
    : `memory/${id}`;
  return {
    id,
    title: firstNonEmptyString([document.title, safePath, id]),
    uri: normalizeString(document.uri) || `memory://${encodeURIComponent(id)}`,
    path: safePath,
    content,
    metadata: document.metadata && typeof document.metadata === 'object'
      ? document.metadata
      : null,
  };
}

function normalizeSqliteFtsFileSearchOptions(
  options: CodexProviderRelaySqliteFtsFileSearchSourceOptions,
): NormalizedSqliteFtsFileSearchOptions {
  const table = normalizeSqlIdentifier(options.table, 'sqlite-fts table');
  const query = normalizeSqliteFtsQuery(options);
  const columns = {
    id: normalizeSqlIdentifier(options.columns?.id || 'id', 'sqlite-fts id column'),
    title: normalizeSqlIdentifier(options.columns?.title || 'title', 'sqlite-fts title column'),
    uri: normalizeSqlIdentifier(options.columns?.uri || 'uri', 'sqlite-fts uri column'),
    path: normalizeSqlIdentifier(options.columns?.path || 'path', 'sqlite-fts path column'),
    content: normalizeSqlIdentifier(options.columns?.content || 'content', 'sqlite-fts content column'),
    score: normalizeSqlIdentifier(options.columns?.score || 'score', 'sqlite-fts score column'),
  };
  return {
    name: normalizeString(options.name) || 'sqlite-fts',
    type: 'sqlite-fts',
    table,
    tableMatchTarget: table,
    query,
    columns,
    metadataColumns: Array.isArray(options.metadataColumns)
      ? options.metadataColumns.map((column) => normalizeSqlIdentifier(column, 'sqlite-fts metadata column'))
      : [],
    maxRows: clampInteger(options.maxRows, 1, 1_000, 50),
    maxBytesPerDocument: clampInteger(options.maxBytesPerDocument, 1_024, 2 * 1024 * 1024, 256 * 1024),
    snippetLines: clampInteger(options.snippetLines, 1, 8, 2),
    includeContent: options.includeContent !== false,
  };
}

function normalizeInMemoryVectorFileSearchOptions(
  options: CodexProviderRelayInMemoryVectorFileSearchSourceOptions,
): NormalizedInMemoryVectorFileSearchOptions {
  const embeddingProvider = options.embeddingProvider;
  if (!embeddingProvider || typeof embeddingProvider.embed !== 'function') {
    throw new Error('in-memory-vector file_search source requires an embedding provider.');
  }
  const documents = Array.isArray(options.documents)
    ? options.documents.map(normalizeMemoryFileSearchDocument).filter(Boolean)
    : [];
  return {
    name: normalizeString(options.name) || 'in-memory-vector',
    type: 'in-memory-vector',
    documents,
    embeddingProvider,
    maxDocumentsScanned: clampInteger(options.maxDocumentsScanned, 1, 100_000, 5_000),
    maxBytesPerDocument: clampInteger(options.maxBytesPerDocument, 1_024, 2 * 1024 * 1024, 256 * 1024),
    snippetLines: clampInteger(options.snippetLines, 1, 8, 2),
    includeContent: options.includeContent !== false,
    vectorWeight: clampNumber(options.vectorWeight, 0, 1, 0.7),
    textWeight: clampNumber(options.textWeight, 0, 1, 0.3),
  };
}

function normalizeSqliteFtsQuery(
  options: CodexProviderRelaySqliteFtsFileSearchSourceOptions,
): CodexProviderRelaySqliteFtsQueryFunction {
  if (typeof options.query === 'function') {
    return options.query;
  }
  if (options.database && typeof options.database.all === 'function') {
    return ({ sql, params }) => options.database!.all(sql, params);
  }
  throw new Error('sqlite-fts file_search source requires a query function or database.all.');
}

function buildSqliteFtsQuery({
  options,
  ftsQuery,
  pathGlob,
  maxResults,
}: {
  options: NormalizedSqliteFtsFileSearchOptions;
  ftsQuery: string;
  pathGlob: string;
  maxResults: number;
}): { sql: string; params: unknown[] } {
  const params: unknown[] = [ftsQuery];
  const selectedColumns = [
    `${options.columns.id} AS id`,
    `${options.columns.title} AS title`,
    `${options.columns.uri} AS uri`,
    `${options.columns.path} AS path`,
    `${options.columns.content} AS content`,
    `-bm25(${options.tableMatchTarget}) AS score`,
    ...options.metadataColumns.map((column) => `${column} AS ${sqlAliasFromIdentifier(column)}`),
  ];
  const where = [`${options.tableMatchTarget} MATCH ?`];
  if (pathGlob) {
    where.push(`${options.columns.path} GLOB ?`);
    params.push(pathGlob);
  }
  params.push(maxResults);
  return {
    sql: [
      `SELECT ${selectedColumns.join(', ')}`,
      `FROM ${options.table}`,
      `WHERE ${where.join(' AND ')}`,
      'ORDER BY score DESC',
      'LIMIT ?',
    ].join(' '),
    params,
  };
}

function sqliteFtsRowToMemoryDocument(
  row: JsonRecord,
  options: NormalizedSqliteFtsFileSearchOptions,
): NormalizedMemoryFileSearchDocument | null {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const id = firstNonEmptyString([row.id, row.path, row.title]);
  const content = normalizeString(row.content);
  if (!id || !content) {
    return null;
  }
  const rawPath = normalizeRelativePath(firstNonEmptyString([row.path, row.title, id]));
  const safePath = rawPath && !path.isAbsolute(rawPath) && !rawPath.split('/').includes('..')
    ? rawPath
    : `sqlite/${id}`;
  const metadata: JsonRecord = {};
  for (const column of options.metadataColumns) {
    const alias = sqlAliasFromIdentifier(column);
    if (row[alias] !== undefined) {
      metadata[alias] = row[alias];
    }
  }
  return {
    id,
    title: firstNonEmptyString([row.title, safePath, id]),
    uri: normalizeString(row.uri) || `sqlite://${encodeURIComponent(id)}`,
    path: safePath,
    content,
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
  };
}

function sqliteFtsScoreFromRow(
  row: JsonRecord,
  options: NormalizedSqliteFtsFileSearchOptions,
): number {
  const score = Number(row.score ?? row[sqlAliasFromIdentifier(options.columns.score)]);
  if (!Number.isFinite(score)) {
    return 0;
  }
  return score;
}

async function embedMemoryDocuments(
  options: NormalizedInMemoryVectorFileSearchOptions,
): Promise<EmbeddedMemoryFileSearchDocument[]> {
  if (options.documents.length === 0) {
    return [];
  }
  const input = options.documents.map((document) => embeddingTextForMemoryDocument(document));
  const result = await options.embeddingProvider.embed(input);
  const embeddedDocuments: EmbeddedMemoryFileSearchDocument[] = [];
  for (let index = 0; index < options.documents.length; index += 1) {
    const embedding = normalizeEmbeddingVector(result.embeddings[index]);
    if (embedding.length === 0) {
      continue;
    }
    embeddedDocuments.push({
      document: options.documents[index],
      embedding,
    });
  }
  return embeddedDocuments;
}

async function indexLocalVectorCandidate({
  candidate,
  options,
  maxBytesPerFile,
}: {
  candidate: CandidateFile;
  options: NormalizedLocalVectorFileSearchOptions;
  maxBytesPerFile: number;
}): Promise<{ status: 'cached' | 'indexed' | 'skipped'; chunkCount: number }> {
  const stat = await fs.stat(candidate.absolutePath).catch(() => null);
  if (!stat || !stat.isFile() || stat.size > maxBytesPerFile) {
    return { status: 'skipped', chunkCount: 0 };
  }
  const documentId = localVectorDocumentId(options.name, candidate);
  const existingDocument = await options.indexStore.getDocument(documentId);
  if (
    existingDocument
    && existingDocument.size === stat.size
    && existingDocument.mtimeMs === stat.mtimeMs
    && existingDocument.embeddingModel === options.embeddingProvider.model
  ) {
    return { status: 'cached', chunkCount: 0 };
  }

  const content = await fs.readFile(candidate.absolutePath, 'utf8').catch(() => null);
  if (!content || looksBinary(content)) {
    return { status: 'skipped', chunkCount: 0 };
  }
  const contentHash = stableContentHash(content);
  const textChunks = chunkLocalVectorText(content, options.chunking);
  if (textChunks.length === 0) {
    return { status: 'skipped', chunkCount: 0 };
  }
  const embeddings = await embedTextsInBatches(
    options.embeddingProvider,
    textChunks.map((chunk) => [
      candidate.relativePath,
      chunk.text,
    ].join('\n\n')),
    options.embeddingBatchSize,
  );
  const filename = path.basename(candidate.relativePath) || candidate.relativePath;
  const document: CodexProviderRelayLocalVectorIndexDocument = {
    id: documentId,
    sourceName: options.name,
    root: candidate.root.path,
    path: candidate.relativePath,
    uri: pathToFileURL(candidate.absolutePath).toString(),
    title: candidate.relativePath,
    filename,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    contentHash,
    embeddingModel: options.embeddingProvider.model,
    updatedAt: new Date().toISOString(),
  };
  const chunks: CodexProviderRelayLocalVectorIndexChunk[] = [];
  for (let index = 0; index < textChunks.length; index += 1) {
    const embedding = normalizeEmbeddingVector(embeddings[index]);
    if (embedding.length === 0) {
      continue;
    }
    const textChunk = textChunks[index];
    chunks.push({
      id: stableFileSearchFileId(options.name, `${documentId}:${textChunk.chunkIndex}`),
      documentId,
      sourceName: options.name,
      root: candidate.root.path,
      path: candidate.relativePath,
      uri: document.uri,
      title: document.title,
      filename,
      text: textChunk.text,
      chunkIndex: textChunk.chunkIndex,
      startLine: textChunk.startLine,
      endLine: textChunk.endLine,
      embedding,
      metadata: {
        root: candidate.root.path,
        path: candidate.relativePath,
        filename,
        content_hash: contentHash,
        embedding_model: options.embeddingProvider.model,
      },
    });
  }
  if (chunks.length === 0) {
    return { status: 'skipped', chunkCount: 0 };
  }
  await options.indexStore.upsertDocument(document, chunks);
  return { status: 'indexed', chunkCount: chunks.length };
}

async function deleteStaleLocalVectorDocuments(
  options: NormalizedLocalVectorFileSearchOptions,
  candidates: CandidateFile[],
): Promise<string[]> {
  if (!options.indexStore.deleteDocuments) {
    return [];
  }
  const candidateIds = new Set(candidates.map((candidate) => localVectorDocumentId(options.name, candidate)));
  const chunks = await options.indexStore.listChunks(options.name);
  const staleIds = [...new Set(chunks.map((chunk) => chunk.documentId))]
    .filter((documentId) => !candidateIds.has(documentId));
  if (staleIds.length > 0) {
    await options.indexStore.deleteDocuments(staleIds);
  }
  return staleIds;
}

function localVectorDocumentId(sourceName: string, candidate: CandidateFile): string {
  return stableFileSearchFileId(sourceName, `${candidate.root.path}:${candidate.relativePath}`);
}

function chunkLocalVectorText(
  content: string,
  options: NormalizedLocalVectorChunkingOptions,
): LocalVectorTextChunk[] {
  const lines = content.split(/\r?\n/u);
  const chunks: LocalVectorTextChunk[] = [];
  let lineIndex = 0;
  while (lineIndex < lines.length && chunks.length < options.maxChunksPerFile) {
    const previousStartIndex = lineIndex;
    const startLine = lineIndex + 1;
    const selectedLines: string[] = [];
    let charCount = 0;
    while (lineIndex < lines.length) {
      const line = lines[lineIndex];
      const nextLength = charCount + line.length + (selectedLines.length > 0 ? 1 : 0);
      if (selectedLines.length > 0 && nextLength > options.maxChars) {
        break;
      }
      selectedLines.push(line);
      charCount = nextLength;
      lineIndex += 1;
      if (charCount >= options.maxChars) {
        break;
      }
    }
    if (selectedLines.length === 0) {
      const line = lines[lineIndex] ?? '';
      selectedLines.push(line.slice(0, options.maxChars));
      lineIndex += 1;
    }
    const endLine = Math.max(startLine, lineIndex);
    const text = selectedLines.join('\n').trim();
    if (text) {
      chunks.push({
        text,
        chunkIndex: chunks.length,
        startLine,
        endLine,
      });
    }
    if (options.overlapChars > 0 && lineIndex < lines.length) {
      const nextLineIndex = lineIndex;
      let overlapChars = 0;
      let overlapLineIndex = Math.max(0, lineIndex - 1);
      while (overlapLineIndex > 0 && overlapChars < options.overlapChars) {
        overlapChars += lines[overlapLineIndex].length + 1;
        overlapLineIndex -= 1;
      }
      lineIndex = Math.max(overlapLineIndex + 1, previousStartIndex + 1);
      if (lineIndex >= nextLineIndex) {
        lineIndex = nextLineIndex;
      }
    }
  }
  return chunks;
}

async function embedTextsInBatches(
  embeddingProvider: CodexProviderRelayEmbeddingProvider,
  texts: string[],
  batchSize: number,
): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (let index = 0; index < texts.length; index += batchSize) {
    const batch = texts.slice(index, index + batchSize);
    const result = await embeddingProvider.embed(batch);
    for (const embedding of result.embeddings) {
      embeddings.push(normalizeEmbeddingVector(embedding));
    }
  }
  return embeddings;
}

function embeddingTextForMemoryDocument(document: NormalizedMemoryFileSearchDocument): string {
  return [
    document.title,
    document.path,
    document.content,
  ].filter(Boolean).join('\n\n');
}

async function collectCandidateFiles(
  options: NormalizedLocalFileSearchOptions,
  pathGlob: string,
): Promise<CandidateFile[]> {
  const candidates: CandidateFile[] = [];
  for (const root of options.roots) {
    await walkDirectory({
      options,
      root,
      directory: root.path,
      pathGlob,
      candidates,
    });
  }
  candidates.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return candidates;
}

async function walkDirectory({
  options,
  root,
  directory,
  pathGlob,
  candidates,
}: {
  options: NormalizedLocalFileSearchOptions;
  root: LocalFileSearchRoot;
  directory: string;
  pathGlob: string;
  candidates: CandidateFile[];
}): Promise<void> {
  if (candidates.length >= options.maxFilesScanned) {
    return;
  }
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (candidates.length >= options.maxFilesScanned) {
      return;
    }
    const entryPath = path.join(directory, entry.name);
    const relativePath = normalizeRelativePath(path.relative(root.path, entryPath));
    if (!isPathInsideRoot(root.path, entryPath)) {
      continue;
    }
    if (entry.isDirectory()) {
      if (options.ignoreDirectories.has(entry.name.toLowerCase())) {
        continue;
      }
      await walkDirectory({
        options,
        root,
        directory: entryPath,
        pathGlob,
        candidates,
      });
      continue;
    }
    if (entry.isSymbolicLink()) {
      if (!options.followSymlinks || !await isSafeSymlinkTarget(root, entryPath)) {
        continue;
      }
    }
    if (!entry.isFile() && !entry.isSymbolicLink()) {
      continue;
    }
    if (options.ignoreExtensions.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }
    if (pathGlob && !pathMatchesGlob(relativePath, pathGlob)) {
      continue;
    }
    candidates.push({
      root,
      absolutePath: entryPath,
      relativePath,
    });
  }
}

function searchFileContent({
  candidate,
  content,
  terms,
  includeContent,
  snippetLines,
  sourceName,
}: {
  candidate: CandidateFile;
  content: string;
  terms: string[];
  includeContent: boolean;
  snippetLines: number;
  sourceName: string;
}): CodexProviderRelayFileSearchSourceMatch | null {
  return searchTextContent({
    title: candidate.relativePath,
    uri: pathToFileURL(candidate.absolutePath).toString(),
    path: candidate.relativePath,
    root: candidate.root.path,
    sourceName,
    sourceType: 'local-fs',
    attributes: {
      root: candidate.root.path,
      path: candidate.relativePath,
      filename: path.basename(candidate.relativePath),
    },
    content,
    terms,
    includeContent,
    snippetLines,
  });
}

function searchTextContent({
  title,
  uri,
  path: resultPath,
  root,
  sourceName,
  sourceType,
  attributes,
  content,
  terms,
  includeContent,
  snippetLines,
}: {
  title: string;
  uri: string;
  path: string;
  root: string | null;
  sourceName: string;
  sourceType: string;
  attributes?: JsonRecord | null;
  content: string;
  terms: string[];
  includeContent: boolean;
  snippetLines: number;
}): CodexProviderRelayFileSearchSourceMatch | null {
  const score = lexicalScoreForText({
    title,
    path: resultPath,
    content,
    terms,
  });
  if (score <= 0) {
    return null;
  }
  const filename = path.basename(resultPath) || title;
  const fileId = stableFileSearchFileId(sourceName, resultPath || title);
  const normalizedAttributes = normalizeFileSearchAttributes({
    ...(attributes && typeof attributes === 'object' ? attributes : {}),
    filename,
    path: resultPath,
    source: sourceName,
    source_type: sourceType,
    ...(root ? { root } : {}),
  });
  return {
    file_id: fileId,
    filename,
    title,
    uri,
    path: resultPath,
    root,
    source: sourceName,
    sourceType,
    score,
    attributes: normalizedAttributes,
    content: includeContent
      ? contentChunksForTerms({
        content,
        terms,
        snippetLines,
      })
      : [],
  };
}
