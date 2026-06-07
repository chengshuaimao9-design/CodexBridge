import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  CodexProviderRelayHostedToolDeltaEmitter,
  CodexProviderRelayHostedToolExecutionRequest,
  CodexProviderRelayHostedToolExecutionResult,
  CodexProviderRelayHostedToolExecutor,
  JsonRecord,
} from './hosted_tool_executors.js';

export interface CodexProviderRelayFileSearchExecutorOptions {
  roots?: string[] | null;
  sources?: CodexProviderRelayFileSearchSourceInput[] | null;
  maxResults?: number | null;
  maxFilesScanned?: number | null;
  maxBytesPerFile?: number | null;
  maxPayloadBytes?: number | null;
  snippetLines?: number | null;
  includeContent?: boolean | null;
  followSymlinks?: boolean | null;
  ignoreDirectories?: string[] | null;
  ignoreExtensions?: string[] | null;
}

export type CodexProviderRelayFileSearchSourceInput =
  | CodexProviderRelayFileSearchSource
  | CodexProviderRelayLocalFileSearchSourceOptions
  | CodexProviderRelayMemoryFileSearchSourceOptions
  | CodexProviderRelaySqliteFtsFileSearchSourceOptions
  | CodexProviderRelayInMemoryVectorFileSearchSourceOptions;

export interface CodexProviderRelayFileSearchSource {
  name: string;
  type?: string | null;
  search(
    request: CodexProviderRelayFileSearchSourceRequest,
  ): Promise<CodexProviderRelayFileSearchSourceResult> | CodexProviderRelayFileSearchSourceResult;
}

export interface CodexProviderRelayFileSearchSourceRequest {
  query: string;
  terms: string[];
  pathGlob: string;
  vectorStoreIds: string[];
  filters: CodexProviderRelayFileSearchFilter | null;
  rankingOptions: CodexProviderRelayFileSearchRankingOptions;
  maxResults: number;
  maxBytesPerFile: number;
  maxPayloadBytes: number;
  snippetLines: number;
  includeContent: boolean | null;
  emitDelta?: CodexProviderRelayHostedToolDeltaEmitter | null;
  toolRequest: CodexProviderRelayHostedToolExecutionRequest;
}

export interface CodexProviderRelayFileSearchSourceResult {
  results: CodexProviderRelayFileSearchSourceMatch[];
  scannedFiles?: number | null;
  skippedFiles?: number | null;
  metadata?: JsonRecord | null;
}

export interface CodexProviderRelayLocalFileSearchSourceOptions {
  type?: 'local-fs' | null;
  name?: string | null;
  roots: string[];
  maxFilesScanned?: number | null;
  maxBytesPerFile?: number | null;
  snippetLines?: number | null;
  includeContent?: boolean | null;
  followSymlinks?: boolean | null;
  ignoreDirectories?: string[] | null;
  ignoreExtensions?: string[] | null;
}

export interface CodexProviderRelayMemoryFileSearchSourceOptions {
  type?: 'memory-documents' | null;
  name?: string | null;
  documents: CodexProviderRelayMemoryFileSearchDocument[];
  maxDocumentsScanned?: number | null;
  maxBytesPerDocument?: number | null;
  snippetLines?: number | null;
  includeContent?: boolean | null;
}

export interface CodexProviderRelayMemoryFileSearchDocument {
  id: string;
  title?: string | null;
  uri?: string | null;
  path?: string | null;
  content: string;
  metadata?: JsonRecord | null;
}

export interface CodexProviderRelaySqliteFtsFileSearchSourceOptions {
  type?: 'sqlite-fts' | null;
  name?: string | null;
  table: string;
  database?: CodexProviderRelaySqliteFtsDatabase | null;
  query?: CodexProviderRelaySqliteFtsQueryFunction | null;
  columns?: CodexProviderRelaySqliteFtsColumns | null;
  metadataColumns?: string[] | null;
  maxRows?: number | null;
  maxBytesPerDocument?: number | null;
  snippetLines?: number | null;
  includeContent?: boolean | null;
}

export interface CodexProviderRelaySqliteFtsDatabase {
  all(sql: string, params: unknown[]): Promise<JsonRecord[]> | JsonRecord[];
}

export type CodexProviderRelaySqliteFtsQueryFunction = (
  request: CodexProviderRelaySqliteFtsQueryRequest,
) => Promise<JsonRecord[]> | JsonRecord[];

export interface CodexProviderRelaySqliteFtsQueryRequest {
  sql: string;
  params: unknown[];
  query: string;
  ftsQuery: string;
  pathGlob: string;
  maxResults: number;
  terms: string[];
}

export interface CodexProviderRelaySqliteFtsColumns {
  id?: string | null;
  title?: string | null;
  uri?: string | null;
  path?: string | null;
  content?: string | null;
  score?: string | null;
}

