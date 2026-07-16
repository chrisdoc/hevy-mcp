import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import type {
	GetV1RoutineFolders200,
	GetV1WorkoutsCount200,
	RoutineFolder,
	UserInfoResponse,
} from "../generated/client/types/index.js";
import {
	createExerciseTemplateCatalog,
	type ExerciseTemplateCatalog,
} from "../utils/exercise-template-catalog.js";
import {
	formatExerciseTemplate,
	formatRoutineFolder,
} from "../utils/response-formatter.js";
import { requireClient } from "../utils/tool-helpers.js";

type HevyClient = ReturnType<
	typeof import("../utils/hevyClientKubb.js").createClient
>;

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

function getSafePageCount(data: GetV1RoutineFolders200, currentPage: number) {
	const pageCount = data?.page_count;
	if (
		typeof pageCount !== "number" ||
		!Number.isSafeInteger(pageCount) ||
		pageCount < currentPage
	) {
		return currentPage;
	}

	return pageCount;
}

async function fetchAllRoutineFolders(
	hevyClient: HevyClient,
): Promise<RoutineFolder[]> {
	const allFolders: RoutineFolder[] = [];
	let page = 1;
	let pageCount = 1;

	do {
		const data: GetV1RoutineFolders200 = await hevyClient.getRoutineFolders({
			page,
			pageSize: 10,
		});
		allFolders.push(...(data?.routine_folders ?? []));
		pageCount = getSafePageCount(data, page);
		page++;
	} while (page <= pageCount);

	return allFolders;
}

export function registerHevyResources(
	server: McpServer,
	hevyClient: HevyClient | null,
	catalog: ExerciseTemplateCatalog = createExerciseTemplateCatalog(),
): void {
	server.registerResource(
		"user-profile",
		"hevy://user",
		{
			description: "Authenticated Hevy user profile",
			mimeType: JSON_MIME_TYPE,
		},
		async (uri) => {
			const client = requireClient(hevyClient);
			const data: UserInfoResponse = await client.getUserInfo();
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
			const client = requireClient(hevyClient);
			const data: GetV1WorkoutsCount200 = await client.getWorkoutCount();
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
			const client = requireClient(hevyClient);
			const templates = await catalog.get(client);
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
			const client = requireClient(hevyClient);
			const folders = await fetchAllRoutineFolders(client);
			return createJsonResourceResult(uri, folders.map(formatRoutineFolder));
		},
	);
}
