# Type Safety Guide for Hevy API Responses

## Overview

`hevy-mcp` uses the `hevy-api-client` npm package for Hevy API calls, wrapped by
`src/utils/hevyApiClient.ts`.

To keep tool handlers type-safe (and avoid runtime shape mismatches), prefer:

- Zod schema inference for tool params (`InferToolParams`)
- Strongly typed request/response objects (from `hevy-api-client`)
- No manual `as { ... }` type assertions

## The Pattern

### ✅ CORRECT: Rely on inferred return types (preferred)

```ts
const data = await hevyClient.getWorkouts({ page, pageSize });

// TypeScript validates property access
const workouts = data?.workouts ?? [];
```

### ✅ CORRECT: Explicitly annotate with `hevy-api-client` types (when needed)

```ts
import type { GetV1WorkoutsResponses } from "hevy-api-client";

const data: GetV1WorkoutsResponses[200] = await hevyClient.getWorkouts({
  page,
  pageSize,
});
```

### ❌ INCORRECT: Manual shape assertions

```ts
// Avoid: bypasses TypeScript's type checking
const data = await hevyClient.getWorkoutCount();
const count = (data as { workout_count?: number }).workout_count ?? 0;
```

## Quick Reference: Response type naming

`hevy-api-client` models responses as a mapping from HTTP status code to type.

- `GetV1WorkoutsResponses[200]`
- `PostV1WorkoutsResponses[201]`
- `PutV1WorkoutsWorkoutidResponses[200]`

## Implementation Checklist

When adding/changing an API call:

- [ ] Keep request body types sourced from `hevy-api-client` (e.g.
      `PostWorkoutsRequestBody`)
- [ ] Avoid manual type assertions (`as { ... }`, `as unknown`, etc.)
- [ ] Run `pnpm run check:types`
- [ ] Run unit tests: `pnpm vitest run --exclude tests/integration/**`
