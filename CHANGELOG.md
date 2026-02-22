# changelog

## 0.1.0 (2026-02-22)

- initial release
- ApiGateway class with fetch, graphql, paginate methods
- retryFetch with exponential backoff, 429/500/503 handling
- extractShape and countRecords for response logging
- 4 pagination strategies: notion, relay, pageToken, offset
- TokenProvider, RequestLogger, ResponseStore interfaces
- separate R2 export path: `@systemoperator/gateway/r2`
