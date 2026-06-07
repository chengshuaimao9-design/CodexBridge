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
  | CodexProviderRelaySqliteFtsFileSearchSourceOptions;

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
  maxResults: number;
  maxBytesPerFile: number;
  maxPayloadBytes: number;
  snippetLines: number;
  includeContent: boolean | null;
  emitDelta?: CodexProviderRelayHostedToolDeltaEmitter | null;
  toolRequest: CodexProviderRelayHostedToolExecutionRequest;
}

export interface CodexProviderRelayFileSearchSourceResult {
  results: CodexProviderRelayFileSearchResult[];
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

export interface CodexProviderRelayFileSearchResult {
  title: string;
  uri: string;
  path: string;
  root?: string | null;
  source?: string | null;
  sourceType?: string | null;
  score: number;
  snippets: Array<{
    line: number;
    text: string;
  }>;
}

export interface CodexProviderRelayFileSearchExecutorContent {
  query: string;
  provider: string;
  results: CodexProviderRelayFileSearchResult[];
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
    const maxResults = clampInteger(request.arguments.max_results, 1, 50, normalizedOptions.maxResults);
    const includeContent = typeof request.arguments.include_content === 'boolean'
      ? request.arguments.include_content
      : normalizedOptions.includeContent;
    const pathGlob = normalizePathGlob(request.arguments.path_glob);

    await request.emitDelta?.('searching sources', {
      sourceCount: normalizedOptions.sources.length,
      maxResults,
    });

    const aggregatedResults: CodexProviderRelayFileSearchResult[] = [];
    let scannedFiles = 0;
    let skippedFiles = 0;
    for (const source of normalizedOptions.sources) {
      const sourceType = normalizeSourceType(source);
      await request.emitDelta?.('searching source', {
        source: source.name,
        sourceType,
      });
      const sourceResult = await source.search({
        query,
        terms,
        pathGlob,
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

    aggregatedResults.sort((left, right) => (
      right.score - left.score
      || String(left.source ?? '').localeCompare(String(right.source ?? ''))
      || left.path.localeCompare(right.path)
    ));
    const limitedResults = limitResultsByPayload(
      aggregatedResults,
      maxResults,
      normalizedOptions.maxPayloadBytes,
    );
    return {
      content: {
        query,
        provider: normalizedOptions.sources.length === 1
          ? normalizeSourceType(normalizedOptions.sources[0])
          : 'multi-source',
        results: limitedResults,
        sourceCount: normalizedOptions.sources.length,
        scannedFiles,
        skippedFiles,
      } satisfies CodexProviderRelayFileSearchExecutorContent,
      metadata: {
        provider: normalizedOptions.sources.length === 1
          ? normalizeSourceType(normalizedOptions.sources[0])
          : 'multi-source',
        sourceCount: normalizedOptions.sources.length,
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

      const results: CodexProviderRelayFileSearchResult[] = [];
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

      const results: CodexProviderRelayFileSearchResult[] = [];
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

      const results: CodexProviderRelayFileSearchResult[] = [];
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
  if (source && Array.isArray((source as CodexProviderRelayMemoryFileSearchSourceOptions).documents)) {
    return createCodexProviderRelayMemoryFileSearchSource(source as CodexProviderRelayMemoryFileSearchSourceOptions);
  }
  if (source && normalizeString((source as CodexProviderRelaySqliteFtsFileSearchSourceOptions).table)) {
    return createCodexProviderRelaySqliteFtsFileSearchSource(source as CodexProviderRelaySqliteFtsFileSearchSourceOptions);
  }
  throw new Error('file_search sources must be source adapters, local-fs source options, memory-documents source options, or sqlite-fts source options.');
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
}): CodexProviderRelayFileSearchResult | null {
  return searchTextContent({
    title: candidate.relativePath,
    uri: pathToFileURL(candidate.absolutePath).toString(),
    path: candidate.relativePath,
    root: candidate.root.path,
    sourceName,
    sourceType: 'local-fs',
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
  content: string;
  terms: string[];
  includeContent: boolean;
  snippetLines: number;
}): CodexProviderRelayFileSearchResult | null {
  const lines = content.split(/\r?\n/u);
  const snippets: Array<{ line: number; text: string }> = [];
  let score = 0;
  const lowerPath = resultPath.toLowerCase();
  const lowerTitle = title.toLowerCase();
  for (const term of terms) {
    if (lowerPath.includes(term)) {
      score += 2;
    }
    if (lowerTitle.includes(term)) {
      score += 4;
    }
  }
  for (let index = 0; index < lines.length; index += 1) {
    const lowerLine = lines[index].toLowerCase();
    const hits = terms.filter((term) => lowerLine.includes(term)).length;
    if (hits === 0) {
      continue;
    }
    score += hits * 10;
    if (includeContent && snippets.length < 4) {
      for (
        let snippetIndex = Math.max(0, index - snippetLines);
        snippetIndex <= Math.min(lines.length - 1, index + snippetLines);
        snippetIndex += 1
      ) {
        if (!snippets.some((snippet) => snippet.line === snippetIndex + 1)) {
          snippets.push({
            line: snippetIndex + 1,
            text: lines[snippetIndex].slice(0, 500),
          });
        }
      }
    }
  }
  if (score <= 0) {
    return null;
  }
  return {
    title,
    uri,
    path: resultPath,
    root,
    source: sourceName,
    sourceType,
    score,
    snippets,
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

function normalizeSourceType(source: CodexProviderRelayFileSearchSource): string {
  return normalizeString(source.type) || 'custom';
}

function normalizeFileSearchResult(
  result: CodexProviderRelayFileSearchResult,
  source: CodexProviderRelayFileSearchSource,
  sourceType: string,
): CodexProviderRelayFileSearchResult {
  return {
    title: normalizeString(result.title) || normalizeString(result.path) || source.name,
    uri: normalizeString(result.uri),
    path: normalizeString(result.path) || normalizeString(result.title),
    root: result.root ?? null,
    source: normalizeString(result.source) || source.name,
    sourceType: normalizeString(result.sourceType) || sourceType,
    score: Number.isFinite(Number(result.score)) ? Number(result.score) : 0,
    snippets: Array.isArray(result.snippets)
      ? result.snippets.map((snippet) => ({
        line: clampInteger(snippet.line, 1, Number.MAX_SAFE_INTEGER, 1),
        text: normalizeString(snippet.text).slice(0, 1_000),
      })).filter((snippet) => snippet.text)
      : [],
  };
}

function limitResultsByPayload(
  results: CodexProviderRelayFileSearchResult[],
  maxResults: number,
  maxPayloadBytes: number,
): CodexProviderRelayFileSearchResult[] {
  const limited: CodexProviderRelayFileSearchResult[] = [];
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
