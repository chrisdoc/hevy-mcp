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
								"Start with get-training-summary for the requested period. Use its weekly buckets and exercise trends before considering narrower follow-up reads.",
								"Report: (1) data coverage, (2) three to five evidence-backed findings, (3) two to four prioritized actions for the next one to two weeks, and (4) limitations.",
								"Cite workout or exercise names, dates, and IDs when available. Keep observations, inferences, and recommendations clearly distinguishable.",
								"Do not claim progression for an exercise represented by fewer than two sessions. Treat weighted-rep volume as exercise-specific and never compare or sum it across different exercises.",
								"Lead with training frequency, consistency, working sets, session duration, and exercise-specific performance. Mention body measurements only when at least two comparable readings exist, and never claim that training caused a measurement change.",
								"If no training goal is known, provide goal-neutral actions and finish with one concise question that would personalize the recommendations.",
								"When data is missing or limited, say so directly. Do not invent evidence, diagnose injuries, give medical conclusions, or prescribe rehabilitation.",
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
			({ routine_id, start_time }) => {
				const text =
					routine_id && start_time
						? [
								`Create a workout from routine ${routine_id}, starting at ${start_time}.`,
								"First call get-routine with the routine_id and map supported plan fields: routine title to workout title, plus each exercise_template_id, superset_id, exercise notes, and set type.",
								"Do not copy routine-only rest_seconds or rep_range fields into create-workout.",
								"Before calling create-workout, confirm or collect the user's actual completed set data for every set, including applicable weight_kg, reps, distance_meters, duration_seconds, rpe, or custom_metric values.",
								"Also collect the required end_time in strict UTC YYYY-MM-DDTHH:mm:ssZ format and confirm any other missing required workout fields.",
								"Never invent completion data. If the actual results or end_time are unavailable, ask the user for them instead of creating the workout.",
								"Preview the complete workout and its assumptions, ask for explicit approval, incorporate any corrections, and only then call create-workout once with supported fields.",
								"If the result of create-workout is uncertain, report that uncertainty and do not retry automatically because a retry can create a duplicate.",
							].join("\n")
						: [
								routine_id
									? `Use routine ${routine_id}.`
									: "Ask which routine was performed. If the user gives a name, use search-routines; if they want to browse, use get-routines. Ask them to choose when multiple routines match, and never guess an ID.",
								start_time
									? `Use ${start_time} as the workout start time.`
									: "Ask when the workout started and for the relevant timezone, then convert it to strict UTC YYYY-MM-DDTHH:mm:ssZ format.",
								"After the missing inputs are collected, fetch the chosen routine with get-routine and use it only as the plan. Map its title and supported exercise_template_id, superset_id, exercise notes, and set type fields.",
								"Do not copy routine-only rest_seconds or rep_range fields into create-workout.",
								"Collect the user's actual completed result for every set, including each applicable weight_kg, reps, distance_meters, duration_seconds, RPE, or custom_metric, plus the required end_time.",
								"Never treat planned values as completed results unless the user explicitly confirms they performed them. Never invent missing completion data.",
								"Preview the complete workout and its assumptions. Ask for explicit approval, incorporate any corrections, and only then call create-workout once with supported fields.",
								"If the result of create-workout is uncertain, report that uncertainty and do not retry automatically because a retry can create a duplicate.",
							].join("\n");
				return {
					messages: [
						{
							role: "user",
							content: { type: "text", text },
						},
					],
				};
			},
		),
	);
}