export interface CodexProviderRelayEmbeddingProvider {
  model: string;
  embed(
    input: string[],
    options?: CodexProviderRelayEmbeddingProviderEmbedOptions,
  ): Promise<CodexProviderRelayEmbeddingProviderResult> | CodexProviderRelayEmbeddingProviderResult;
}

export interface CodexProviderRelayEmbeddingProviderEmbedOptions {
  signal?: AbortSignal | null;
}

export interface CodexProviderRelayEmbeddingProviderResult {
  model: string;
  embeddings: number[][];
  dimensions?: number | null;
}

export type CodexProviderRelayEmbeddingsApiResponseParser = (body: JsonRecord) => number[][];

export interface CodexProviderRelayEmbeddingsApiProviderOptions {
  apiKey?: string | null;
  model?: string | null;
  endpoint?: string | null;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string> | null;
  requestBody?: JsonRecord | null;
  responseParser?: CodexProviderRelayEmbeddingsApiResponseParser | null;
}

export interface CodexProviderRelayOpenRouterEmbeddingProviderOptions
  extends Omit<CodexProviderRelayEmbeddingsApiProviderOptions, 'endpoint' | 'model'> {
  model?: string | null;
  endpoint?: string | null;
}

export interface CodexProviderRelayInMemoryVectorFileSearchSourceOptions {
  type?: 'in-memory-vector' | null;
  name?: string | null;
  documents: CodexProviderRelayMemoryFileSearchDocument[];
  embeddingProvider: CodexProviderRelayEmbeddingProvider;
  maxDocumentsScanned?: number | null;
  maxBytesPerDocument?: number | null;
  snippetLines?: number | null;
  includeContent?: boolean | null;
  vectorWeight?: number | null;
  textWeight?: number | null;
}

export interface CodexProviderRelayFileSearchSourceMatch {
  file_id?: string | null;
  filename?: string | null;
  title: string;
  uri: string;
  path: string;
  root?: string | null;
  source?: string | null;
  sourceType?: string | null;
  score: number;
  attributes?: JsonRecord | null;
  content?: CodexProviderRelayFileSearchChunk[] | null;
}

export interface CodexProviderRelayFileSearchDocument {
  file_id: string;
  filename: string;
  title: string;
  uri: string;
  path: string;
  root?: string | null;
  source?: string | null;
  sourceType?: string | null;
  attributes: JsonRecord;
}

export interface CodexProviderRelayFileSearchChunk {
  type: 'text';
  text: string;
  line?: number | null;
  start_line?: number | null;
  end_line?: number | null;
}

export interface CodexProviderRelayFileSearchResult {
  file_id: string;
  filename: string;
  score: number;
  attributes: JsonRecord;
  content: CodexProviderRelayFileSearchChunk[];
}

export type CodexProviderRelayFileSearchFilter =
  | {
    type: 'and' | 'or';
    filters: CodexProviderRelayFileSearchFilter[];
  }
  | {
    type: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin';
    key?: string | null;
    property?: string | null;
    value: unknown;
  };

export interface CodexProviderRelayFileSearchRankingOptions {
  ranker: string;
  scoreThreshold: number;
  hybridSearch: {
    embeddingWeight: number;
    textWeight: number;
  } | null;
}

export interface CodexProviderRelayFileSearchExecutorContent {
  object: 'vector_store.search_results.page';
  query: string;
  search_query: string;
  provider: string;
  data: CodexProviderRelayFileSearchResult[];
  search_results: CodexProviderRelayFileSearchResult[];
  has_more: boolean;
  next_page: string | null;
  vector_store_ids: string[];
  ranking_options: CodexProviderRelayFileSearchRankingOptions;
  sourceCount: number;
  scannedFiles: number;
  skippedFiles: number;
}

interface NormalizedFileSearchOptions {
  sources: CodexProviderRelayFileSearchSource[];
  maxResults: number;
  maxBytesPerFile: number;
  maxPayloadBytes: number;
  snippetLines: number;
  includeContent: boolean | null;
}

interface NormalizedLocalFileSearchOptions {
  name: string;
  type: 'local-fs';
  roots: LocalFileSearchRoot[];
  maxFilesScanned: number;
  maxBytesPerFile: number;
  snippetLines: number;
  includeContent: boolean;
  followSymlinks: boolean;
  ignoreDirectories: Set<string>;
  ignoreExtensions: Set<string>;
}

interface NormalizedMemoryFileSearchOptions {
  name: string;
  type: 'memory-documents';
  documents: NormalizedMemoryFileSearchDocument[];
  maxDocumentsScanned: number;
  maxBytesPerDocument: number;
  snippetLines: number;
  includeContent: boolean;
}

interface NormalizedMemoryFileSearchDocument {
  id: string;
  title: string;
  uri: string;
  path: string;
  content: string;
  metadata: JsonRecord | null;
}

