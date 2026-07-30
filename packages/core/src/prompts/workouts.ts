import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { utcSecondTimestamp } from "../utils/schemas.js";
import { memoizeObservationScope, type ToolObserver } from "../observation.js";
import { bucketCount } from "../utils/result-telemetry.js";
import { resolveErrorPolicy } from "../utils/error-policy.js";

type PromptResult = {
	messages: Array<{
		role: "user" | "assistant";
		content: { type: "text"; text: string };
	}>;
};

function withPromptObservation<TArgs extends Record<string, unknown>>(
	name: string,
	observer: ToolObserver | undefined,
	handler: (args: TArgs) => Promise<PromptResult> | PromptResult,
) {
	return async (args: TArgs): Promise<PromptResult> => {
		const startedAt = Date.now();
		let scope;
		try {
			scope = memoizeObservationScope(
				observer?.start({
					name,
					kind: "prompt",
					argumentKeys: Object.keys(args).filter(
						(key) => key === "routine_id",
					) as "routine_id"[],
					argumentPresence: args.routine_id ? { routine_id: true } : {},
					argumentKeyCountBucket: bucketCount(Object.keys(args).length),
				}),
			);
		} catch {
			scope = undefined;
		}

		try {
			const invoke = () => Promise.resolve(handler(args));
			const result = await (scope ? scope.run(invoke) : invoke());
			void scope?.finish({
				outcome: "success",
				durationMs: Date.now() - startedAt,
				result: {
					isError: false,
					hasStructuredContent: false,
					contentCountBucket: bucketCount(result.messages.length),
				},
			});
			return result;
		} catch (error) {
			const policy = resolveErrorPolicy(error, "MCP prompt failed");
			void scope?.finish({
				outcome: "thrown_error",
				durationMs: Date.now() - startedAt,
				errorType: policy.type,
				error: policy.diagnostic,
			});
			console.error("MCP prompt failure", policy.diagnostic);
			throw error;
		}
	};
}

/** Register guided workout workflow prompts. */
export function registerWorkoutPrompts(
	server: McpServer,
	observer?: ToolObserver,
) {
	server.registerPrompt(
		"analyze-workout-progress",
		{
			title: "Analyze Workout Progress",
			description: "Analyze recent workout and body-measurement trends.",
			argsSchema: z.object({
				weeks: z.coerce
					.number()
					.int()
					.min(1)
					.max(12)
					.default(4)
					.optional()
					.describe("Number of recent weeks to analyze (1-12)."),
			}),
		},
		withPromptObservation(
			"analyze-workout-progress",
			observer,
			({ weeks = 4 }) => ({
				messages: [
					{
						role: "user",
						content: {
							type: "text",
							text: [
								`Analyze my workout progress over the last ${weeks} weeks.`,
								"Call get-training-summary with the requested weeks; it combines recent workouts and body measurements into one compact evidence set.",
								"Use the returned period, workout frequency, volume, exercise variety, session list, and measurement trend fields rather than issuing separate count and pagination calls.",
								"Base the analysis on retrieved evidence and discuss workout frequency, training volume, exercise variety, consistency, and body-measurement trends.",
								"Distinguish observations from suggestions, note missing or limited data, and do not make unsupported claims or medical conclusions.",
							].join("\n"),
						},
					},
				],
			}),
		),
	);

	server.registerPrompt(
		"create-workout-from-routine",
		{
			title: "Create Workout From Routine",
			description: "Create a completed workout from an existing routine.",
			argsSchema: z.object({
				routine_id: z
					.string()
					.min(1)
					.optional()
					.describe("Routine ID to use as a guide."),
				start_time: utcSecondTimestamp
					.optional()
					.describe("Workout start time in UTC as YYYY-MM-DDTHH:mm:ssZ."),
			}),
		},
		withPromptObservation(
			"create-workout-from-routine",
			observer,
			({ routine_id, start_time }) => ({
				messages: [
					{
						role: "user",
						content: {
							type: "text",
							text:
								routine_id && start_time
									? [
											`Create a workout from routine ${routine_id}, starting at ${start_time}.`,
											[
												"First call get-routine with the routine_id and map supported plan fields:",
												"routine title to workout title, plus each exercise_template_id, superset_id, exercise notes, and set type.",
											].join(" "),
											[
												"Do not copy routine-only rest_seconds or rep_range fields into",
												"create-workout.",
											].join(" "),
											[
												"Before calling create-workout, confirm or collect the user's actual completed set data for every set,",
												"including applicable weight_kg, reps, distance_meters, duration_seconds, rpe, or custom_metric values.",
											].join(" "),
											[
												"Also collect the required end_time in strict UTC YYYY-MM-DDTHH:mm:ssZ format and confirm",
												"any other missing required workout fields.",
											].join(" "),
											[
												"Never invent completion data. If the actual results or end_time are unavailable, ask the user for them",
												"instead of creating the workout.",
											].join(" "),
											"Once confirmed, call create-workout with only fields supported by that tool.",
										].join("\n")
									: "Provide a routine_id and start_time to generate the full prompt.",
						},
					},
				],
			}),
		),
	);
}
