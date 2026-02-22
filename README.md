# @systemoperator/gateway

API gateway utilities: retry with exponential backoff, rate limit handling, pagination, request logging, response storage. Zero dependencies, works everywhere (Cloudflare Workers, Node, Deno, Bun).

## install

```bash
npm install @systemoperator/gateway
```

## usage

### create a gateway

```typescript
import { ApiGateway } from '@systemoperator/gateway';

const gateway = new ApiGateway({
  name: 'linear',
  baseUrl: 'https://api.linear.app',
  tokenProvider: { getToken: (connectionId) => loadFromDb(connectionId) },
  logger: myRequestLogger,        // optional
  responseStore: myR2Store,        // optional
  retry: { maxRetries: 5 },       // optional, has defaults
});
```

### REST requests

```typescript
const result = await gateway.fetch<IssueData>('/rest/issues', { method: 'GET' }, connectionId, ctx);
```

### GraphQL

```typescript
const result = await gateway.graphql<IssueData>(query, variables, connectionId, ctx);
```

checks `.errors` array even on 200 status.

### pagination

```typescript
import { paginators } from '@systemoperator/gateway';

const allItems = await gateway.paginate<Issue>('/rest/issues', paginators.notion(), connectionId, ctx);
```

4 built-in strategies: `paginators.notion()`, `paginators.relay()`, `paginators.pageToken()`, `paginators.offset()`.

### store interfaces

the package never touches databases or R2 directly. products inject implementations:

```typescript
import type { TokenProvider, RequestLogger, ResponseStore } from '@systemoperator/gateway';

const tokenProvider: TokenProvider = {
  async getToken(connectionId) { /* load from DB */ },
};

const logger: RequestLogger = {
  async log(entry) { /* insert into request_logs table */ },
};

const responseStore: ResponseStore = {
  async store(gatewayName, reqId, data) { /* store in R2/S3/disk */ },
};
```

### R2 response store

helper for Cloudflare R2 (separate import to avoid R2 type dependency):

```typescript
import { createR2ResponseStore } from '@systemoperator/gateway/r2';

const responseStore = createR2ResponseStore(env.R2_BUCKET);
```

### retry and utilities

```typescript
import { retryFetch, extractShape, countRecords } from '@systemoperator/gateway';

// standalone retry fetch
const result = await retryFetch<Data>(url, options, { maxRetries: 3 });

// response shape extraction for logging
const shape = extractShape(responseData);
const count = countRecords(responseData);
```

## defaults

- maxRetries: 5
- initialDelayMs: 1000
- maxDelayMs: 60000
- backoffMultiplier: 2
- rateLimitHeader: `x-ratelimit-remaining`
- rateLimitThreshold: 10 (sleeps 500ms when below)
- authScheme: `Bearer`

## license

MIT