interface NormalizedSqliteFtsFileSearchOptions {
  name: string;
  type: 'sqlite-fts';
  table: string;
  tableMatchTarget: string;
  query: CodexProviderRelaySqliteFtsQueryFunction;
  columns: Required<CodexProviderRelaySqliteFtsColumns>;
  metadataColumns: string[];
  maxRows: number;
  maxBytesPerDocument: number;
  snippetLines: number;
  includeContent: boolean;
}

interface NormalizedInMemoryVectorFileSearchOptions {
  name: string;
  type: 'in-memory-vector';
  documents: NormalizedMemoryFileSearchDocument[];
  embeddingProvider: CodexProviderRelayEmbeddingProvider;
  maxDocumentsScanned: number;
  maxBytesPerDocument: number;
  snippetLines: number;
  includeContent: boolean;
  vectorWeight: number;
  textWeight: number;
}

interface EmbeddedMemoryFileSearchDocument {
  document: NormalizedMemoryFileSearchDocument;
  embedding: number[];
}

interface LocalFileSearchRoot {
  path: string;
  realPath: string;
}

interface CandidateFile {
  root: LocalFileSearchRoot;
  absolutePath: string;
  relativePath: string;
}

const DEFAULT_IGNORE_DIRECTORIES = [
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'build',
  'node_modules',
];

const DEFAULT_IGNORE_EXTENSIONS = [
  '.7z',
  '.avi',
  '.bin',
  '.bmp',
  '.class',
  '.dll',
  '.dmg',
  '.exe',
  '.gif',
  '.gz',
  '.ico',
  '.jar',
  '.jpeg',
  '.jpg',
  '.lock',
  '.mov',
  '.mp3',
  '.mp4',
  '.pdf',
  '.png',
  '.so',
  '.tar',
  '.webp',
  '.zip',
];

const DEFAULT_EMBEDDINGS_API_MODEL = 'qwen/qwen3-embedding-8b';
const DEFAULT_EMBEDDINGS_API_ENDPOINT = 'https://openrouter.ai/api/v1/embeddings';
const DEFAULT_OPENROUTER_EMBEDDING_MODEL = DEFAULT_EMBEDDINGS_API_MODEL;
const DEFAULT_OPENROUTER_EMBEDDINGS_ENDPOINT = DEFAULT_EMBEDDINGS_API_ENDPOINT;

export function createCodexProviderRelayFileSearchExecutor(
  options: CodexProviderRelayFileSearchExecutorOptions,
): CodexProviderRelayHostedToolExecutor {
  const normalizedOptions = normalizeFileSearchOptions(options);
  return async (
    request: CodexProviderRelayHostedToolExecutionRequest,
  ): Promise<CodexProviderRelayHostedToolExecutionResult> => {
    const query = fileSearchQueryFromRequest(request);
    if (!query) {
      throw new Error('file_search executor requires a non-empty query argument.');
    }
    const terms = tokenizeQuery(query);
    if (terms.length === 0) {
      throw new Error('file_search executor requires at least one searchable query term.');
    }
    const maxResults = fileSearchMaxResultsFromRequest(request, normalizedOptions.maxResults);
    const includeContent = typeof request.arguments.include_content === 'boolean'
      ? request.arguments.include_content
      : normalizedOptions.includeContent;
    const pathGlob = normalizePathGlob(request.arguments.path_glob);
    const vectorStoreIds = normalizeStringArray(request.arguments.vector_store_ids);
    const filters = normalizeFileSearchFilter(request.arguments.filters ?? request.arguments.attribute_filter);
    const rankingOptions = normalizeFileSearchRankingOptions(request.arguments.ranking_options);
    const searchSources = selectFileSearchSources(normalizedOptions.sources, vectorStoreIds);

    await request.emitDelta?.('searching sources', {
      sourceCount: searchSources.length,
      maxResults,
      vectorStoreIds,
    });

    const aggregatedResults: CodexProviderRelayFileSearchSourceMatch[] = [];
    let scannedFiles = 0;
    let skippedFiles = 0;
    for (const source of searchSources) {
      const sourceType = normalizeSourceType(source);
      await request.emitDelta?.('searching source', {
        source: source.name,
        sourceType,
      });
      const sourceResult = await source.search({
        query,
        terms,
        pathGlob,
        vectorStoreIds,
        filters,
        rankingOptions,
        maxResults,
        maxBytesPerFile: normalizedOptions.maxBytesPerFile,
        maxPayloadBytes: normalizedOptions.maxPayloadBytes,
        snippetLines: normalizedOptions.snippetLines,
        includeContent,
        emitDelta: request.emitDelta,
        toolRequest: request,
      });
      scannedFiles += normalizeNonNegativeInteger(sourceResult.scannedFiles);
      skippedFiles += normalizeNonNegativeInteger(sourceResult.skippedFiles);
      for (const result of sourceResult.results ?? []) {
        aggregatedResults.push(normalizeFileSearchResult(result, source, sourceType));
      }
    }

    const filteredResults = aggregatedResults.filter((result) => fileSearchResultMatchesFilter(result, filters));
    filteredResults.sort((left, right) => (
      right.score - left.score
      || String(left.source ?? '').localeCompare(String(right.source ?? ''))
      || left.path.localeCompare(right.path)
    ));
    const rankedResults = applyFileSearchRankingOptions(filteredResults, rankingOptions);
    const limitedResults = limitResultsByPayload(
      rankedResults,
      maxResults,
      normalizedOptions.maxPayloadBytes,
    );
    const openAIResults = limitedResults.map((result) => toOpenAIFileSearchResult(result, rankedResults));
    const provider = searchSources.length === 1
      ? normalizeSourceType(searchSources[0])
      : 'multi-source';
    return {
      content: {
        object: 'vector_store.search_results.page',
        query,
        search_query: query,
        provider,
        data: openAIResults,
        search_results: openAIResults,
        has_more: rankedResults.length > limitedResults.length,
        next_page: null,
        vector_store_ids: vectorStoreIds,
        ranking_options: rankingOptions,
        sourceCount: searchSources.length,
        scannedFiles,
        skippedFiles,
      } satisfies CodexProviderRelayFileSearchExecutorContent,
      metadata: {
        provider,
        sourceCount: searchSources.length,
        resultCount: limitedResults.length,
        scannedFiles,
        skippedFiles,
      },
    };
  };
}

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

