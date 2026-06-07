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
  CodexProviderRelayLocalVectorFileSearchSourceOptions,
  CodexProviderRelayLocalVectorIndexChunk,
  CodexProviderRelayLocalVectorIndexDocument,
  LocalVectorTextChunk,
  NormalizedLocalVectorChunkingOptions,
  NormalizedLocalVectorFileSearchOptions,
} from '../types.js';
import { createCodexProviderRelayMemoryLocalVectorIndexStore } from '../stores.js';
import {
  clampInteger,
  clampNumber,
  cosineSimilarity,
  lexicalScoreForText,
  looksBinary,
  normalizeEmbeddingVector,
  normalizeFileSearchAttributes,
  normalizeString,
  pathMatchesGlob,
  stableContentHash,
  stableFileSearchFileId,
} from '../shared.js';
import {
  assertExplicitLocalFileSearchRoots,
  collectCandidateFiles,
  normalizeLocalFileSearchOptions,
} from './local-shared.js';

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
