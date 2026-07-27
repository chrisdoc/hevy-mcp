import {
	buildApplication,
	buildCommand,
	buildRouteMap,
	help,
	version,
	type Command,
	type CommandContext,
	type FlagParametersForType,
	type StricliProcess,
	run,
} from "@stricli/core";
import type { HevyClient } from "@hevy-mcp/hevy-client";
import { execute } from "./commands/index.js";
import type { CliArgs } from "./arguments.js";
import type { DataSourceReader } from "./input.js";

declare const __HEVY_CLI_VERSION__: string;
const cliVersion =
	typeof __HEVY_CLI_VERSION__ === "string" ? __HEVY_CLI_VERSION__ : "0.0.0";

export interface CliRuntimeContext extends CommandContext {
	readonly process: StricliProcess;
	client?: HevyClient;
	now: () => Date;
	readDataSource: DataSourceReader;
	state: {
		result?: unknown;
		error?: unknown;
	};
}

type CliFlags = object;
type JsonFlags = { json?: boolean };
type SearchFlags = JsonFlags & { "max-pages"?: string };
type PageFlags = JsonFlags & { page?: string; "page-size"?: string };
type EventFlags = PageFlags & { since?: string };
type HistoryFlags = JsonFlags & { "start-date"?: string; "end-date"?: string };
type SummaryFlags = JsonFlags & { weeks?: string };
type MutationFlags = JsonFlags & { data: string; yes?: boolean };

const flag = (brief: string) => ({
	brief,
	kind: "parsed" as const,
	parse: String,
	optional: true as const,
});

const requiredFlag = (brief: string) => ({
	brief,
	kind: "parsed" as const,
	parse: String,
	optional: false as const,
});
const booleanFlag = (brief: string) => ({
	brief,
	kind: "boolean" as const,
	optional: true as const,
});

const jsonFlag = { json: booleanFlag("Print machine-readable JSON") };
const mutationFlags = {
	...jsonFlag,
	data: requiredFlag("JSON mutation data, inline or @path or @-"),
	yes: booleanFlag("Confirm this mutation"),
};
const searchFlags = {
	...jsonFlag,
	"max-pages": flag("Maximum API pages to scan (default: 10)"),
};
const pageFlags = {
	...jsonFlag,
	page: flag("API page number"),
	"page-size": flag("Number of results per page"),
};
const eventFlags = {
	...pageFlags,
	since: flag("Return events since this ISO timestamp"),
};
const historyFlags = {
	...jsonFlag,
	"start-date": flag("Exercise history start date"),
	"end-date": flag("Exercise history end date"),
};
const summaryFlags = {
	...jsonFlag,
	weeks: flag("Number of weeks for the summary"),
};

function toArgs(
	command: string,
	subcommand: string | undefined,
	flags: object,
	positionals: string[],
): CliArgs {
	const options: Record<string, string | boolean> = {};
	for (const [name, value] of Object.entries(flags)) {
		if (typeof value === "string" || typeof value === "boolean")
			options[name] = value;
	}
	return { command, subcommand, positionals, options };
}

async function invoke(
	context: CliRuntimeContext,
	command: string,
	subcommand: string | undefined,
	flags: CliFlags,
	positionals: string[],
): Promise<void> {
	try {
		if (!context.client) {
			throw new Error("Hevy API client is not configured");
		}
		context.state.result = await execute(
			toArgs(command, subcommand, flags, positionals),
			context.client,
			context.now,
			context.readDataSource,
		);
	} catch (error) {
		context.state.error = error;
	}
}

function noArgsCommand<FLAGS extends object>(
	command: string,
	subcommand: string | undefined,
	brief: string,
	flags: FlagParametersForType<FLAGS, CliRuntimeContext>,
): Command<CliRuntimeContext> {
	return buildCommand<FLAGS, [], CliRuntimeContext>({
		func: function (this: CliRuntimeContext, values: FLAGS) {
			return invoke(this, command, subcommand, values, []);
		},
		parameters: { flags },
		docs: { brief },
	});
}

function idCommand<FLAGS extends object>(
	command: string,
	subcommand: string,
	brief: string,
	flags: FlagParametersForType<FLAGS, CliRuntimeContext>,
	positionalBrief = "Resource identifier",
): Command<CliRuntimeContext> {
	return buildCommand<FLAGS, [string], CliRuntimeContext>({
		func: function (this: CliRuntimeContext, values: FLAGS, id: string) {
			return invoke(this, command, subcommand, values, [id]);
		},
		parameters: {
			flags,
			positional: {
				kind: "tuple",
				parameters: [{ brief: positionalBrief, parse: String }],
			},
		},
		docs: { brief },
	});
}

