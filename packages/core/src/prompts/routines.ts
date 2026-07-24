import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolObserver } from "../observation.js";
import { withNoArgumentPromptObservation } from "./observation.js";

/** Register guided routine-planning prompts. */
export function registerRoutinePrompts(
	server: McpServer,
	observer?: ToolObserver,
) {
	server.registerPrompt(
		"create-routine-from-goals",
		{
			title: "Create Routine From Goals",
			description:
				"Design and create one Hevy routine through a goal-based interview.",
		},
		withNoArgumentPromptObservation(
			"create-routine-from-goals",
			observer,
			() => ({
				messages: [
					{
						role: "user",
						content: {
							type: "text",
							text: [
								"Help me design and create exactly one new Hevy routine.",
								"First ask one concise group of questions covering: the routine's role in my week, primary goal, training experience, intended frequency, session-length limit, available equipment, priority muscles or movements, exercises I prefer or dislike, and injuries or other limitations.",
								"After I answer, call get-training-summary for the last four weeks and browse existing routines with get-routines. Use recent training only to calibrate the proposal and avoid accidental duplication; ignore body measurements for routine design.",
								"Choose candidate movements, then resolve every one to an existing Hevy exercise template. Use search-exercise-templates when a movement name is known and get-exercise-templates for open-ended browsing. Never guess an exerciseTemplateId.",
								"If several templates plausibly match, ask me to choose. If none match, offer existing substitutes; do not create a custom exercise template unless I explicitly request it.",
								"Propose one routine with a title, optional existing folder, ordered exercises, set types, fixed target reps, restSeconds, and useful notes. Default to normal sets and omit prescribed weights unless I provided them.",
								"If I request rep ranges, explain before approval that non-fixed rep ranges may not display correctly in Hevy apps.",
								"Show the complete proposed routine, the evidence or preferences behind it, and all assumptions. Ask for explicit approval and revise the preview until approved.",
								"Only after approval, call create-routine exactly once. Do not create folders or custom exercises implicitly, and do not automatically retry an uncertain create result.",
								"If I describe pain, injury, or a medical limitation, avoid diagnosis or rehabilitation advice and recommend appropriate professional guidance where needed.",
							].join("\n"),
						},
					},
				],
			}),
		),
	);
}