export function createCodexProviderRelayEmbeddingsApiProvider(
  options: CodexProviderRelayEmbeddingsApiProviderOptions,
): CodexProviderRelayEmbeddingProvider {
  const apiKey = normalizeString(options.apiKey);
  const model = normalizeString(options.model) || DEFAULT_EMBEDDINGS_API_MODEL;
  const endpoint = normalizeString(options.endpoint) || DEFAULT_EMBEDDINGS_API_ENDPOINT;
  const fetchImpl = options.fetchImpl ?? fetch;
  const extraHeaders = normalizeHeaders(options.headers);
  const baseRequestBody = isJsonRecord(options.requestBody) ? options.requestBody : {};
  const responseParser = options.responseParser ?? normalizeEmbeddingsApiResponseData;
  return {
    model,
    async embed(
      input: string[],
      embedOptions: CodexProviderRelayEmbeddingProviderEmbedOptions = {},
    ): Promise<CodexProviderRelayEmbeddingProviderResult> {
      const texts = input.map(normalizeString).filter(Boolean);
      if (texts.length === 0) {
        return {
          model,
          embeddings: [],
          dimensions: null,
        };
      }
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        signal: embedOptions.signal ?? undefined,
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
        body: JSON.stringify({
          ...baseRequestBody,
          model,
          input: texts,
        }),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Embeddings API provider returned HTTP ${response.status}: ${text.slice(0, 500)}`);
      }
      const body = parseJsonRecord(text, 'Embeddings API response');
      const embeddings = responseParser(body);
      return {
        model: normalizeString(body.model) || model,
        embeddings,
        dimensions: embeddings[0]?.length ?? null,
      };
    },
  };
}

export function createCodexProviderRelayOpenRouterEmbeddingProvider(
  options: CodexProviderRelayOpenRouterEmbeddingProviderOptions,
): CodexProviderRelayEmbeddingProvider {
  const apiKey = normalizeString(options.apiKey);
  if (!apiKey) {
    throw new Error('OpenRouter embedding provider requires an API key.');
  }
  return createCodexProviderRelayEmbeddingsApiProvider({
    ...options,
    apiKey,
    model: normalizeString(options.model) || DEFAULT_OPENROUTER_EMBEDDING_MODEL,
    endpoint: normalizeString(options.endpoint) || DEFAULT_OPENROUTER_EMBEDDINGS_ENDPOINT,
  });
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

function normalizeFileSearchOptions(
  options: CodexProviderRelayFileSearchExecutorOptions,
): NormalizedFileSearchOptions {
  const sources = normalizeFileSearchSources(options);
  if (sources.length === 0) {
    throw new Error('file_search executor requires at least one source or explicit root.');
  }
  return {
    sources,
    maxResults: clampInteger(options.maxResults, 1, 50, 8),
    maxBytesPerFile: clampInteger(options.maxBytesPerFile, 1_024, 2 * 1024 * 1024, 256 * 1024),
    maxPayloadBytes: clampInteger(options.maxPayloadBytes, 1_024, 2 * 1024 * 1024, 128 * 1024),
    snippetLines: clampInteger(options.snippetLines, 1, 8, 2),
    includeContent: typeof options.includeContent === 'boolean' ? options.includeContent : null,
  };
}

function normalizeFileSearchSources(
  options: CodexProviderRelayFileSearchExecutorOptions,
): CodexProviderRelayFileSearchSource[] {
  const sources: CodexProviderRelayFileSearchSource[] = [];
  if (Array.isArray(options.sources)) {
    for (const source of options.sources) {
      sources.push(normalizeFileSearchSource(source));
    }
  }
  if (Array.isArray(options.roots) && options.roots.length > 0) {
    sources.push(createCodexProviderRelayLocalFileSearchSource({
      roots: options.roots,
      maxFilesScanned: options.maxFilesScanned,
      maxBytesPerFile: options.maxBytesPerFile,
      snippetLines: options.snippetLines,
      includeContent: options.includeContent,
      followSymlinks: options.followSymlinks,
      ignoreDirectories: options.ignoreDirectories,
      ignoreExtensions: options.ignoreExtensions,
    }));
  }
  return sources;
}

function normalizeFileSearchSource(
  source: CodexProviderRelayFileSearchSourceInput,
): CodexProviderRelayFileSearchSource {
  if (source && typeof (source as CodexProviderRelayFileSearchSource).search === 'function') {
    const adapter = source as CodexProviderRelayFileSearchSource;
    const name = normalizeString(adapter.name);
    if (!name) {
      throw new Error('file_search source adapters require a non-empty name.');
    }
    return {
      ...adapter,
      name,
      type: normalizeString(adapter.type) || 'custom',
    };
  }
  if (source && Array.isArray((source as CodexProviderRelayLocalFileSearchSourceOptions).roots)) {
    return createCodexProviderRelayLocalFileSearchSource(source as CodexProviderRelayLocalFileSearchSourceOptions);
  }
  if (
    source
    && Array.isArray((source as CodexProviderRelayInMemoryVectorFileSearchSourceOptions).documents)
    && (source as CodexProviderRelayInMemoryVectorFileSearchSourceOptions).embeddingProvider
  ) {
    return createCodexProviderRelayInMemoryVectorFileSearchSource(source as CodexProviderRelayInMemoryVectorFileSearchSourceOptions);
  }
  if (source && Array.isArray((source as CodexProviderRelayMemoryFileSearchSourceOptions).documents)) {
    return createCodexProviderRelayMemoryFileSearchSource(source as CodexProviderRelayMemoryFileSearchSourceOptions);
  }
  if (source && normalizeString((source as CodexProviderRelaySqliteFtsFileSearchSourceOptions).table)) {
    return createCodexProviderRelaySqliteFtsFileSearchSource(source as CodexProviderRelaySqliteFtsFileSearchSourceOptions);
  }
  throw new Error('file_search sources must be source adapters, local-fs source options, memory-documents source options, sqlite-fts source options, or in-memory-vector source options.');
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

function embeddingTextForMemoryDocument(document: NormalizedMemoryFileSearchDocument): string {
  return [
    document.title,
    document.path,
    document.content,
  ].filter(Boolean).join('\n\n');
}

function normalizeEmbeddingsApiResponseData(body: JsonRecord): number[][] {
  if (!Array.isArray(body.data)) {
    throw new Error('Embeddings API response data must be an array.');
  }
  return body.data.map((entry) => {
    const embedding = Array.isArray(entry)
      ? entry
      : Array.isArray(entry?.embedding)
        ? entry.embedding
        : [];
    return normalizeEmbeddingVector(embedding);
  });
}

function normalizeHeaders(value: Record<string, string> | null | undefined): Record<string, string> {
  if (!value) {
    return {};
  }
  return Object.fromEntries(Object.entries(value)
    .map(([key, headerValue]) => [normalizeString(key), normalizeString(headerValue)] as const)
    .filter(([key, headerValue]) => key && headerValue));
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeEmbeddingVector(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry));
}

function parseJsonRecord(text: string, label: string): JsonRecord {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON object.`);
    }
    return parsed as JsonRecord;
  } catch (error) {
    if (error instanceof Error && error.message.includes(label)) {
      throw error;
    }
    throw new Error(`${label} was not valid JSON: ${text.slice(0, 500)}`);
  }
}

