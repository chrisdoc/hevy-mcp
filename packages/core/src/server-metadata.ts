declare const __HEVY_MCP_NAME__: string | undefined;
declare const __HEVY_MCP_VERSION__: string | undefined;

export const SERVER_NAME =
	typeof __HEVY_MCP_NAME__ === "string" ? __HEVY_MCP_NAME__ : "hevy-mcp";
export const SERVER_VERSION =
	typeof __HEVY_MCP_VERSION__ === "string" ? __HEVY_MCP_VERSION__ : "dev";

export const SERVER_INSTRUCTIONS = [
	"Hevy MCP connects clients to the authenticated user's Hevy workout-tracking data, including workouts, routines, exercise templates, routine folders, body measurements, and profile information. HEVY_API_KEY must contain a valid Hevy API key for local stdio use.",
	"Safety: all get-* and search-* tools are read-only. create-* and update-* tools mutate Hevy data. Creates are additive and non-idempotent, so repeating one can create duplicates. Updates can overwrite existing data. Delete operations are not available.",
	"Workflow: search exercise templates first, then use the returned template IDs when creating workouts or routines. To create a completed workout from a routine, fetch the routine as a plan, then obtain the actual completed sets and end time from the user; never invent completion data.",
	"Resources: use hevy://user, hevy://workout-count, hevy://exercise-templates, and hevy://routine-folders for complete cached datasets that do not require parameters. Use search-exercise-templates when you need title or muscle-group filtering.",
	"Pagination: start at page 1 and fetch only the pages needed. List tools that remain available use bounded page sizes.",
	"Rate limits and retries: minimize repeated calls. If Hevy returns HTTP 429, follow its retry guidance. Transient read requests retry automatically, but write requests do not; confirm uncertain write outcomes before trying again.",
].join("\n\n");
