import { z } from "zod";
import type {
	GetV1Routines200,
	GetV1RoutinesRoutineid200,
	PostV1Routines201,
	PutV1RoutinesRoutineid200,
} from "@hevy-mcp/hevy-client/types";
import { parseJsonArray } from "../utils/json-parser.js";
import {
	createRoutineResponse,
	routineResponse,
	routinesResponse,
	updateRoutineResponse,
} from "../utils/response-formatter.js";
import {
	createAnnotations,
	readOnlyAnnotations,
	updateAnnotations,
} from "../utils/tool-annotations.js";
import { describeTool } from "../utils/tool-descriptions.js";
import {
	nonEmptyId,
	paginationShape,
	routineExerciseShape,
	routinePayloadShape,
} from "./input-schemas.js";
import { buildRoutinePayload } from "./payload-mappers.js";
import type { ToolDefinition } from "./define-tool.js";
import type { PaginatedToolResult } from "../utils/response-formatter.js";
import {
	isExpectedListPageNotFound,
	isExpectedReadNotFound,
	recordExpected404,
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
	description: describeTool({
		summary: "Read-only. Lists custom and default workout routines.",
		aliases: ["list routines", "show workout plans", "browse saved routines"],
		useCase:
			"Use to browse routines or discover a routine ID; use get-routine for one known routine.",
		importantNotes:
			"Results are paginated; page starts at 1 and pageSize is limited to 10.",
	}),
	inputSchema: getRoutinesSchema,
	kind: "read",
	outputSchema: routinesResponse.outputSchema,
	annotations: readOnlyAnnotations("Get Routines"),
	responseContract: routinesResponse,
	execute: async (runtime, { page, pageSize }) => {
		try {
			const data: GetV1Routines200 = await runtime.getClient().getRoutines({
				page,
				pageSize,
			});
			return { items: data?.routines ?? [], page, pageCount: data?.page_count };
		} catch (error) {
			if (isExpectedListPageNotFound(error, page)) {
				recordExpected404("end_of_list");
				return { items: [], page };
			}
			throw error;
		}
	},
};

const getRoutineSchema = { routineId: nonEmptyId } as const;

type GetRoutineResult = {
	routine: GetV1RoutinesRoutineid200["routine"] | null;
	routineId: string;
};
const getRoutineDefinition: ToolDefinition<
	typeof getRoutineSchema,
	GetRoutineResult
> = {
	name: "get-routine",
	feature: "routines",
	operation: "get",
	description: describeTool({
		summary:
			"Read-only. Retrieves one routine and its exercise configuration by ID.",
		aliases: ["show routine", "fetch workout plan", "routine details"],
		useCase:
			"Use when the routineId is known; use get-routines to browse or discover IDs.",
		importantNotes:
			"Requires a routineId from get-routines or a prior create response.",
	}),
	inputSchema: getRoutineSchema,
	kind: "read",
	outputSchema: routineResponse.outputSchema,
	annotations: readOnlyAnnotations("Get Routine"),
	responseContract: routineResponse,
	execute: async (runtime, { routineId }) => {
		try {
			const data: GetV1RoutinesRoutineid200 = await runtime
				.getClient()
				.getRoutineById(String(routineId));
			return { routine: data?.routine, routineId };
		} catch (error) {
			if (isExpectedReadNotFound(error)) {
				recordExpected404("not_found");
				return { routine: null, routineId };
			}
			throw error;
		}
	},
};

const routineExercisesSchema = z.preprocess(
	parseJsonArray,
	z.array(z.object(routineExerciseShape)),
);

const createRoutineSchema = routinePayloadShape;

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
	description: describeTool({
		summary: "Writes to the Hevy account by creating a new workout routine.",
		aliases: ["add routine", "build workout plan", "save training template"],
		useCase:
			"Use to create a reusable plan; use create-workout to log a completed session.",
		importantNotes:
			"Requires exercise template IDs; folderId is optional. Retrying can create duplicates, and non-fixed rep ranges may not display in Hevy apps.",
	}),
	inputSchema: createRoutineSchema,
	kind: "write",
	annotations: createAnnotations("Create Routine"),
	responseContract: createRoutineResponse,
	execute: async (runtime, args) => {
		const { payload, usesRepRanges } = buildRoutinePayload(args, "create");
		const data: PostV1Routines201 = await runtime
			.getClient()
			.createRoutine({ routine: payload });
		return { routine: data, usesRepRanges };
	},
};

const updateRoutineSchema = {
	routineId: nonEmptyId,
	title: z.string().min(1),
	notes: z.string().optional(),
	exercises: routineExercisesSchema,
} as const;

type UpdateRoutineResult = {
	routine: PutV1RoutinesRoutineid200 | null | undefined;
	routineId: string;
	usesRepRanges: boolean;
};
const updateRoutineDefinition: ToolDefinition<
	typeof updateRoutineSchema,
	UpdateRoutineResult
> = {
	name: "update-routine",
	feature: "routines",
	operation: "update",
	description: describeTool({
		summary:
			"Mutates the Hevy account by replacing an existing routine's content.",
		aliases: [
			"edit routine",
			"revise workout plan",
			"replace routine exercises",
		],
		useCase:
			"Use to change a known routine; use create-routine for a separate new plan.",
		importantNotes:
			"Requires routineId and the complete title and exercises payload; omitted exercises are removed. Non-fixed rep ranges may not display in Hevy apps.",
	}),
	inputSchema: updateRoutineSchema,
	kind: "write",
	annotations: updateAnnotations("Update Routine"),
	responseContract: updateRoutineResponse,
	execute: async (runtime, args) => {
		const { routineId } = args;
		const { payload, usesRepRanges } = buildRoutinePayload(args, "update");
		const data: PutV1RoutinesRoutineid200 = await runtime
			.getClient()
			.updateRoutine(routineId, { routine: payload });
		return { routine: data, routineId, usesRepRanges };
	},
};

export const routineToolDefinitions = [
	getRoutinesDefinition,
	getRoutineDefinition,
	createRoutineDefinition,
	updateRoutineDefinition,
] as const;
