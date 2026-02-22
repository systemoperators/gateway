import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { retryFetch, isRetryableStatus, DEFAULT_RETRY_CONFIG, sleep } from '../src/retry';

// mock global fetch
const mockFetch = jest.fn<typeof fetch>();
const originalFetch = globalThis.fetch;

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function errorResponse(status: number, body = 'error', headers: Record<string, string> = {}) {
  return new Response(body, { status, headers });
}

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  jest.spyOn(console, 'log').mockImplementation((() => {}) as () => void);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('isRetryableStatus', () => {
  it('returns true for 429, 500, 503', () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it('returns false for other statuses', () => {
    expect(isRetryableStatus(200)).toBe(false);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });
});

describe('DEFAULT_RETRY_CONFIG', () => {
  it('has expected defaults', () => {
    expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(5);
    expect(DEFAULT_RETRY_CONFIG.initialDelayMs).toBe(1000);
    expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(60000);
    expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
  });
});

describe('retryFetch', () => {
  it('returns data on successful response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1 }));

    const result = await retryFetch<{ id: number }>('https://api.example.com/test', {});
    expect(result.data).toEqual({ id: 1 });
    expect(result.status).toBe(200);
  });

  it('parses rate limit header', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ ok: true }, 200, { 'x-ratelimit-remaining': '42' }),
    );

    const result = await retryFetch('https://api.example.com/test', {});
    expect(result.rateLimitRemaining).toBe(42);
  });

  it('throws on non-retryable error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(404, 'not found'));

    await expect(
      retryFetch('https://api.example.com/test', {}, { maxRetries: 0 }),
    ).rejects.toThrow('HTTP 404');
  });

  it('retries on 500 and succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(500, 'internal error'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await retryFetch(
      'https://api.example.com/test',
      {},
      { maxRetries: 2, initialDelayMs: 1 },
    );
    expect(result.data).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    mockFetch.mockImplementation(() => Promise.resolve(errorResponse(500, 'internal error')));

    await expect(
      retryFetch('https://api.example.com/test', {}, { maxRetries: 1, initialDelayMs: 1 }),
    ).rejects.toThrow('HTTP 500');
  });
});

describe('sleep', () => {
  it('resolves after delay', async () => {
    const start = Date.now();
    await sleep(10);
    expect(Date.now() - start).toBeGreaterThanOrEqual(5);
  });
});