function cosineSimilarity(left: number[], right: number[]): number {
  const dimensions = Math.min(left.length, right.length);
  if (dimensions === 0) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < dimensions; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  if (leftNorm <= 0 || rightNorm <= 0) {
    return 0;
  }
  return Math.max(0, dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)));
}

function lexicalScoreForText({
  title,
  path: resultPath,
  content,
  terms,
}: {
  title: string;
  path: string;
  content: string;
  terms: string[];
}): number {
  let score = 0;
  const lowerPath = resultPath.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const lowerContent = content.toLowerCase();
  for (const term of terms) {
    if (lowerPath.includes(term)) {
      score += 2;
    }
    if (lowerTitle.includes(term)) {
      score += 4;
    }
    const matches = lowerContent.match(new RegExp(escapeRegExp(term), 'gu'));
    score += (matches?.length ?? 0) * 10;
  }
  return score;
}

function createFileSearchSourceMatchFromDocument({
  document,
  sourceName,
  sourceType,
  score,
  includeContent,
  snippetLines,
  terms,
  attributes,
}: {
  document: NormalizedMemoryFileSearchDocument;
  sourceName: string;
  sourceType: string;
  score: number;
  includeContent: boolean;
  snippetLines: number;
  terms: string[];
  attributes?: JsonRecord | null;
}): CodexProviderRelayFileSearchSourceMatch | null {
  if (score <= 0) {
    return null;
  }
  const filename = path.basename(document.path) || document.title;
  const contentChunks = includeContent
    ? contentChunksForTerms({
      content: document.content,
      terms,
      snippetLines,
    })
    : [];
  return {
    file_id: stableFileSearchFileId(sourceName, document.path || document.title),
    filename,
    title: document.title,
    uri: document.uri,
    path: document.path,
    root: null,
    source: sourceName,
    sourceType,
    score,
    attributes: normalizeFileSearchAttributes({
      ...(attributes && typeof attributes === 'object' ? attributes : {}),
      filename,
      path: document.path,
      source: sourceName,
      source_type: sourceType,
    }),
    content: contentChunks,
  };
}

