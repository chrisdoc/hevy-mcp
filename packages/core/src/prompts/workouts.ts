import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { utcSecondTimestamp } from "../utils/schemas.js";
import type { ToolObserver } from "../observation.js";
import { withPromptObservation } from "./observation.js";

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
			argsSchema: {
				weeks: z.coerce
					.number()
					.int()
					.min(1)
					.max(12)
					.default(4)
					.optional()
					.describe("Number of recent weeks to analyze (1-12)."),
			},
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
			argsSchema: {
				routineId: z
					.string()
					.min(1)
					.optional()
					.describe("Routine ID to use as a guide."),
				startTime: utcSecondTimestamp
					.optional()
					.describe("Workout start time in UTC as YYYY-MM-DDTHH:mm:ssZ."),
			},
		},
		withPromptObservation(
			"create-workout-from-routine",
			observer,
			({ routineId, startTime }) => ({
				messages: [
					{
						role: "user",
						content: {
							type: "text",
							text: [
								routineId
									? `Use routine ${routineId}.`
									: "Ask which routine was performed. If the user gives a name, use search-routines; if they want to browse, use get-routines. Ask them to choose when multiple routines match, and never guess an ID.",
								startTime
									? `Use ${startTime} as the workout start time.`
									: "Ask when the workout started and for the relevant timezone, then convert it to strict UTC YYYY-MM-DDTHH:mm:ssZ format.",
								"Fetch the chosen routine with get-routine and use it only as the plan. Map its title and supported exerciseTemplateId, supersetId, exercise notes, and set type fields.",
								"Do not copy routine-only restSeconds or repRange fields into create-workout.",
								"Collect the user's actual completed result for every set, including each applicable weight, reps, distance, duration, RPE, or custom metric, plus the required endTime.",
								"Never treat planned values as completed results unless the user explicitly confirms they performed them. Never invent missing completion data.",
								"Preview the complete workout and its assumptions. Ask for explicit approval, incorporate any corrections, and only then call create-workout once with supported fields.",
								"If the result of create-workout is uncertain, report that uncertainty and do not retry automatically because a retry can create a duplicate.",
							].join("\n"),
						},
					},
				],
			}),
		),
	);
}
