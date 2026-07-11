export type ToolRegistrationGroup =
	| "workouts"
	| "routines"
	| "templates"
	| "folders"
	| "body-measurements"
	| "user";

export type ToolContractCategory =
	| "metadata"
	| "input-validation"
	| "success"
	| "empty-or-null"
	| "upstream-errors"
	| "text-structured-parity"
	| "non-retry";

export interface ToolContractInventoryItem {
	readonly name: string;
	readonly kind: "read" | "mutation";
	readonly group: ToolRegistrationGroup;
	readonly structuredOutput: boolean;
	readonly annotations: "read" | "create" | "update";
	readonly contractCategories: readonly ToolContractCategory[];
}

const readContractCategories = [
	"metadata",
	"input-validation",
	"success",
	"empty-or-null",
	"upstream-errors",
	"text-structured-parity",
] as const satisfies readonly ToolContractCategory[];

const mutationContractCategories = [
	"metadata",
	"input-validation",
	"success",
	"upstream-errors",
	"non-retry",
] as const satisfies readonly ToolContractCategory[];

const read = <
	const Name extends string,
	const Group extends ToolRegistrationGroup,
>(
	name: Name,
	group: Group,
) =>
	({
		name,
		kind: "read",
		group,
		structuredOutput: true,
		annotations: "read",
		contractCategories: readContractCategories,
	}) satisfies ToolContractInventoryItem;

const create = <
	const Name extends string,
	const Group extends ToolRegistrationGroup,
>(
	name: Name,
	group: Group,
) =>
	({
		name,
		kind: "mutation",
		group,
		structuredOutput: false,
		annotations: "create",
		contractCategories: mutationContractCategories,
	}) satisfies ToolContractInventoryItem;

const update = <
	const Name extends string,
	const Group extends ToolRegistrationGroup,
>(
	name: Name,
	group: Group,
) =>
	({
		name,
		kind: "mutation",
		group,
		structuredOutput: false,
		annotations: "update",
		contractCategories: mutationContractCategories,
	}) satisfies ToolContractInventoryItem;

export const MCP_TOOL_CONTRACTS = [
	read("get-workouts", "workouts"),
	read("get-workout", "workouts"),
	read("get-workout-count", "workouts"),
	read("get-workout-events", "workouts"),
	create("create-workout", "workouts"),
	update("update-workout", "workouts"),
	read("get-routines", "routines"),
	read("get-routine", "routines"),
	create("create-routine", "routines"),
	update("update-routine", "routines"),
	read("get-exercise-templates", "templates"),
	read("get-exercise-template", "templates"),
	read("get-exercise-history", "templates"),
	create("create-exercise-template", "templates"),
	read("search-exercise-templates", "templates"),
	read("get-routine-folders", "folders"),
	read("get-routine-folder", "folders"),
	create("create-routine-folder", "folders"),
	read("get-body-measurements", "body-measurements"),
	read("get-body-measurement", "body-measurements"),
	create("create-body-measurement", "body-measurements"),
	update("update-body-measurement", "body-measurements"),
	read("get-user-info", "user"),
] as const satisfies readonly ToolContractInventoryItem[];

export const EXPECTED_MCP_TOOL_COUNT = 23;

export interface PromptContractArgument {
	readonly name: string;
	readonly description: string;
	readonly required: boolean;
}

export interface PromptContractInventoryItem {
	readonly name: string;
	readonly title: string;
	readonly description: string;
	readonly arguments: readonly PromptContractArgument[];
	readonly group: "workouts";
	readonly contractCategories: readonly [
		"metadata",
		"input-validation",
		"success",
	];
}

export const MCP_PROMPT_CONTRACTS = [
	{
		name: "analyze-workout-progress",
		title: "Analyze Workout Progress",
		description: "Analyze recent workout and body-measurement trends.",
		arguments: [
			{
				name: "weeks",
				description: "Number of recent weeks to analyze (1-12).",
				required: false,
			},
		],
		group: "workouts",
		contractCategories: ["metadata", "input-validation", "success"],
	},
	{
		name: "create-workout-from-routine",
		title: "Create Workout From Routine",
		description: "Create a completed workout from an existing routine.",
		arguments: [
			{
				name: "routineId",
				description: "Routine ID to use as a guide.",
				required: true,
			},
			{
				name: "startTime",
				description: "Workout start time in UTC as YYYY-MM-DDTHH:mm:ssZ.",
				required: true,
			},
		],
		group: "workouts",
		contractCategories: ["metadata", "input-validation", "success"],
	},
] as const satisfies readonly PromptContractInventoryItem[];

export const EXPECTED_MCP_PROMPT_COUNT = 2;

export interface ResourceContractInventoryItem {
	readonly uri: `hevy://${string}`;
	readonly name: string;
	readonly description: string;
	readonly mimeType: "application/json";
	readonly group: "hevy";
	readonly contractCategories: readonly [
		"metadata",
		"success",
		"upstream-errors",
	];
}

export const MCP_RESOURCE_CONTRACTS = [
	{
		uri: "hevy://user",
		name: "user-profile",
		description: "Authenticated Hevy user profile",
		mimeType: "application/json",
		group: "hevy",
		contractCategories: ["metadata", "success", "upstream-errors"],
	},
	{
		uri: "hevy://workout-count",
		name: "workout-count",
		description: "Total number of workouts in the Hevy account",
		mimeType: "application/json",
		group: "hevy",
		contractCategories: ["metadata", "success", "upstream-errors"],
	},
	{
		uri: "hevy://exercise-templates",
		name: "exercise-templates",
		description: "Full formatted Hevy exercise template catalog",
		mimeType: "application/json",
		group: "hevy",
		contractCategories: ["metadata", "success", "upstream-errors"],
	},
	{
		uri: "hevy://routine-folders",
		name: "routine-folders",
		description: "Full formatted list of Hevy routine folders",
		mimeType: "application/json",
		group: "hevy",
		contractCategories: ["metadata", "success", "upstream-errors"],
	},
] as const satisfies readonly ResourceContractInventoryItem[];

export const EXPECTED_MCP_RESOURCE_COUNT = 4;
