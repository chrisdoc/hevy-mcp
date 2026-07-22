import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import type {
	GetV1WorkoutsCount200,
	RoutineFolder,
	UserInfoResponse,
} from "@hevy-mcp/hevy-client/types";
import type { ToolRuntime } from "../tools/tool-runtime.js";
import { fetchAllPages } from "../utils/pagination.js";
import {
	formatExerciseTemplate,
	formatRoutineFolder,
} from "../utils/response-formatter.js";

const JSON_MIME_TYPE = "application/json";

function createJsonResourceResult(uri: URL, data: unknown): ReadResourceResult {
	return {
		contents: [
			{
				uri: uri.toString(),
				mimeType: JSON_MIME_TYPE,
				text: JSON.stringify(data),
			},
		],
	};
}

async function fetchAllRoutineFolders(
	runtime: ToolRuntime,
): Promise<RoutineFolder[]> {
	const client = runtime.getClient();
	return fetchAllPages<RoutineFolder>(async (page, pageSize) => {
		const data = await client.getRoutineFolders({ page, pageSize });
		return {
			items: data?.routine_folders ?? [],
			pageCount: data?.page_count,
		};
	}, 10);
}

export function registerHevyResources(
	server: McpServer,
	runtime: ToolRuntime,
): void {
	server.registerResource(
		"user-profile",
		"hevy://user",
		{
			description: "Authenticated Hevy user profile",
			mimeType: JSON_MIME_TYPE,
		},
		async (uri) => {
			const data: UserInfoResponse = await runtime.getClient().getUserInfo();
			return createJsonResourceResult(uri, data?.data ?? null);
		},
	);

	server.registerResource(
		"workout-count",
		"hevy://workout-count",
		{
			description: "Total number of workouts in the Hevy account",
			mimeType: JSON_MIME_TYPE,
		},
		async (uri) => {
			const data: GetV1WorkoutsCount200 = await runtime
				.getClient()
				.getWorkoutCount();
			return createJsonResourceResult(uri, {
				count: data?.workout_count ?? 0,
			});
		},
	);

	server.registerResource(
		"exercise-templates",
		"hevy://exercise-templates",
		{
			description: "Full formatted Hevy exercise template catalog",
			mimeType: JSON_MIME_TYPE,
		},
		async (uri) => {
			const templates = await runtime.catalog.get();
			return createJsonResourceResult(
				uri,
				templates.map(formatExerciseTemplate),
			);
		},
	);

	server.registerResource(
		"routine-folders",
		"hevy://routine-folders",
		{
			description: "Full formatted list of Hevy routine folders",
			mimeType: JSON_MIME_TYPE,
		},
		async (uri) => {
			const folders = await fetchAllRoutineFolders(runtime);
			return createJsonResourceResult(uri, folders.map(formatRoutineFolder));
		},
	);
}
