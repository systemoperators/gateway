import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ApiGateway } from '../src/gateway';
import type { TokenProvider, RequestLogger, ResponseStore, RequestContext, RequestLogEntry } from '../src/types';

// mock global fetch
const mockFetch = jest.fn<typeof fetch>();
const originalFetch = globalThis.fetch;

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const mockTokenProvider: TokenProvider = {
  getToken: jest.fn<TokenProvider['getToken']>().mockResolvedValue('test-token-123'),
};

const ctx: RequestContext = { caller: 'test' };

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  (mockTokenProvider.getToken as jest.Mock<TokenProvider['getToken']>).mockClear();
  jest.spyOn(console, 'log').mockImplementation((() => {}) as () => void);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('ApiGateway', () => {
  describe('fetch', () => {
    it('makes request with auth header and returns data', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, name: 'Test' }));

      const gateway = new ApiGateway({
        name: 'test-api',
        baseUrl: 'https://api.example.com',
        tokenProvider: mockTokenProvider,
        retry: { maxRetries: 0 },
      });

      const result = await gateway.fetch<{ id: number }>('/items/1', { method: 'GET' }, 'conn-1', ctx);

      expect(result.data).toEqual({ id: 1, name: 'Test' });
      expect(result.reqId).toMatch(/^test-api-/);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/items/1',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Authorization: 'Bearer test-token-123' }),
        }),
      );
    });

    it('uses custom auth scheme', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      const gateway = new ApiGateway({
        name: 'custom-auth',
        baseUrl: 'https://api.example.com',
        tokenProvider: mockTokenProvider,
        authScheme: '',
        retry: { maxRetries: 0 },
      });

      await gateway.fetch('/test', undefined, 'conn-1', ctx);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'test-token-123' }),
        }),
      );
    });

    it('calls logger when provided', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ items: [1, 2] }));

      const logEntries: RequestLogEntry[] = [];
      const logger: RequestLogger = {
        log: jest.fn<RequestLogger['log']>().mockImplementation(async (entry) => { logEntries.push(entry); }),
      };

      const gateway = new ApiGateway({
        name: 'logged-api',
        baseUrl: 'https://api.example.com',
        tokenProvider: mockTokenProvider,
        logger,
        retry: { maxRetries: 0 },
      });

      await gateway.fetch('/items', { method: 'GET' }, 'conn-1', ctx);

      expect(logger.log).toHaveBeenCalledTimes(1);
      const entry = logEntries[0];
      expect(entry.gateway).toBe('logged-api');
      expect(entry.endpoint).toBe('/items');
      expect(entry.method).toBe('GET');
      expect(entry.statusCode).toBe(200);
      expect(entry.recordCount).toBe(2);
      expect(entry.errorMessage).toBeNull();
    });

    it('calls responseStore when provided', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: 'stored' }));

      const responseStore: ResponseStore = {
        store: jest.fn<ResponseStore['store']>().mockResolvedValue('test-api/2026/01/01/req-1.json'),
      };

      const logger: RequestLogger = {
        log: jest.fn<RequestLogger['log']>().mockResolvedValue(undefined),
      };

      const gateway = new ApiGateway({
        name: 'stored-api',
        baseUrl: 'https://api.example.com',
        tokenProvider: mockTokenProvider,
        responseStore,
        logger,
        retry: { maxRetries: 0 },
      });

      await gateway.fetch('/data', undefined, 'conn-1', ctx);

      expect(responseStore.store).toHaveBeenCalledWith(
        'stored-api',
        expect.stringMatching(/^stored-api-/),
        { data: 'stored' },
      );
    });

    it('logs errors on failure', async () => {
      mockFetch.mockResolvedValueOnce(new Response('bad request', { status: 400 }));

      const logEntries: RequestLogEntry[] = [];
      const logger: RequestLogger = {
        log: jest.fn<RequestLogger['log']>().mockImplementation(async (entry) => { logEntries.push(entry); }),
      };

      const gateway = new ApiGateway({
        name: 'error-api',
        baseUrl: 'https://api.example.com',
        tokenProvider: mockTokenProvider,
        logger,
        retry: { maxRetries: 0 },
      });

      await expect(gateway.fetch('/bad', undefined, 'conn-1', ctx)).rejects.toThrow('HTTP 400');

      expect(logEntries[0].errorMessage).toContain('HTTP 400');
    });
  });

  describe('graphql', () => {
    it('sends query and returns data', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ data: { issues: [{ id: '1' }] } }),
      );

      const gateway = new ApiGateway({
        name: 'gql-api',
        baseUrl: 'https://api.example.com/graphql',
        tokenProvider: mockTokenProvider,
        retry: { maxRetries: 0 },
      });

      const result = await gateway.graphql<{ issues: { id: string }[] }>(
        '{ issues { id } }',
        undefined,
        'conn-1',
        ctx,
      );

      expect(result.data.issues).toEqual([{ id: '1' }]);

      const call = mockFetch.mock.calls[0];
      const url = call![0] as string;
      const opts = call![1] as RequestInit;
      expect(url).toBe('https://api.example.com/graphql');
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body as string)).toEqual({
        query: '{ issues { id } }',
        variables: undefined,
      });
    });

    it('throws on GraphQL errors even with 200 status', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ errors: [{ message: 'Not found' }] }),
      );

      const gateway = new ApiGateway({
        name: 'gql-api',
        baseUrl: 'https://api.example.com/graphql',
        tokenProvider: mockTokenProvider,
        retry: { maxRetries: 0 },
      });

      await expect(
        gateway.graphql('{ bad }', undefined, 'conn-1', ctx),
      ).rejects.toThrow('GraphQL errors: Not found');
    });
  });

  describe('paginate', () => {
    it('collects items across pages', async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({ results: [{ id: '1' }], has_more: true, next_cursor: 'cursor-2' }),
        )
        .mockResolvedValueOnce(
          jsonResponse({ results: [{ id: '2' }], has_more: false, next_cursor: null }),
        );

      const gateway = new ApiGateway({
        name: 'paginated-api',
        baseUrl: 'https://api.example.com',
        tokenProvider: mockTokenProvider,
        retry: { maxRetries: 0 },
      });

      const { notionCursor } = await import('../src/pagination');
      const items = await gateway.paginate<{ id: string }>(
        '/items',
        notionCursor({ pageSize: 1 }),
        'conn-1',
        ctx,
      );

      expect(items).toEqual([{ id: '1' }, { id: '2' }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
