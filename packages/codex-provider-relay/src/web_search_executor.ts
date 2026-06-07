import type {
  CodexProviderRelayHostedToolExecutionRequest,
  CodexProviderRelayHostedToolExecutionResult,
  CodexProviderRelayHostedToolExecutor,
  JsonRecord,
} from './hosted_tool_executors.js';

export type CodexProviderRelayWebSearchProvider =
  | 'tavily'
  | 'brave'
  | 'serper';

export interface CodexProviderRelayWebSearchExecutorOptions {
  provider: CodexProviderRelayWebSearchProvider;
  apiKey: string;
  endpoint?: string | null;
  fetchImpl?: typeof fetch;
  maxResults?: number | null;
  country?: string | null;
  language?: string | null;
}

export interface CodexProviderRelayWebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string | null;
  publishedAt?: string | null;
  score?: number | null;
}

export interface CodexProviderRelayWebSearchExecutorContent {
  query: string;
  provider: CodexProviderRelayWebSearchProvider;
  answer?: string | null;
  results: CodexProviderRelayWebSearchResult[];
}

const DEFAULT_TAVILY_ENDPOINT = 'https://api.tavily.com/search';
const DEFAULT_BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const DEFAULT_SERPER_ENDPOINT = 'https://google.serper.dev/search';

export function createCodexProviderRelayWebSearchExecutor(
  options: CodexProviderRelayWebSearchExecutorOptions,
): CodexProviderRelayHostedToolExecutor {
  const provider = normalizeWebSearchProvider(options.provider);
  const apiKey = normalizeString(options.apiKey);
  if (!apiKey) {
    throw new Error(`${provider} web_search executor requires an API key.`);
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxResults = clampInteger(options.maxResults, 1, 10, 5);
  const endpoint = normalizeString(options.endpoint) || defaultEndpointForWebSearchProvider(provider);
  const country = normalizeString(options.country);
  const language = normalizeString(options.language);

  return async (request: CodexProviderRelayHostedToolExecutionRequest): Promise<CodexProviderRelayHostedToolExecutionResult> => {
    const query = webSearchQueryFromRequest(request);
    if (!query) {
      throw new Error('web_search executor requires a non-empty query argument.');
    }
    switch (provider) {
      case 'tavily':
        return {
          content: await executeTavilySearch({
            apiKey,
            endpoint,
            fetchImpl,
            maxResults,
            query,
            request,
          }),
        };
      case 'brave':
        return {
          content: await executeBraveSearch({
            apiKey,
            endpoint,
            fetchImpl,
            maxResults,
            query,
            country,
            language,
          }),
        };
      case 'serper':
        return {
          content: await executeSerperSearch({
            apiKey,
            endpoint,
            fetchImpl,
            maxResults,
            query,
            country,
            language,
          }),
        };
      default:
        throw new Error(`Unsupported web_search executor provider: ${provider}`);
    }
  };
}

async function executeTavilySearch({
  apiKey,
  endpoint,
  fetchImpl,
  maxResults,
  query,
  request,
}: {
  apiKey: string;
  endpoint: string;
  fetchImpl: typeof fetch;
  maxResults: number;
  query: string;
  request: CodexProviderRelayHostedToolExecutionRequest;
}): Promise<CodexProviderRelayWebSearchExecutorContent> {
  const response = await fetchJson(fetchImpl, endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      max_results: maxResults,
      search_depth: tavilySearchDepthFromRequest(request),
      include_answer: true,
    }),
  });
  return {
    query,
    provider: 'tavily',
    answer: normalizeString(response.answer) || null,
    results: normalizeArray(response.results)
      .slice(0, maxResults)
      .map((result) => ({
        title: normalizeString(result?.title) || normalizeString(result?.url) || 'Untitled result',
        url: normalizeString(result?.url),
        snippet: normalizeString(result?.content) || normalizeString(result?.snippet),
        source: 'tavily',
        publishedAt: normalizeString(result?.published_date) || null,
        score: normalizeFiniteNumber(result?.score),
      }))
      .filter((result) => result.url),
  };
}

