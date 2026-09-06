---
"@hevy-mcp/hevy-client": patch
"@hevy-mcp/operations": patch
"@hevy-mcp/core": patch
"hevy-mcp": patch
"@hevy-mcp/worker": patch
"@chrisdoc/hevy-cli": patch
---

perf(core, hevy-client): replace Zod safeParse runtime predicates with Effect Predicate module. Replaced custom Zod schemas and safeParse calls in `packages/core/src/utils/type-predicates.ts` and `packages/hevy-client/src/hevy-client-kubb.ts` with Effect's native `Predicate` module (`isString`, `isNumber`, `isBoolean`, `isObject`, `isFunction`), eliminating repeated parsing allocations in the hot request path.