function contentChunksForTerms({
  content,
  terms,
  snippetLines,
}: {
  content: string;
  terms: string[];
  snippetLines: number;
}): CodexProviderRelayFileSearchChunk[] {
  const lines = content.split(/\r?\n/u);
  const chunks: CodexProviderRelayFileSearchChunk[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const lowerLine = lines[index].toLowerCase();
    const hits = terms.filter((term) => lowerLine.includes(term)).length;
    if (hits === 0) {
      continue;
    }
    for (
      let snippetIndex = Math.max(0, index - snippetLines);
      snippetIndex <= Math.min(lines.length - 1, index + snippetLines);
      snippetIndex += 1
    ) {
      if (chunks.some((chunk) => chunk.line === snippetIndex + 1)) {
        continue;
      }
      chunks.push({
        type: 'text',
        line: snippetIndex + 1,
        text: lines[snippetIndex].slice(0, 500),
        start_line: snippetIndex + 1,
        end_line: snippetIndex + 1,
      });
      if (chunks.length >= 4) {
        return chunks;
      }
    }
  }
  if (chunks.length === 0 && content) {
    chunks.push({
      type: 'text',
      line: 1,
      text: content.split(/\r?\n/u)[0]?.slice(0, 500) ?? '',
      start_line: 1,
      end_line: 1,
    });
  }
  return chunks.filter((chunk) => chunk.text);
}

function sqliteFtsQueryFromTerms(terms: string[]): string {
  return terms
    .map((term) => `"${term.replace(/"/gu, '""')}"`)
    .join(' OR ');
}

function normalizeSqlIdentifier(value: unknown, label: string): string {
  const raw = normalizeString(value);
  if (!raw) {
    throw new Error(`${label} is required.`);
  }
  const parts = raw.split('.');
  if (parts.some((part) => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(part))) {
    throw new Error(`${label} must be a safe SQL identifier.`);
  }
  return parts.map((part) => `"${part}"`).join('.');
}