async function executeBraveSearch({
  apiKey,
  endpoint,
  fetchImpl,
  maxResults,
  query,
  country,
  language,
}: {
  apiKey: string;
  endpoint: string;
  fetchImpl: typeof fetch;
  maxResults: number;
  query: string;
  country: string;
  language: string;
}): Promise<CodexProviderRelayWebSearchExecutorContent> {
  const url = new URL(endpoint);
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(maxResults));
  if (country) {
    url.searchParams.set('country', country.toUpperCase());
  }
  if (language) {
    url.searchParams.set('search_lang', language.toLowerCase());
  }
  const response = await fetchJson(fetchImpl, url.toString(), {
    method: 'GET',
    headers: {
      'X-Subscription-Token': apiKey,
      Accept: 'application/json',
    },
  });
  return {
    query,
    provider: 'brave',
    results: normalizeArray(response.web?.results)
      .slice(0, maxResults)
      .map((result) => ({
        title: normalizeString(result?.title) || normalizeString(result?.url) || 'Untitled result',
        url: normalizeString(result?.url),
        snippet: normalizeString(result?.description) || normalizeString(result?.snippet),
        source: 'brave',
        publishedAt: normalizeString(result?.page_age) || normalizeString(result?.age) || null,
        score: normalizeFiniteNumber(result?.score),
      }))
      .filter((result) => result.url),
  };
}

async function executeSerperSearch({
  apiKey,
  endpoint,
  fetchImpl,
  maxResults,
  query,
  country,
  language,
}: {
  apiKey: string;
  endpoint: string;
  fetchImpl: typeof fetch;
  maxResults: number;
  query: string;
  country: string;
  language: string;
}): Promise<CodexProviderRelayWebSearchExecutorContent> {
  const response = await fetchJson(fetchImpl, endpoint, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      num: maxResults,
      ...(country ? { gl: country.toLowerCase() } : {}),
      ...(language ? { hl: language.toLowerCase() } : {}),
    }),
  });
  return {
    query,
    provider: 'serper',
    answer: normalizeString(response.answerBox?.answer)
      || normalizeString(response.knowledgeGraph?.description)
      || null,
    results: normalizeArray(response.organic)
      .slice(0, maxResults)
      .map((result) => ({
        title: normalizeString(result?.title) || normalizeString(result?.link) || 'Untitled result',
        url: normalizeString(result?.link),
        snippet: normalizeString(result?.snippet),
        source: 'serper',
        publishedAt: normalizeString(result?.date) || null,
        score: normalizeFiniteNumber(result?.position),
      }))
      .filter((result) => result.url),
  };
}

async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<JsonRecord> {
  const response = await fetchImpl(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`web_search upstream returned HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  try {
    const json = JSON.parse(text) as JsonRecord;
    return json && typeof json === 'object' ? json : {};
  } catch (error) {
    throw new Error(`web_search upstream returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function webSearchQueryFromRequest(request: CodexProviderRelayHostedToolExecutionRequest): string {
  return firstNonEmptyString([
    request.arguments.query,
    request.arguments.q,
    request.arguments.search_query,
    request.arguments.input,
    request.rawArguments,
  ]);
}

function tavilySearchDepthFromRequest(
  request: CodexProviderRelayHostedToolExecutionRequest,
): 'basic' | 'advanced' | 'fast' | 'ultra-fast' {
  const contextSize = normalizeString(request.arguments.search_context_size).toLowerCase();
  if (contextSize === 'high') {
    return 'advanced';
  }
  if (contextSize === 'low') {
    return 'fast';
  }
  return 'basic';
}

function defaultEndpointForWebSearchProvider(provider: CodexProviderRelayWebSearchProvider): string {
  switch (provider) {
    case 'tavily':
      return DEFAULT_TAVILY_ENDPOINT;
    case 'brave':
      return DEFAULT_BRAVE_ENDPOINT;
    case 'serper':
      return DEFAULT_SERPER_ENDPOINT;
    default:
      return '';
  }
}

function normalizeWebSearchProvider(value: unknown): CodexProviderRelayWebSearchProvider {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === 'tavily' || normalized === 'brave' || normalized === 'serper') {
    return normalized;
  }
  throw new Error(`Unsupported web_search executor provider: ${String(value)}`);
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

function normalizeArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function normalizeFiniteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isInteger(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}
