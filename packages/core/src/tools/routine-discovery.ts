import { z } from "zod";
import { Effect } from "effect";
import { compactRoutinesResponse } from "../utils/response-contracts.js";
import { summarizeRoutine } from "../utils/formatters.js";
import { readOnlyAnnotations } from "../utils/tool-annotations.js";

import type { InferToolParams } from "../utils/tool-helpers.js";
import type { ToolDefinition } from "./define-tool.js";
import type { ToolRuntime } from "./tool-runtime.js";
import { HevyOperationsService } from "../effect-services.js";
import { operationEffect, requireOperation } from "./operation-helpers.js";

const routineDiscoverySchema = {
	query: z.string().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
} as const;

type RoutineDiscoveryParams = InferToolParams<typeof routineDiscoverySchema>;

export const routineDiscoveryToolDefinitions = [
	{
		name: "search-routines",
		feature: "workflows" as const,
		operation: "search" as const,
		description:
			"Read-only. Searches routine titles and returns compact IDs and counts. Use get-routine for full exercises and sets.",
		inputSchema: routineDiscoverySchema,
		outputSchema: compactRoutinesResponse.outputSchema,
		annotations: readOnlyAnnotations("Search Routines"),
		kind: "read" as const,
		responseContract: compactRoutinesResponse,
		execute: (runtime: ToolRuntime, args: RoutineDiscoveryParams) =>
			operationEffect(
				requireOperation(
					runtime.service(HevyOperationsService).routines?.search,
					"routines.search",
				),
				{ query: args.query, limit: args.limit },
				runtime.execution,
			).pipe(
				Effect.map(({ routines, pages, itemsScanned }) => ({
					routines: routines.map(summarizeRoutine),
					workflow: {
						name: "routine-discovery" as const,
						pagination: { routines: pages },
						cacheStatus: "not-used" as const,
						itemsScanned,
					},
				})),
			),
	},
] satisfies readonly ToolDefinition<Record<string, z.ZodTypeAny>, unknown>[];
