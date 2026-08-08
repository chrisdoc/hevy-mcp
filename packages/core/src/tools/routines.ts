import type {
	PostV1Routines201,
	PutV1RoutinesRoutineid200,
	Routine,
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
import type { ToolRuntime } from "./tool-runtime.js";
import type { PaginatedToolResult } from "../utils/response-contracts.js";

const getRoutinesSchema = paginationShape({
	defaultPageSize: 5,
	maxPageSize: 10,
});

type GetRoutinesResult = PaginatedToolResult<Routine>;
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
	execute: async (runtime: ToolRuntime, { page, page_size }) =>
		runtime
			.getOperations()
			.routines.list.execute({ page, pageSize: page_size }, runtime.execution),
};

const getRoutineSchema = { routine_id: nonEmptyId } as const;

type GetRoutineResult = {
	routine: Routine | null;
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
		const data = await runtime
			.getOperations()
			.routines.get.execute({ routineId: routine_id }, runtime.execution);
		return { ...data, routine_id };
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
