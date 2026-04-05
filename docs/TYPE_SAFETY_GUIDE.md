# Type Safety Guide for hevyClient API Responses

## Overview

This project uses a generated API client from the Hevy OpenAPI specification. To ensure type safety and prevent runtime errors, **all API responses from `hevyClient` methods MUST use explicit type annotations from the generated types**.

## The Pattern

### ✅ **CORRECT: Use Generated Types**

```typescript
import type {
  GetV1Workouts200,
  PostV1Workouts201,
} from "../generated/client/types/index.js";

// Explicit type annotation using generated type
const data: GetV1Workouts200 = await hevyClient.getWorkouts({
  page,
  pageSize,
});

// TypeScript validates property access
const workouts = data?.workouts?.map(...) || [];
```

### ❌ **INCORRECT: Manual Type Assertion**

```typescript
// DO NOT DO THIS - bypasses TypeScript's type checking
const data = await hevyClient.getWorkouts({ page, pageSize });
const count = (data as { workout_count?: number }).workout_count || 0;
```

### ❌ **INCORRECT: Implicit Any**

```typescript
// DO NOT DO THIS - loses all type information
const data = await hevyClient.getWorkouts({ page, pageSize });
// data is implicitly 'any'
```

## Why This Matters

1. **Compile-Time Safety**: TypeScript catches property name mismatches (e.g., `workoutCount` vs `workout_count`)
2. **IDE Support**: Full autocomplete and type hints
3. **Refactoring Safety**: If the API changes, TypeScript immediately flags incompatibilities
4. **Documentation**: Types serve as inline documentation

## How to Find the Correct Type

### Step 1: Identify the API Method

Look at the `hevyClient` method you're calling:

```typescript
const data = await hevyClient.getWorkouts({ page, pageSize });
```

### Step 2: Check the Client Wrapper

Open `src/utils/hevyClientKubb.ts` and find the method:

```typescript
getWorkouts: (params?: GetV1WorkoutsQueryParams): ReturnType<typeof api.getV1Workouts> =>
  wrapApi(api.getV1Workouts)(headers, params, { client }),
```

The return type is `ReturnType<typeof api.getV1Workouts>`.

### Step 3: Check the Generated API Function

Open `src/generated/client/api/getV1Workouts.ts`:

```typescript
export async function getV1Workouts(...) {
  const res = await request<
    GetV1WorkoutsQueryResponse,  // ← This is what's returned
    ResponseErrorConfig<Error>,
    unknown
  >(...);
  return res.data;
}
```

### Step 4: Find the Response Type

Open `src/generated/client/types/GetV1Workouts.ts`:

```typescript
export type GetV1WorkoutsQueryResponse = GetV1Workouts200;

export type GetV1Workouts200 = {
	page?: number;
	page_count?: number;
	workouts?: Workout[];
};
```

Use `GetV1Workouts200` as the type annotation.

## Quick Reference: Response Type Naming Conventions

| HTTP Method | Status | Example Type Name            |
| ----------- | ------ | ---------------------------- |
| GET         | 200    | `GetV1Workouts200`           |
| POST        | 200    | `PostV1ExerciseTemplates200` |
| POST        | 201    | `PostV1Workouts201`          |
| PUT         | 200    | `PutV1WorkoutsWorkoutid200`  |
| DELETE      | 204    | Usually no response type     |

## Common Response Types by Endpoint

### Workouts

- `getWorkouts()` → `GetV1Workouts200`
- `getWorkout(id)` → `GetV1WorkoutsWorkoutid200`
- `getWorkoutCount()` → `GetV1WorkoutsCount200`
- `getWorkoutEvents()` → `GetV1WorkoutsEvents200`
- `createWorkout()` → `PostV1Workouts201`
- `updateWorkout()` → `PutV1WorkoutsWorkoutid200`

### Routines

- `getRoutines()` → `GetV1Routines200`
- `getRoutineById(id)` → `GetV1RoutinesRoutineid200`
- `createRoutine()` → `PostV1Routines201`
- `updateRoutine()` → `PutV1RoutinesRoutineid200`

### Exercise Templates

- `getExerciseTemplates()` → `GetV1ExerciseTemplates200`
- `getExerciseTemplate(id)` → `GetV1ExerciseTemplatesExercisetemplateid200`
- `getExerciseHistory()` → `GetV1ExerciseHistoryExercisetemplateid200`
- `createExerciseTemplate()` → `PostV1ExerciseTemplates200`

### Routine Folders

- `getRoutineFolders()` → `GetV1RoutineFolders200`
- `getRoutineFolder(id)` → `GetV1RoutineFoldersFolderid200`
- `createRoutineFolder()` → `PostV1RoutineFolders201`

## Implementation Checklist

When adding a new tool or handler:

- [ ] Import the response type from `../generated/client/types/index.js`
- [ ] Add explicit type annotation: `const data: ResponseType = await hevyClient.method()`
- [ ] Verify type checking passes: `pnpm run check:types`
- [ ] Verify tests pass: `pnpm vitest run --exclude 'tests/integration/**'`

## Troubleshooting

### "Property does not exist on type"

If you get an error like:

```
Property 'workoutCount' does not exist on type 'GetV1WorkoutsCount200'
```

This means:

1. You're accessing a property that doesn't exist in the API response
2. Check the generated type to see the correct property name (likely `workout_count`)
3. The Hevy API uses snake_case, not camelCase

### "Type X is not assignable to type Y"

If the hevyClient method returns a different type than expected:

1. Check `src/utils/hevyClientKubb.ts` for the actual return type
2. Verify you're using the `QueryResponse` or `MutationResponse` type, not the `Query` or `Mutation` type
3. The response types usually end in `200`, `201`, etc. (HTTP status codes)

## Maintaining Type Safety

### When Regenerating the API Client

After running `pnpm run build:client`:

1. Run `pnpm run check:types` to catch any breaking changes
2. Update type annotations in tool handlers if needed
3. Run tests to verify behavior: `pnpm vitest run --exclude 'tests/integration/**'`

### Code Review Checklist

When reviewing PRs that add/modify API calls:

- [ ] All `await hevyClient.*()` calls have explicit type annotations
- [ ] Type imports are from `../generated/client/types/index.js`
- [ ] No manual type assertions (`as { ... }`)
- [ ] TypeScript checks pass
- [ ] Tests pass

## Benefits Recap

✅ **Type Safety**: Compile-time property validation  
✅ **Maintainability**: Changes to API are caught immediately  
✅ **Developer Experience**: Full IDE autocomplete  
✅ **Documentation**: Types document the API response structure  
✅ **Consistency**: Same pattern across the entire codebase
