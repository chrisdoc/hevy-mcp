import { z } from "zod";

declare const __HEVY_MCP_NAME__: string | undefined;
declare const __HEVY_MCP_VERSION__: string | undefined;

const buildString = z.string().optional();

function readBuildString(value: string | undefined, fallback: string): string {
	return buildString.parse(value) ?? fallback;
}

function readBuildGlobal(value: () => string | undefined): string | undefined {
	try {
		return value();
	} catch {
		return undefined;
	}
}

const buildName = readBuildGlobal(() => __HEVY_MCP_NAME__);
const buildVersion = readBuildGlobal(() => __HEVY_MCP_VERSION__);

export const SERVER_NAME = readBuildString(buildName, "hevy-mcp");
export const SERVER_VERSION = readBuildString(buildVersion, "dev");

export const SERVER_INSTRUCTIONS = [
	"Hevy MCP connects clients to the authenticated user's Hevy workout-tracking data, including workouts, routines, exercise templates, routine folders, body measurements, and profile information. HEVY_API_KEY must contain a valid Hevy API key for local stdio use.",
	"Safety: all get-* and search-* tools are read-only. create-* and update-* tools mutate Hevy data. Creates are additive and non-idempotent, so repeating one can create duplicates. Updates can overwrite existing data. Delete operations are not available.",
	"Workflow: search exercise templates first, then use the returned template IDs when creating workouts or routines. To create a completed workout from a routine, fetch the routine as a plan, then obtain the actual completed sets and end time from the user; never invent completion data.",
	'Tool protocol: always call the exact tool name and pass inputs in the tools/call arguments object. Never append parameters to a tool name (for example, call get-workout with {"workout_id": "<id>"}, not get-workout-workoutId=<id>). The canonical discovery tools are get-workout, get-exercise-template, and get-routine-folder; get-workouts, search-exercise-templates, and the hevy://exercise-templates and hevy://routine-folders resources discover records. get-user-info is not an MCP tool; use the hevy://user resource.',
	"Resources: use hevy://user, hevy://workout-count, hevy://exercise-templates, and hevy://routine-folders for complete cached datasets that do not require parameters. Use search-exercise-templates when you need title or muscle-group filtering.",
	"Pagination: start at page 1 and fetch only the pages needed. List tools that remain available use bounded page sizes.",
	"Rate limits and retries: minimize repeated calls. If Hevy returns HTTP 429, follow its retry guidance. Transient read requests retry automatically, but write requests do not; confirm uncertain write outcomes before trying again.",
].join("\n\n");
