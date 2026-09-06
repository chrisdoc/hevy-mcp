import { Effect } from "effect";
import type { RoutineFolder } from "@hevy-mcp/hevy-client/types";
import {
	createRoutineFolderResponse,
	routineFolderResponse,
} from "../utils/response-contracts.js";
import {
	createAnnotations,
	readOnlyAnnotations,
} from "../utils/tool-annotations.js";
import type { ToolDefinition } from "./define-tool.js";
import type { ToolRuntime } from "./tool-runtime.js";
import { HevyOperationsService } from "../effect-services.js";
import type { InferToolParams } from "../utils/tool-helpers.js";
import { nonEmptyId, routineFolderInputFields } from "./input-schemas.js";
import { operationEffect, requireOperation } from "./operation-helpers.js";

const getRoutineFolderSchema = { folder_id: nonEmptyId } as const;
type GetRoutineFolderParams = InferToolParams<typeof getRoutineFolderSchema>;

const createRoutineFolderSchema = routineFolderInputFields;
type CreateRoutineFolderParams = InferToolParams<
	typeof createRoutineFolderSchema
>;

const getRoutineFolderDefinition = {
	name: "get-routine-folder",
	feature: "folders" as const,
	operation: "get" as const,
	description:
		"Read-only. Gets one routine folder by folder_id. Use the hevy://routine-folders resource to discover IDs.",
	inputSchema: getRoutineFolderSchema,
	outputSchema: routineFolderResponse.outputSchema,
	annotations: readOnlyAnnotations("Get Routine Folder"),
	kind: "read" as const,
	responseContract: routineFolderResponse,
	execute: (
		runtime: ToolRuntime,
		args: GetRoutineFolderParams,
	): Effect.Effect<
		{
			routine_folder: RoutineFolder | null | undefined;
			folder_id: string;
			expected404Outcome?: "not_found";
		},
		import("../effect-errors.js").CoreToolError,
		never
	> =>
		operationEffect(
			requireOperation(
				runtime.service(HevyOperationsService).folders?.get,
				"folders.get",
			),
			{ folderId: args.folder_id },
			runtime.execution,
		).pipe(
			Effect.map(({ routineFolder, folderId, expected404Outcome }) => ({
				routine_folder: routineFolder,
				folder_id: folderId,
				expected404Outcome,
			})),
		),
} satisfies ToolDefinition<
	typeof getRoutineFolderSchema,
	{
		routine_folder: RoutineFolder | null | undefined;
		folder_id: string;
		expected404Outcome?: "not_found";
	}
>;

const createRoutineFolderDefinition = {
	name: "create-routine-folder",
	feature: "folders" as const,
	operation: "create" as const,
	description:
		"Writes a routine folder. Retries or reused titles can create duplicates.",
	inputSchema: createRoutineFolderSchema,
	annotations: createAnnotations("Create Routine Folder"),
	kind: "write" as const,
	responseContract: createRoutineFolderResponse,
	execute: (runtime: ToolRuntime, args: CreateRoutineFolderParams) =>
		operationEffect(
			requireOperation(
				runtime.service(HevyOperationsService).folders?.create,
				"folders.create",
			),
			args,
			runtime.execution,
		),
} satisfies ToolDefinition<
	typeof createRoutineFolderSchema,
	RoutineFolder | null | undefined
>;

export const folderToolDefinitions = [
	getRoutineFolderDefinition,
	createRoutineFolderDefinition,
] as const;
