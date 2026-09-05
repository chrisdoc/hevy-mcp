import type {
	McpServer,
	ReadResourceResult,
	ServerContext,
} from "@modelcontextprotocol/server";
import { Effect } from "effect";
import type { ToolRuntime } from "../tools/tool-runtime.js";
import {
	ExerciseTemplateCatalogService,
	HevyOperationsService,
} from "../effect-services.js";
import { projectRoutineFolder } from "../utils/formatters.js";
import { createExecutionErrorProjection } from "../utils/error-handler.js";
import { requireOperation } from "../tools/operation-helpers.js";
import type { RuntimeValue } from "../utils/type-predicates.js";
import {
	mergeAbortSignals,
	runBoundedExecution,
	type ToolExecutionContext,
} from "../execution.js";

const JSON_MIME_TYPE = "application/json";

function createJsonResourceResult(
	uri: URL,
	data: RuntimeValue,
): ReadResourceResult {
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
	error: RuntimeValue,
): ReadResourceResult {
	return createJsonResourceResult(uri, {
		error: createExecutionErrorProjection(error),
	});
}

async function readResource(
	uri: URL,
	signal: AbortSignal | undefined,
	execution: ToolExecutionContext | undefined,
	executionTimeoutMs: number,
	executionDeadline: number | undefined,
	read: () => Effect.Effect<ReadResourceResult, unknown, never>,
): Promise<ReadResourceResult> {
	try {
		const program = Effect.try({
			try: read,
			catch: (error) => error,
		}).pipe(Effect.flatten);
		return await runBoundedExecution(program, {
			signal,
			timeoutMs: executionTimeoutMs,
			deadline: execution?.deadline ?? executionDeadline,
		});
	} catch (error) {
		return createResourceErrorResult(uri, error);
	}
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
		async (uri, context: ServerContext) =>
			readResource(
				uri,
				mergeAbortSignals(runtime.lifecycleSignal, context.mcpReq.signal),
				undefined,
				runtime.executionTimeoutMs,
				runtime.executionDeadline,
				() => {
					const scoped = runtime.forExecution({
						signal: context.mcpReq.signal,
					});
					return requireOperation(
						scoped.service(HevyOperationsService).user?.get,
						"user.get",
					)
						.effect(scoped.execution)
						.pipe(
							Effect.map((user) => createJsonResourceResult(uri, user ?? null)),
						);
				},
			),
	);

	server.registerResource(
		"workout-count",
		"hevy://workout-count",
		{
			description: "Total number of workouts in the Hevy account",
			mimeType: JSON_MIME_TYPE,
		},
		async (uri, context: ServerContext) =>
			readResource(
				uri,
				mergeAbortSignals(runtime.lifecycleSignal, context.mcpReq.signal),
				undefined,
				runtime.executionTimeoutMs,
				runtime.executionDeadline,
				() => {
					const scoped = runtime.forExecution({
						signal: context.mcpReq.signal,
					});
					return requireOperation(
						scoped.service(HevyOperationsService).workouts.count,
						"workouts.count",
					)
						.effect(scoped.execution)
						.pipe(
							Effect.map((workoutCount) =>
								createJsonResourceResult(uri, {
									workout_count: workoutCount,
								}),
							),
						);
				},
			),
	);

	server.registerResource(
		"exercise-templates",
		"hevy://exercise-templates",
		{
			description: "Full formatted Hevy exercise template catalog",
			mimeType: JSON_MIME_TYPE,
		},
		async (uri, context: ServerContext) =>
			readResource(
				uri,
				mergeAbortSignals(runtime.lifecycleSignal, context.mcpReq.signal),
				undefined,
				runtime.executionTimeoutMs,
				runtime.executionDeadline,
				() => {
					const scoped = runtime.forExecution({
						signal: context.mcpReq.signal,
					});
					return scoped
						.service(ExerciseTemplateCatalogService)
						.effect({ execution: scoped.execution })
						.pipe(
							Effect.map((templates) =>
								createJsonResourceResult(uri, templates),
							),
						);
				},
			),
	);

	server.registerResource(
		"routine-folders",
		"hevy://routine-folders",
		{
			description: "Full formatted list of Hevy routine folders",
			mimeType: JSON_MIME_TYPE,
		},
		async (uri, context: ServerContext) =>
			readResource(
				uri,
				mergeAbortSignals(runtime.lifecycleSignal, context.mcpReq.signal),
				undefined,
				runtime.executionTimeoutMs,
				runtime.executionDeadline,
				() => {
					const scoped = runtime.forExecution({
						signal: context.mcpReq.signal,
					});
					return requireOperation(
						scoped.service(HevyOperationsService).folders?.listAll,
						"folders.listAll",
					)
						.effect(scoped.execution)
						.pipe(
							Effect.map((folders) =>
								createJsonResourceResult(
									uri,
									folders.map(projectRoutineFolder),
								),
							),
						);
				},
			),
	);
}
