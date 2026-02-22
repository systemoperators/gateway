# changelog

## 0.1.1 (2026-02-22)

- add `storeRawResponse` to `@systemoperator/gateway/r2` for direct R2 storage without ApiGateway class

## 0.1.0 (2026-02-22)

- initial release
- ApiGateway class with fetch, graphql, paginate methods
- retryFetch with exponential backoff, 429/500/503 handling
- extractShape and countRecords for response logging
- 4 pagination strategies: notion, relay, pageToken, offset
- TokenProvider, RequestLogger, ResponseStore interfaces
- separate R2 export path: `@systemoperator/gateway/r2`
