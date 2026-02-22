import type { RetryConfig, FetchResult } from './types.js';

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 503;
}

/**
 * Fetch with automatic retry and exponential backoff.
 * Retries on 429, 500, 503. Respects retry-after header on 429.
 */
export async function retryFetch<T>(
  url: string,
  options: RequestInit,
  config?: Partial<RetryConfig>,
): Promise<FetchResult<T>> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let delay = cfg.initialDelayMs;
  let lastError: Error | null = null;
  let lastStatus = 0;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      lastStatus = response.status;

      const rateLimitHeader = response.headers.get('x-ratelimit-remaining');
      const rateLimitRemaining = rateLimitHeader ? parseInt(rateLimitHeader, 10) : undefined;

      if (!response.ok) {
        const body = await response.text();

        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;
          console.log(`[GATEWAY] Rate limited, waiting ${waitMs}ms (attempt ${attempt + 1})`);
          await sleep(waitMs);
          delay = Math.min(delay * cfg.backoffMultiplier, cfg.maxDelayMs);
          lastError = new Error(`HTTP ${response.status}: ${body}`);
          continue;
        }

        if (isRetryableStatus(response.status) && attempt < cfg.maxRetries) {
          console.log(`[GATEWAY] Server error ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1})`);
          await sleep(delay);
          delay = Math.min(delay * cfg.backoffMultiplier, cfg.maxDelayMs);
          lastError = new Error(`HTTP ${response.status}: ${body}`);
          continue;
        }

        throw new Error(`HTTP ${response.status}: ${body}`);
      }

      if (rateLimitRemaining !== undefined && rateLimitRemaining < 10) {
        await sleep(500);
      }

      const data = (await response.json()) as T;
      return { data, status: response.status, rateLimitRemaining };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt >= cfg.maxRetries || (lastStatus > 0 && !isRetryableStatus(lastStatus))) {
        throw lastError;
      }

      console.log(`[GATEWAY] Error, retrying in ${delay}ms (attempt ${attempt + 1}):`, lastError.message);
      await sleep(delay);
      delay = Math.min(delay * cfg.backoffMultiplier, cfg.maxDelayMs);
    }
  }

  throw lastError || new Error('Request failed after retries');
}