const workouts = buildRouteMap({
	routes: {
		list: noArgsCommand<PageFlags>(
			"workouts",
			"list",
			"List workouts",
			pageFlags,
		),
		create: noArgsCommand<MutationFlags>(
			"workouts",
			"create",
			"Create a workout",
			mutationFlags,
		),
		update: idCommand<MutationFlags>(
			"workouts",
			"update",
			"Replace a workout",
			mutationFlags,
		),
		get: idCommand<JsonFlags>("workouts", "get", "Get a workout", jsonFlag),
		count: noArgsCommand<JsonFlags>(
			"workouts",
			"count",
			"Count workouts",
			jsonFlag,
		),
		events: noArgsCommand<EventFlags>(
			"workouts",
			"events",
			"List workout events",
			eventFlags,
		),
	},
	docs: { brief: "Read workout data" },
});

const routines = buildRouteMap({
	routes: {
		list: noArgsCommand<PageFlags>(
			"routines",
			"list",
			"List routines",
			pageFlags,
		),
		create: noArgsCommand<MutationFlags>(
			"routines",
			"create",
			"Create a routine",
			mutationFlags,
		),
		update: idCommand<MutationFlags>(
			"routines",
			"update",
			"Replace a routine",
			mutationFlags,
		),
		get: idCommand<JsonFlags>("routines", "get", "Get a routine", jsonFlag),
	},
	docs: { brief: "Read routine data" },
});

const exercises = buildRouteMap({
	routes: {
		create: noArgsCommand<MutationFlags>(
			"exercises",
			"create",
			"Create an exercise template",
			mutationFlags,
		),
		search: idCommand<SearchFlags>(
			"exercises",
			"search",
			"Search exercise templates",
			searchFlags,
		),
		get: idCommand<JsonFlags>(
			"exercises",
			"get",
			"Get an exercise template",
			jsonFlag,
		),
		history: idCommand<HistoryFlags>(
			"exercises",
			"history",
			"Get exercise history",
			historyFlags,
		),
	},
	docs: { brief: "Read exercise data" },
});

const measurements = buildRouteMap({
	routes: {
		list: noArgsCommand<PageFlags>(
			"measurements",
			"list",
			"List body measurements",
			pageFlags,
		),
		get: idCommand<JsonFlags>(
			"measurements",
			"get",
			"Get a body measurement",
			jsonFlag,
		),
		create: idCommand<MutationFlags>(
			"measurements",
			"create",
			"Create a body measurement",
			mutationFlags,
			"Measurement date (YYYY-MM-DD)",
		),
		update: idCommand<MutationFlags>(
			"measurements",
			"update",
			"Update a body measurement",
			mutationFlags,
			"Measurement date (YYYY-MM-DD)",
		),
	},
	docs: { brief: "Read body measurements" },
});

const folders = buildRouteMap({
	routes: {
		create: noArgsCommand<MutationFlags>(
			"folders",
			"create",
			"Create a routine folder",
			mutationFlags,
		),
	},
	docs: { brief: "Create routine folders" },
});

const root = buildRouteMap({
	routes: {
		user: noArgsCommand<JsonFlags>(
			"user",
			undefined,
			"Get user information",
			jsonFlag,
		),
		workouts,
		routines,
		exercises,
		measurements,
		folders,
		summary: noArgsCommand<SummaryFlags>(
			"summary",
			undefined,
			"Summarize recent workouts",
			summaryFlags,
		),
	},
	docs: {
		brief: "Run read, create, and update Hevy data commands",
	},
});

const helpFormatting = {
	useAliasInUsageLine: false,
	onlyRequiredInUsageLine: false,
	caseStyle: "original" as const,
};

export const app = buildApplication(
	root,
	{ name: "hevy" },
	{
		help: help({
			brief: "Print help information and exit",
			alias: "h",
			defaultForRouteMap: true,
			includeHidden: false,
			formatting: helpFormatting,
		}),
		helpAll: help({
			brief: "Print all help information and exit",
			alias: "H",
			hidden: true,
			defaultForRouteMap: false,
			includeHidden: true,
			formatting: helpFormatting,
		}),
		version: version({
			brief: "Print the current version of the application",
			alias: "v",
			info: { currentVersion: cliVersion },
		}),
	},
);

export async function runRoutes(
	argv: string[],
	context: CliRuntimeContext,
): Promise<number> {
	await run(app, argv, context);
	return context.process.exitCode === undefined ||
		context.process.exitCode === null
		? 0
		: Number(context.process.exitCode);
}
