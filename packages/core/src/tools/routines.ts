import type {
	GetV1Routines200,
	GetV1RoutinesRoutineid200,
	PostV1Routines201,
	PutV1RoutinesRoutineid200,
} from "@hevy-mcp/hevy-client/types";
import {
	createRoutineResponse,
	routineResponse,
	routinesResponse,
	updateRoutineResponse,
} from "../utils/response-contracts.js";
import {
	createAnnotations,
	readOnlyAnnotations,
	updateAnnotations,
} from "../utils/tool-annotations.js";

import {
	nonEmptyId,
	paginationShape,
	createRoutineInputShape,
	updateRoutineInputShape,
} from "./input-schemas.js";
import { buildRoutinePayload } from "./mutation-semantics.js";
import type { ToolDefinition } from "./define-tool.js";
import type { PaginatedToolResult } from "../utils/response-contracts.js";
import {
	isExpectedListPageNotFound,
	isExpectedReadNotFound,
} from "../utils/hevy-error-policy.js";

const getRoutinesSchema = paginationShape({
	defaultPageSize: 5,
	maxPageSize: 10,
});

type GetRoutinesResult = PaginatedToolResult<
	NonNullable<GetV1Routines200["routines"]>[number]
>;
const getRoutinesDefinition: ToolDefinition<
	typeof getRoutinesSchema,
	GetRoutinesResult
> = {
	name: "get-routines",
	feature: "routines",
	operation: "list",
	description:
		"Read-only. Lists compact routine summaries. Use get-routine for exercises and sets; results are paginated.",
	inputSchema: getRoutinesSchema,
	kind: "read",
	outputSchema: routinesResponse.outputSchema,
	annotations: readOnlyAnnotations("Get Routines"),
	responseContract: routinesResponse,
	execute: async (runtime, { page, page_size }) => {
		try {
			const data: GetV1Routines200 = await runtime.getClient().getRoutines({
				page,
				pageSize: page_size,
			});
			return { items: data?.routines ?? [], page, pageCount: data?.page_count };
		} catch (error) {
			if (isExpectedListPageNotFound(error, page)) {
				return { items: [], page, expected404Outcome: "end_of_list" };
			}
			throw error;
		}
	},
};

const getRoutineSchema = { routine_id: nonEmptyId } as const;

type GetRoutineResult = {
	routine: GetV1RoutinesRoutineid200["routine"] | null;
	routine_id: string;
	expected404Outcome?: "not_found";
};
const getRoutineDefinition: ToolDefinition<
	typeof getRoutineSchema,
	GetRoutineResult
> = {
	name: "get-routine",
	feature: "routines",
	operation: "get",
	description:
		"Read-only. Gets one routine with exercises and sets by routine_id. Use search-routines to discover IDs.",
	inputSchema: getRoutineSchema,
	kind: "read",
	outputSchema: routineResponse.outputSchema,
	annotations: readOnlyAnnotations("Get Routine"),
	responseContract: routineResponse,
	execute: async (runtime, { routine_id }) => {
		try {
			const data: GetV1RoutinesRoutineid200 = await runtime
				.getClient()
				.getRoutineById(String(routine_id));
			return { routine: data?.routine, routine_id };
		} catch (error) {
			if (isExpectedReadNotFound(error)) {
				return {
					routine: null,
					routine_id,
					expected404Outcome: "not_found",
				};
			}
			throw error;
		}
	},
};

const createRoutineSchema = createRoutineInputShape;

type CreateRoutineResult = {
	routine: PostV1Routines201 | null | undefined;
	usesRepRanges: boolean;
};
const createRoutineDefinition: ToolDefinition<
	typeof createRoutineSchema,
	CreateRoutineResult
> = {
	name: "create-routine",
	feature: "routines",
	operation: "create",
	description:
		"Writes a reusable routine; use create-workout for completed sessions. Retries can create duplicates.",
	inputSchema: createRoutineSchema,
	kind: "write",
	annotations: createAnnotations("Create Routine"),
	responseContract: createRoutineResponse,
	execute: async (runtime, args) => {
		const { payload, usesRepRanges } = buildRoutinePayload(
			args.routine,
			"create",
		);
		const data: PostV1Routines201 = await runtime
			.getClient()
			.createRoutine({ routine: payload });
		return { routine: data, usesRepRanges };
	},
};

const updateRoutineSchema = updateRoutineInputShape;

type UpdateRoutineResult = {
	routine: PutV1RoutinesRoutineid200 | null | undefined;
	routine_id: string;
	usesRepRanges: boolean;
};
const updateRoutineDefinition: ToolDefinition<
	typeof updateRoutineSchema,
	UpdateRoutineResult
> = {
	name: "update-routine",
	feature: "routines",
	operation: "update",
	description:
		"Mutates a routine by replacing its title and exercises. Omitted exercises are removed.",
	inputSchema: updateRoutineSchema,
	kind: "write",
	annotations: updateAnnotations("Update Routine"),
	responseContract: updateRoutineResponse,
	execute: async (runtime, args) => {
		const { routine_id } = args;
		const { payload, usesRepRanges } = buildRoutinePayload(
			args.routine,
			"update",
		);
		const data: PutV1RoutinesRoutineid200 = await runtime
			.getClient()
			.updateRoutine(routine_id, { routine: payload });
		return { routine: data, routine_id, usesRepRanges };
	},
};

export const routineToolDefinitions = [
	getRoutinesDefinition,
	getRoutineDefinition,
	createRoutineDefinition,
	updateRoutineDefinition,
] as const;
