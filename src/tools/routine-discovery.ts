import { z } from "zod";
import type {
	GetV1Routines200,
	Routine,
} from "../generated/client/types/index.js";
import {
	compactRoutinesResponse,
	type CompactRoutinesResult,
} from "../utils/response-formatter.js";
import { readOnlyAnnotations } from "../utils/tool-annotations.js";
import { describeTool } from "../utils/tool-descriptions.js";
import type { InferToolParams } from "../utils/tool-helpers.js";
import type { ToolDefinition } from "./define-tool.js";
import type { ToolRuntime } from "./tool-runtime.js";

const routineDiscoverySchema = {
	query: z
		.string()
		.min(1)
		.optional()
		.describe("Optional case-insensitive substring to match routine titles."),
	limit: z.coerce
		.number()
		.int()
		.min(1)
		.max(100)
		.default(20)
		.describe("Maximum compact routines to return (1-100)."),
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
		routines: routines.slice(0, limit).map((routine) => ({
			...(routine.id ? { id: routine.id } : {}),
			...(routine.title ? { title: routine.title } : {}),
			folderId: routine.folder_id ?? null,
			...(routine.updated_at ? { updatedAt: routine.updated_at } : {}),
			exerciseCount: routine.exercises?.length ?? 0,
			setCount:
				routine.exercises?.reduce(
					(total, exercise) => total + (exercise.sets?.length ?? 0),
					0,
				) ?? 0,
		})),
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
		description: describeTool({
			summary:
				"Read-only. Discovers routines by title and returns compact metadata without full set payloads.",
			aliases: ["find routine", "browse routine names", "compact routine list"],
			useCase:
				"Use to find a routine ID or shortlist plans before calling get-routine for full exercise details.",
			importantNotes:
				"Search scans routine pages at pageSize 10 and returns only IDs, titles, folder metadata, and exercise/set counts.",
		}),
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