function sqlAliasFromIdentifier(identifier: string): string {
  return identifier
    .split('.')
    .at(-1)!
    .replace(/^"|"$/gu, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
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

function fileSearchQueryFromRequest(request: CodexProviderRelayHostedToolExecutionRequest): string {
  return firstNonEmptyString([
    request.arguments.query,
    request.arguments.q,
    request.arguments.search_query,
    request.arguments.input,
    request.rawArguments,
  ]);
}

function fileSearchMaxResultsFromRequest(
  request: CodexProviderRelayHostedToolExecutionRequest,
  fallback: number,
): number {
  return clampInteger(
    request.arguments.max_num_results ?? request.arguments.max_results,
    1,
    50,
    fallback,
  );
}

function selectFileSearchSources(
  sources: CodexProviderRelayFileSearchSource[],
  vectorStoreIds: string[],
): CodexProviderRelayFileSearchSource[] {
  if (vectorStoreIds.length === 0) {
    return sources;
  }
  const allowed = new Set(vectorStoreIds.map((entry) => entry.toLowerCase()));
  return sources.filter((source) => allowed.has(source.name.toLowerCase()));
}

function normalizeFileSearchRankingOptions(value: unknown): CodexProviderRelayFileSearchRankingOptions {
  const record = value && typeof value === 'object' ? value as JsonRecord : {};
  const hybridSearch = record.hybrid_search && typeof record.hybrid_search === 'object'
    ? record.hybrid_search as JsonRecord
    : null;
  return {
    ranker: normalizeString(record.ranker) || 'auto',
    scoreThreshold: clampNumber(record.score_threshold, 0, 1, 0),
    hybridSearch: hybridSearch
      ? {
        embeddingWeight: clampNumber(
          hybridSearch.embedding_weight ?? hybridSearch.rrf_embedding_weight,
          0,
          1,
          0.5,
        ),
        textWeight: clampNumber(
          hybridSearch.text_weight ?? hybridSearch.rrf_text_weight,
          0,
          1,
          0.5,
        ),
      }
      : null,
  };
}

function normalizeFileSearchFilter(value: unknown): CodexProviderRelayFileSearchFilter | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as JsonRecord;
  const type = normalizeString(record.type).toLowerCase();
  if ((type === 'and' || type === 'or') && Array.isArray(record.filters)) {
    const filters = record.filters.map(normalizeFileSearchFilter).filter(Boolean) as CodexProviderRelayFileSearchFilter[];
    return filters.length > 0 ? { type, filters } : null;
  }
  if (['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin'].includes(type)) {
    const key = normalizeString(record.key ?? record.property);
    if (!key) {
      return null;
    }
    return {
      type: type as 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin',
      key: normalizeString(record.key) || null,
      property: normalizeString(record.property) || null,
      value: record.value,
    };
  }
  return null;
}

function fileSearchResultMatchesFilter(
  result: CodexProviderRelayFileSearchSourceMatch,
  filter: CodexProviderRelayFileSearchFilter | null,
): boolean {
  if (!filter) {
    return true;
  }
  if (filter.type === 'and') {
    return filter.filters.every((entry) => fileSearchResultMatchesFilter(result, entry));
  }
  if (filter.type === 'or') {
    return filter.filters.some((entry) => fileSearchResultMatchesFilter(result, entry));
  }
  const comparisonFilter = filter as Extract<CodexProviderRelayFileSearchFilter, { value: unknown }>;
  const key = normalizeString(comparisonFilter.key ?? comparisonFilter.property);
  const actual = fileSearchResultAttributeValue(result, key);
  switch (comparisonFilter.type) {
    case 'eq':
      return compareFilterValues(actual, comparisonFilter.value) === 0;
    case 'ne':
      return compareFilterValues(actual, comparisonFilter.value) !== 0;
    case 'gt':
      return compareFilterValues(actual, comparisonFilter.value) > 0;
    case 'gte':
      return compareFilterValues(actual, comparisonFilter.value) >= 0;
    case 'lt':
      return compareFilterValues(actual, comparisonFilter.value) < 0;
    case 'lte':
      return compareFilterValues(actual, comparisonFilter.value) <= 0;
    case 'in':
      return Array.isArray(comparisonFilter.value)
        ? comparisonFilter.value.some((value) => compareFilterValues(actual, value) === 0)
        : false;
    case 'nin':
      return Array.isArray(comparisonFilter.value)
        ? !comparisonFilter.value.some((value) => compareFilterValues(actual, value) === 0)
        : true;
    default:
      return true;
  }
}

function fileSearchResultAttributeValue(result: CodexProviderRelayFileSearchSourceMatch, key: string): unknown {
  const attributes = result.attributes && typeof result.attributes === 'object'
    ? result.attributes
    : {};
  switch (key) {
    case 'file_id':
      return result.file_id;
    case 'filename':
      return result.filename;
    case 'path':
      return result.path;
    case 'source':
      return result.source;
    case 'source_type':
    case 'sourceType':
      return result.sourceType;
    default:
      return attributes[key];
  }
}

function compareFilterValues(left: unknown, right: unknown): number {
  if (typeof left === 'number' || typeof right === 'number') {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
      return String(left ?? '').localeCompare(String(right ?? ''));
    }
    return leftNumber === rightNumber ? 0 : leftNumber > rightNumber ? 1 : -1;
  }
  const leftString = String(left ?? '');
  const rightString = String(right ?? '');
  return leftString === rightString ? 0 : leftString.localeCompare(rightString);
}

function applyFileSearchRankingOptions(
  results: CodexProviderRelayFileSearchSourceMatch[],
  rankingOptions: CodexProviderRelayFileSearchRankingOptions,
): CodexProviderRelayFileSearchSourceMatch[] {
  if (rankingOptions.scoreThreshold <= 0 || results.length === 0) {
    return results;
  }
  const maxScore = Math.max(...results.map((result) => result.score), 0);
  if (maxScore <= 0) {
    return [];
  }
  return results.filter((result) => result.score / maxScore >= rankingOptions.scoreThreshold);
}

function toOpenAIFileSearchResult(
  result: CodexProviderRelayFileSearchSourceMatch,
  rankedResults: CodexProviderRelayFileSearchSourceMatch[],
): CodexProviderRelayFileSearchResult {
  return {
    file_id: normalizeString(result.file_id) || stableFileSearchFileId(result.source ?? 'file_search', result.path),
    filename: normalizeString(result.filename) || path.basename(result.path) || result.title,
    score: normalizeOpenAIFileSearchScore(result, rankedResults),
    attributes: normalizeFileSearchAttributes(result.attributes),
    content: Array.isArray(result.content)
      ? result.content.map(normalizeFileSearchChunk).filter(Boolean) as CodexProviderRelayFileSearchChunk[]
      : [],
  };
}

function normalizeOpenAIFileSearchScore(
  result: CodexProviderRelayFileSearchSourceMatch,
  rankedResults: CodexProviderRelayFileSearchSourceMatch[],
): number {
  const maxScore = Math.max(...rankedResults.map((entry) => entry.score), 0);
  if (maxScore <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, Number((result.score / maxScore).toFixed(6))));
}

