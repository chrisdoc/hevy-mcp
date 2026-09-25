# Type safety guide

The repository uses two related type boundaries: the typed Hevy client and
schema-derived MCP inputs. TypeScript checks these contracts at compile time;
it does not validate network payloads at runtime.

## Hevy client responses

`HevyClient` methods declare their Promise response types, so ordinary calls
are already inferred. For example, `getWorkouts()` returns the generated
workouts response type:

```ts
import type { HevyClient } from "@hevy-mcp/hevy-client";

async function readWorkouts(client: HevyClient) {
	const response = await client.getWorkouts();
	return response.workouts ?? [];
}
```

Add an explicit annotation when it clarifies a boundary or contract; do not add
one merely because the value came from an API call. The curated
`@hevy-mcp/hevy-client/types` export includes the friendly `GetV1Workouts200`
alias when a named response type is useful:

```ts
import type { GetV1Workouts200 } from "@hevy-mcp/hevy-client/types";
import type { HevyClient } from "@hevy-mcp/hevy-client";

declare const client: HevyClient;
const response: GetV1Workouts200 = await client.getWorkouts();
```

These types describe the expected Hevy response shape. They are not runtime
validation. Validate untrusted values at the boundary where they enter the
application, using the owning Zod schema when runtime validation is required.

Import public client types from `@hevy-mcp/hevy-client/types` and schemas from
`@hevy-mcp/hevy-client/schemas`. Do not import Kubb-generated implementation
files or edit `packages/hevy-client/src/generated/` by hand. See the
[generated client workflow in CONTRIBUTING](../CONTRIBUTING.md#generated-api-client)
for regeneration and validation.

## MCP tool inputs

For MCP handlers, define the Zod input shape once and derive the TypeScript
argument type with `InferToolParams`. In a module under
`packages/core/src/tools/`:

```ts
import { z } from "zod";
import type { InferToolParams } from "../utils/tool-helpers.js";

const inputSchema = {
	page: z.coerce.number().int().gte(1).default(1),
	pageSize: z.coerce.number().int().gte(1).lte(10).default(5),
} as const;

type Input = InferToolParams<typeof inputSchema>;
```

Follow the existing tool-definition pattern so the schema remains the single
source of truth for validation and handler types. Avoid handwritten parallel
interfaces, `args as { ... }` casts, and `Record<string, unknown>` handler
arguments. For response schemas and registration conventions, see
[AGENTS.md](../AGENTS.md#mcp-contracts) and
[architecture.md](./architecture.md#zod-schema-inference-for-type-safe-tool-parameters).

Run the type and test checks required by
[CONTRIBUTING.md](../CONTRIBUTING.md#required-validation); select focused test
lanes from [test-lanes.md](./test-lanes.md).
