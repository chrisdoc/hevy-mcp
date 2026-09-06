import { Effect } from "effect";
import type { Routine } from "@hevy-mcp/hevy-client/types";
import { createRoutineOutputSchema } from "../utils/output-schemas.js";
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
	paginationFields,
	createRoutineInputFields,
	updateRoutineInputFields,
} from "./input-schemas.js";
import type { ToolDefinition } from "./define-tool.js";
import type { ToolRuntime } from "./tool-runtime.js";
import type { PaginatedToolResult } from "../utils/response-contracts.js";
import { HevyOperationsService } from "../effect-services.js";
import { operationEffect, requireOperation } from "./operation-helpers.js";

const getRoutinesSchema = paginationFields({
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
	execute: (runtime: ToolRuntime, { page, page_size }) =>
		operationEffect(
			requireOperation(
				runtime.service(HevyOperationsService).routines.list,
				"routines.list",
			),
			{ page, pageSize: page_size },
			runtime.execution,
		),
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
	execute: (runtime, { routine_id }) =>
		operationEffect(
			requireOperation(
				runtime.service(HevyOperationsService).routines.get,
				"routines.get",
			),
			{ routineId: routine_id },
			runtime.execution,
		).pipe(Effect.map((data) => ({ ...data, routine_id }))),
};

const createRoutineSchema = createRoutineInputFields;

type CreateRoutineResult = {
	routine: Routine | null | undefined;
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
	outputSchema: createRoutineOutputSchema,
	annotations: createAnnotations("Create Routine"),
	responseContract: createRoutineResponse,
	execute: (runtime, args) =>
		operationEffect(
			requireOperation(
				runtime.service(HevyOperationsService).routines.create,
				"routines.create",
			),
			{ routine: args.routine },
			runtime.execution,
		),
};

const updateRoutineSchema = updateRoutineInputFields;

type UpdateRoutineResult = {
	routine: Routine | null | undefined;
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
	execute: (runtime, args) =>
		operationEffect(
			requireOperation(
				runtime.service(HevyOperationsService).routines.update,
				"routines.update",
			),
			{ routineId: args.routine_id, routine: args.routine },
			runtime.execution,
		).pipe(
			Effect.map((data) => ({
				...data,
				routine_id: args.routine_id,
			})),
		),
};

export const routineToolDefinitions = [
	getRoutinesDefinition,
	getRoutineDefinition,
	createRoutineDefinition,
	updateRoutineDefinition,
] as const;
