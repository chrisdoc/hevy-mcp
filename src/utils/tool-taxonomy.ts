export const HEVY_TOOL_FEATURES = [
	"workouts",
	"routines",
	"templates",
	"measurements",
	"folders",
	"profile",
	"workflows",
] as const;

export type HevyToolFeature = (typeof HEVY_TOOL_FEATURES)[number];

export const MCP_TOOL_KINDS = ["read", "write"] as const;
export type McpToolKind = (typeof MCP_TOOL_KINDS)[number];

export const MCP_TOOL_OPERATIONS = [
	"list",
	"get",
	"search",
	"create",
	"update",
	"count",
	"sync",
] as const;

export type McpToolOperation = (typeof MCP_TOOL_OPERATIONS)[number];

export type ToolTelemetryMetadata = {
	readonly feature: HevyToolFeature;
	readonly kind: McpToolKind;
	readonly operation: McpToolOperation;
};
