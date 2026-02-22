// context passed with every gateway call for tracing
export interface RequestContext {
  runId?: string;
  actionId?: string;
  workflowRunId?: string;
  caller: string;
  trigger?: string;
  context?: Record<string, unknown>;
}

// standard gateway response wrapper
export interface GatewayResponse<T> {
  data: T;
  reqId: string;
  rateLimitRemaining?: number;
}

// retry configuration
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

// fetch result with metadata
export interface FetchResult<T> {
  data: T;
  status: number;
  rateLimitRemaining?: number;
}

// token provider - products implement this to load tokens from DB
export interface TokenProvider {
  getToken(connectionId: string): Promise<string>;
}

// request logger - products implement this to log requests to DB
export interface RequestLogger {
  log(entry: RequestLogEntry): Promise<void>;
}

// response store - products implement this to store raw responses
export interface ResponseStore {
  store(gatewayName: string, reqId: string, data: unknown): Promise<string | undefined>;
}

// request log entry written by the logger
export interface RequestLogEntry {
  reqId: string;
  gateway: string;
  connectionId: string;
  endpoint: string;
  method: string;
  params: Record<string, unknown> | null;
  ctx: RequestContext;
  statusCode: number | null;
  responseTimeMs: number;
  responseSizeBytes: number | null;
  recordCount: number | null;
  responseShape: unknown;
  r2Key: string | null;
  errorMessage: string | null;
  rateLimitRemaining: number | null;
}

// pagination strategy for auto-paginating API responses
export interface PaginationStrategy<T> {
  getParams(cursor: string | null): Record<string, string>;
  getItems(response: unknown): T[];
  getNextCursor(response: unknown): string | null;
}

// gateway configuration
export interface ApiGatewayConfig {
  name: string;
  baseUrl: string;
  tokenProvider: TokenProvider;
  logger?: RequestLogger;
  responseStore?: ResponseStore;
  retry?: Partial<RetryConfig>;
  rateLimitHeader?: string;
  rateLimitThreshold?: number;
  authHeader?: string;
  authScheme?: string;
}