function normalizeFileSearchChunk(value: CodexProviderRelayFileSearchChunk): CodexProviderRelayFileSearchChunk | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const text = normalizeString(value.text);
  if (!text) {
    return null;
  }
  return {
    type: 'text',
    text,
    line: value.line ?? null,
    start_line: value.start_line ?? value.line ?? null,
    end_line: value.end_line ?? value.line ?? null,
  };
}

function tokenizeQuery(query: string): string[] {
  return [...new Set(query
    .toLowerCase()
    .split(/[^a-z0-9_\-\u4e00-\u9fff]+/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 2))];
}

function looksBinary(content: string): boolean {
  return content.includes('\0');
}

function pathMatchesGlob(relativePath: string, glob: string): boolean {
  const normalizedGlob = normalizeRelativePath(glob);
  if (!normalizedGlob || normalizedGlob === '*') {
    return true;
  }
  if (!normalizedGlob.includes('*')) {
    return relativePath.includes(normalizedGlob);
  }
  const escaped = normalizedGlob
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/gu, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`, 'u').test(relativePath);
}

async function isSafeSymlinkTarget(root: LocalFileSearchRoot, candidate: string): Promise<boolean> {
  const realPath = await fs.realpath(candidate).catch(() => '');
  return Boolean(realPath && isPathInsideRoot(root.realPath, realPath));
}

function isPathInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizePathGlob(value: unknown): string {
  const normalized = normalizeRelativePath(normalizeString(value));
  if (!normalized) {
    return '';
  }
  if (path.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new Error('file_search path_glob must stay inside configured roots.');
  }
  return normalized;
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/gu, '/');
}

function firstNonEmptyString(values: unknown[]): string {
  for (const value of values) {
    const normalized = normalizeString(value);
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map(normalizeString).filter(Boolean))];
}

function normalizeFileSearchAttributes(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const attributes: JsonRecord = {};
  for (const [key, entryValue] of Object.entries(value as JsonRecord)) {
    const normalizedKey = normalizeString(key);
    if (!normalizedKey || entryValue === undefined) {
      continue;
    }
    if (
      entryValue === null
      || typeof entryValue === 'string'
      || typeof entryValue === 'number'
      || typeof entryValue === 'boolean'
      || Array.isArray(entryValue)
    ) {
      attributes[normalizedKey] = entryValue;
    }
  }
  return attributes;
}

function stableFileSearchFileId(sourceName: string, resultPath: string): string {
  const raw = `${sourceName}:${resultPath}`;
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `file_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function normalizeSourceType(source: CodexProviderRelayFileSearchSource): string {
  return normalizeString(source.type) || 'custom';
}

function normalizeFileSearchResult(
  result: CodexProviderRelayFileSearchSourceMatch,
  source: CodexProviderRelayFileSearchSource,
  sourceType: string,
): CodexProviderRelayFileSearchSourceMatch {
  const normalizedPath = normalizeString(result.path) || normalizeString(result.title);
  const normalizedTitle = normalizeString(result.title) || normalizedPath || source.name;
  const filename = normalizeString(result.filename) || path.basename(normalizedPath) || normalizedTitle;
  const sourceName = normalizeString(result.source) || source.name;
  const normalizedSourceType = normalizeString(result.sourceType) || sourceType;
  const content = Array.isArray(result.content)
    ? result.content.map(normalizeFileSearchChunk).filter(Boolean) as CodexProviderRelayFileSearchChunk[]
    : [];
  const attributes = normalizeFileSearchAttributes({
    ...(result.attributes && typeof result.attributes === 'object' ? result.attributes : {}),
    filename,
    path: normalizedPath,
    source: sourceName,
    source_type: normalizedSourceType,
    ...(result.root ? { root: result.root } : {}),
  });
  return {
    file_id: normalizeString(result.file_id) || stableFileSearchFileId(sourceName, normalizedPath || normalizedTitle),
    filename,
    title: normalizedTitle,
    uri: normalizeString(result.uri),
    path: normalizedPath,
    root: result.root ?? null,
    source: sourceName,
    sourceType: normalizedSourceType,
    score: Number.isFinite(Number(result.score)) ? Number(result.score) : 0,
    attributes,
    content,
  };
}

function limitResultsByPayload(
  results: CodexProviderRelayFileSearchSourceMatch[],
  maxResults: number,
  maxPayloadBytes: number,
): CodexProviderRelayFileSearchSourceMatch[] {
  const limited: CodexProviderRelayFileSearchSourceMatch[] = [];
  let payloadBytes = 0;
  for (const result of results) {
    if (limited.length >= maxResults) {
      break;
    }
    const resultBytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
    if (limited.length > 0 && payloadBytes + resultBytes > maxPayloadBytes) {
      break;
    }
    limited.push(result);
    payloadBytes += resultBytes;
  }
  return limited;
}

function normalizeNonNegativeInteger(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }
  return Math.floor(number);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}
