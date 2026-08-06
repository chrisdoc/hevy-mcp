import type {
	McpServer,
	ReadResourceResult,
	ServerContext,
} from "@modelcontextprotocol/server";
import type {
	GetV1WorkoutsCount200,
	RoutineFolder,
	UserInfoResponse,
} from "@hevy-mcp/hevy-client/types";
import type { ToolRuntime } from "../tools/tool-runtime.js";
import { fetchAllPages } from "../utils/pagination.js";
import { projectRoutineFolder } from "../utils/response-contracts.js";
import { createExecutionErrorProjection } from "../utils/error-handler.js";
import { bucketCount } from "../utils/result-telemetry.js";
import { memoizeObservationScope, type ToolObserver } from "../observation.js";

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

function createResourceErrorResult(
	uri: URL,
	error: unknown,
): ReadResourceResult {
	return createJsonResourceResult(uri, {
		error: createExecutionErrorProjection(error),
	});
}

async function readResource(
	uri: URL,
	read: () => Promise<ReadResourceResult>,
): Promise<ReadResourceResult> {
	try {
		return await read();
	} catch (error) {
		return createResourceErrorResult(uri, error);
	}
}

function withResourceObservation(
	name: string,
	observer: ToolObserver | undefined,
	handler: (uri: URL, context: ServerContext) => Promise<ReadResourceResult>,
): (uri: URL, context: ServerContext) => Promise<ReadResourceResult> {
	return async (uri, context) => {
		const startedAt = Date.now();
		let scope;
		try {
			scope = memoizeObservationScope(
				observer?.start({ name, kind: "resource" }),
			);
		} catch {
			scope = undefined;
		}

		try {
			const result = await (scope
				? scope.run(() => handler(uri, context))
				: handler(uri, context));
			void scope?.finish({
				outcome: "success",
				durationMs: Date.now() - startedAt,
				result: {
					isError: false,
					hasStructuredContent: false,
					contentCountBucket: bucketCount(result.contents.length),
				},
			});
			return result;
		} catch (error) {
			void scope?.finish({
				outcome: "thrown_error",
				durationMs: Date.now() - startedAt,
			});
			throw error;
		}
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
	observer?: ToolObserver,
): void {
	server.registerResource(
		"user-profile",
		"hevy://user",
		{
			description: "Authenticated Hevy user profile",
			mimeType: JSON_MIME_TYPE,
		},
		withResourceObservation("user-profile", observer, async (uri, context) =>
			readResource(uri, async () => {
				const scoped = runtime.forExecution({ signal: context.mcpReq.signal });
				const data: UserInfoResponse = await scoped.getClient().getUserInfo();
				return createJsonResourceResult(uri, data?.data ?? null);
			}),
		),
	);

	server.registerResource(
		"workout-count",
		"hevy://workout-count",
		{
			description: "Total number of workouts in the Hevy account",
			mimeType: JSON_MIME_TYPE,
		},
		withResourceObservation("workout-count", observer, async (uri, context) =>
			readResource(uri, async () => {
				const scoped = runtime.forExecution({ signal: context.mcpReq.signal });
				const data: GetV1WorkoutsCount200 = await scoped
					.getClient()
					.getWorkoutCount();
				return createJsonResourceResult(uri, {
					workout_count: data?.workout_count ?? 0,
				});
			}),
		),
	);

	server.registerResource(
		"exercise-templates",
		"hevy://exercise-templates",
		{
			description: "Full formatted Hevy exercise template catalog",
			mimeType: JSON_MIME_TYPE,
		},
		withResourceObservation(
			"exercise-templates",
			observer,
			async (uri, context) =>
				readResource(uri, async () => {
					const scoped = runtime.forExecution({
						signal: context.mcpReq.signal,
					});
					const templates = await scoped.catalog.get();
					return createJsonResourceResult(uri, templates);
				}),
		),
	);

	server.registerResource(
		"routine-folders",
		"hevy://routine-folders",
		{
			description: "Full formatted list of Hevy routine folders",
			mimeType: JSON_MIME_TYPE,
		},
		withResourceObservation("routine-folders", observer, async (uri, context) =>
			readResource(uri, async () => {
				const folders = await fetchAllRoutineFolders(
					runtime.forExecution({ signal: context.mcpReq.signal }),
				);
				return createJsonResourceResult(uri, folders.map(projectRoutineFolder));
			}),
		),
	);
}
