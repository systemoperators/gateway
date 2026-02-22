import type {
  ApiGatewayConfig,
  RequestContext,
  GatewayResponse,
  RetryConfig,
  PaginationStrategy,
  RequestLogEntry,
} from './types.js';
import { retryFetch, DEFAULT_RETRY_CONFIG } from './retry.js';
import { extractShape, countRecords } from './shape.js';

let reqCounter = 0;

function generateReqId(gateway: string): string {
  const ts = Date.now().toString(36);
  const c = (reqCounter++).toString(36);
  return `${gateway}-${ts}-${c}`;
}

export class ApiGateway {
  private readonly config: ApiGatewayConfig;
  private readonly retryConfig: RetryConfig;
  private readonly rateLimitHeader: string;
  private readonly rateLimitThreshold: number;
  private readonly authHeader: string;
  private readonly authScheme: string;

  constructor(config: ApiGatewayConfig) {
    this.config = config;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retry };
    this.rateLimitHeader = config.rateLimitHeader ?? 'x-ratelimit-remaining';
    this.rateLimitThreshold = config.rateLimitThreshold ?? 10;
    this.authHeader = config.authHeader ?? 'Authorization';
    this.authScheme = config.authScheme ?? 'Bearer';
  }

  async fetch<T>(
    endpoint: string,
    options: RequestInit | undefined,
    connectionId: string,
    ctx: RequestContext,
  ): Promise<GatewayResponse<T>> {
    const reqId = generateReqId(this.config.name);
    const url = this.buildUrl(endpoint, options);
    const token = await this.config.tokenProvider.getToken(connectionId);
    const headers = this.buildHeaders(token, options?.headers);

    const startTime = Date.now();
    let statusCode: number | null = null;
    let errorMessage: string | null = null;
    let data: T | null = null;
    let rateLimitRemaining: number | null = null;

    try {
      const result = await retryFetch<T>(url, { ...options, headers }, this.retryConfig);
      data = result.data;
      statusCode = result.status;
      rateLimitRemaining = result.rateLimitRemaining ?? null;
      return { data: result.data, reqId, rateLimitRemaining: result.rateLimitRemaining };
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      const responseTimeMs = Date.now() - startTime;
      await this.logRequest(reqId, endpoint, options?.method ?? 'GET', connectionId, ctx, {
        statusCode,
        responseTimeMs,
        data,
        errorMessage,
        rateLimitRemaining,
      });
    }
  }

  async graphql<T>(
    query: string,
    variables: Record<string, unknown> | undefined,
    connectionId: string,
    ctx: RequestContext,
  ): Promise<GatewayResponse<T>> {
    const reqId = generateReqId(this.config.name);
    const url = this.config.baseUrl;
    const token = await this.config.tokenProvider.getToken(connectionId);
    const headers = this.buildHeaders(token, { 'Content-Type': 'application/json' });

    const startTime = Date.now();
    let statusCode: number | null = null;
    let errorMessage: string | null = null;
    let data: T | null = null;
    let rateLimitRemaining: number | null = null;

    try {
      const result = await retryFetch<{ data?: T; errors?: { message: string }[] }>(
        url,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ query, variables }),
        },
        this.retryConfig,
      );

      statusCode = result.status;
      rateLimitRemaining = result.rateLimitRemaining ?? null;

      if (result.data.errors?.length) {
        const messages = result.data.errors.map((e) => e.message).join('; ');
        throw new Error(`GraphQL errors: ${messages}`);
      }

      if (!result.data.data) {
        throw new Error('GraphQL response missing data field');
      }

      data = result.data.data;
      return { data, reqId, rateLimitRemaining: result.rateLimitRemaining };
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      const responseTimeMs = Date.now() - startTime;
      await this.logRequest(reqId, 'graphql', 'POST', connectionId, ctx, {
        statusCode,
        responseTimeMs,
        data,
        errorMessage,
        rateLimitRemaining,
      });
    }
  }

  async paginate<T>(
    endpoint: string,
    strategy: PaginationStrategy<T>,
    connectionId: string,
    ctx: RequestContext,
    options?: RequestInit,
  ): Promise<T[]> {
    const allItems: T[] = [];
    let cursor: string | null = null;

    do {
      const params = strategy.getParams(cursor);
      const separator = endpoint.includes('?') ? '&' : '?';
      const queryString = new URLSearchParams(params).toString();
      const paginatedEndpoint = `${endpoint}${separator}${queryString}`;

      const result = await this.fetch<unknown>(paginatedEndpoint, options, connectionId, ctx);
      const items = strategy.getItems(result.data);
      allItems.push(...items);
      cursor = strategy.getNextCursor(result.data);
    } while (cursor);

    return allItems;
  }

  private buildUrl(endpoint: string, options?: RequestInit): string {
    if (endpoint.startsWith('http')) return endpoint;
    const base = this.config.baseUrl.replace(/\/$/, '');
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${base}${path}`;
  }

  private buildHeaders(token: string, extra?: HeadersInit): Record<string, string> {
    const headers: Record<string, string> = {};

    if (extra) {
      if (extra instanceof Headers) {
        extra.forEach((v, k) => { headers[k] = v; });
      } else if (Array.isArray(extra)) {
        for (const [k, v] of extra) { headers[k] = v; }
      } else {
        Object.assign(headers, extra);
      }
    }

    const authValue = this.authScheme ? `${this.authScheme} ${token}` : token;
    headers[this.authHeader] = authValue;

    return headers;
  }

  private async logRequest(
    reqId: string,
    endpoint: string,
    method: string,
    connectionId: string,
    ctx: RequestContext,
    result: {
      statusCode: number | null;
      responseTimeMs: number;
      data: unknown;
      errorMessage: string | null;
      rateLimitRemaining: number | null;
    },
  ): Promise<void> {
    const { responseStore, logger } = this.config;
    if (!responseStore && !logger) return;

    const responseShape = result.data ? extractShape(result.data) : null;
    const recordCount = result.data ? countRecords(result.data) : null;
    const rawJson = result.data ? JSON.stringify(result.data) : null;
    const responseSizeBytes = rawJson ? new TextEncoder().encode(rawJson).byteLength : null;

    let r2Key: string | null = null;
    if (responseStore && result.data) {
      r2Key = (await responseStore.store(this.config.name, reqId, result.data)) ?? null;
    }

    if (logger) {
      const entry: RequestLogEntry = {
        reqId,
        gateway: this.config.name,
        connectionId,
        endpoint,
        method,
        params: null,
        ctx,
        statusCode: result.statusCode,
        responseTimeMs: result.responseTimeMs,
        responseSizeBytes,
        recordCount,
        responseShape,
        r2Key,
        errorMessage: result.errorMessage,
        rateLimitRemaining: result.rateLimitRemaining,
      };
      await logger.log(entry);
    }
  }
}
