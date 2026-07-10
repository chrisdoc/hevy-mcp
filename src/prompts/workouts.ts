import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const utcSecondTimestamp = z
	.string()
	.regex(
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
		"Must use the UTC format YYYY-MM-DDTHH:mm:ssZ",
	);

/** Register guided workout workflow prompts. */
export function registerWorkoutPrompts(server: McpServer) {
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
		({ weeks = 4 }) => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: [
							`Analyze my workout progress over the last ${weeks} weeks.`,
							"Use get-workout-count to establish the available workout total.",
							"Then call get-workouts with pageSize=10 and continue through pages until the requested date window is fully covered or no more workouts remain.",
							"Also call get-body-measurements with pageSize=10 and paginate until the same date window is covered or no more measurements remain.",
							"Base the analysis on retrieved evidence and discuss workout frequency, training volume, exercise variety, consistency, and body-measurement trends.",
							"Distinguish observations from suggestions, note missing or limited data, and do not make unsupported claims or medical conclusions.",
						].join("\n"),
					},
				},
			],
		}),
	);

	server.registerPrompt(
		"create-workout-from-routine",
		{
			title: "Create Workout From Routine",
			description: "Create a completed workout from an existing routine.",
			argsSchema: {
				routineId: z.string().min(1).describe("Routine ID to use as a guide."),
				startTime: utcSecondTimestamp.describe(
					"Workout start time in UTC as YYYY-MM-DDTHH:mm:ssZ.",
				),
			},
		},
		({ routineId, startTime }) => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: [
							`Create a workout from routine ${routineId}, starting at ${startTime}.`,
							"First call get-routine with the routineId and map supported plan fields: routine title to workout title, plus each exerciseTemplateId, supersetId, exercise notes, and set type.",
							"Do not copy routine-only restSeconds or repRange fields into create-workout.",
							"Before calling create-workout, confirm or collect the user's actual completed set data for every set, including applicable weight, reps, distance, duration, RPE, or custom metric values.",
							"Also collect the required endTime in strict UTC YYYY-MM-DDTHH:mm:ssZ format and confirm any other missing required workout fields.",
							"Never invent completion data. If the actual results or endTime are unavailable, ask the user for them instead of creating the workout.",
							"Once confirmed, call create-workout with only fields supported by that tool.",
						].join("\n"),
					},
				},
			],
		}),
	);
}
