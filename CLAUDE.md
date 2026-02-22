# @systemoperator/gateway

API gateway utilities: retry, rate limiting, pagination, request logging.

## development

- run tests: `npm test`
- build: `npm run build`
- publish dry run: `npm publish --dry-run`

## publishing

tag-based via GitHub Actions:
1. bump version in package.json
2. commit and tag: `git tag v0.1.0`
3. push tag: `git push --tags`
4. CI runs tests, builds, publishes to npm

## code conventions

- TypeScript, ESM only
- zero runtime dependencies
- works in Workers, Node, Deno, Bun
- no database/R2 dependency - users implement store interfaces
- keep files under 500 lines
