import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  CodexProviderRelayHostedToolExecutionRequest,
  CodexProviderRelayHostedToolExecutionResult,
  CodexProviderRelayHostedToolExecutor,
} from './hosted_tool_executors.js';

export interface CodexProviderRelayFileSearchExecutorOptions {
  roots: string[];
  maxResults?: number | null;
  maxFilesScanned?: number | null;
  maxBytesPerFile?: number | null;
  snippetLines?: number | null;
  includeContent?: boolean | null;
  followSymlinks?: boolean | null;
  ignoreDirectories?: string[] | null;
  ignoreExtensions?: string[] | null;
}

export interface CodexProviderRelayFileSearchResult {
  title: string;
  uri: string;
  path: string;
  root: string;
  score: number;
  snippets: Array<{
    line: number;
    text: string;
  }>;
}

export interface CodexProviderRelayFileSearchExecutorContent {
  query: string;
  provider: 'local-fs';
  results: CodexProviderRelayFileSearchResult[];
  scannedFiles: number;
  skippedFiles: number;
}

interface NormalizedFileSearchOptions {
  roots: string[];
  maxResults: number;
  maxFilesScanned: number;
  maxBytesPerFile: number;
  snippetLines: number;
  includeContent: boolean;
  followSymlinks: boolean;
  ignoreDirectories: Set<string>;
  ignoreExtensions: Set<string>;
}

interface CandidateFile {
  root: string;
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
    const maxResults = clampInteger(request.arguments.max_results, 1, 50, normalizedOptions.maxResults);
    const includeContent = typeof request.arguments.include_content === 'boolean'
      ? request.arguments.include_content
      : normalizedOptions.includeContent;
    const pathGlob = normalizeString(request.arguments.path_glob);
    const terms = tokenizeQuery(query);
    if (terms.length === 0) {
      throw new Error('file_search executor requires at least one searchable query term.');
    }

    await request.emitDelta?.('scanning roots', {
      roots: normalizedOptions.roots,
      maxResults,
    });
    const candidates = await collectCandidateFiles(normalizedOptions, pathGlob);
    await request.emitDelta?.('candidate files collected', {
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
      if (!stat || !stat.isFile() || stat.size > normalizedOptions.maxBytesPerFile) {
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
        terms,
        includeContent,
        snippetLines: normalizedOptions.snippetLines,
      });
      if (result) {
        results.push(result);
        await request.emitDelta?.('file matched', {
          path: result.path,
          score: result.score,
          resultCount: results.length,
        });
      }
    }

    results.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
    return {
      content: {
        query,
        provider: 'local-fs',
        results: results.slice(0, maxResults),
        scannedFiles,
        skippedFiles,
      } satisfies CodexProviderRelayFileSearchExecutorContent,
      metadata: {
        provider: 'local-fs',
        scannedFiles,
        skippedFiles,
      },
    };
  };
}

function normalizeFileSearchOptions(
  options: CodexProviderRelayFileSearchExecutorOptions,
): NormalizedFileSearchOptions {
  const roots = Array.isArray(options.roots)
    ? options.roots.map((root) => path.resolve(root)).filter(Boolean)
    : [];
  if (roots.length === 0) {
    throw new Error('file_search executor requires at least one explicit root.');
  }
  return {
    roots: [...new Set(roots)],
    maxResults: clampInteger(options.maxResults, 1, 50, 8),
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

async function collectCandidateFiles(
  options: NormalizedFileSearchOptions,
  pathGlob: string,
): Promise<CandidateFile[]> {
  const candidates: CandidateFile[] = [];
  for (const root of options.roots) {
    await walkDirectory({
      options,
      root,
      directory: root,
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
  options: NormalizedFileSearchOptions;
  root: string;
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
    const relativePath = normalizeRelativePath(path.relative(root, entryPath));
    if (!isPathInsideRoot(root, entryPath)) {
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
    if (entry.isSymbolicLink() && !options.followSymlinks) {
      continue;
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
}: {
  candidate: CandidateFile;
  content: string;
  terms: string[];
  includeContent: boolean;
  snippetLines: number;
}): CodexProviderRelayFileSearchResult | null {
  const lines = content.split(/\r?\n/u);
  const snippets: Array<{ line: number; text: string }> = [];
  let score = 0;
  const lowerPath = candidate.relativePath.toLowerCase();
  for (const term of terms) {
    if (lowerPath.includes(term)) {
      score += 2;
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
    title: candidate.relativePath,
    uri: `file://${candidate.absolutePath}`,
    path: candidate.relativePath,
    root: candidate.root,
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

function isPathInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
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

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}
