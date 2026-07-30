import { z } from "zod";
import type { GetV1Routines200, Routine } from "@hevy-mcp/hevy-client/types";
import {
	compactRoutinesResponse,
	summarizeRoutine,
	type CompactRoutinesResult,
} from "../utils/response-contracts.js";
import { readOnlyAnnotations } from "../utils/tool-annotations.js";

import type { InferToolParams } from "../utils/tool-helpers.js";
import type { ToolDefinition } from "./define-tool.js";
import type { ToolRuntime } from "./tool-runtime.js";

const routineDiscoverySchema = {
	query: z.string().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
} as const;

type RoutineDiscoveryParams = InferToolParams<typeof routineDiscoverySchema>;

async function discoverRoutines(
	runtime: ToolRuntime,
	{ query, limit }: RoutineDiscoveryParams,
): Promise<CompactRoutinesResult> {
	const normalizedQuery = query?.toLocaleLowerCase();
	const routines: Routine[] = [];
	let page = 1;
	let pages = 0;
	let itemsScanned = 0;
	const client = runtime.getClient();

	while (routines.length < limit) {
		const data: GetV1Routines200 = await client.getRoutines({
			page,
			pageSize: 10,
		});
		pages = page;
		const pageItems = data?.routines ?? [];
		itemsScanned += pageItems.length;
		for (const routine of pageItems) {
			if (
				normalizedQuery &&
				!routine.title?.toLocaleLowerCase().includes(normalizedQuery)
			) {
				continue;
			}
			routines.push(routine);
			if (routines.length >= limit) break;
		}

		const pageCount = data?.page_count;
		if (
			typeof pageCount !== "number" ||
			!Number.isSafeInteger(pageCount) ||
			pageCount <= page
		) {
			break;
		}
		page += 1;
	}

	return {
		routines: routines.slice(0, limit).map(summarizeRoutine),
		workflow: {
			name: "routine-discovery",
			pagination: { routines: pages },
			cacheStatus: "not-used",
			itemsScanned,
		},
	};
}

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
		execute: async (runtime: ToolRuntime, args: RoutineDiscoveryParams) =>
			discoverRoutines(runtime, args),
	},
] satisfies readonly ToolDefinition<Record<string, z.ZodTypeAny>, unknown>[];

export { discoverRoutines };
