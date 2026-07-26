import {
	buildApplication,
	buildCommand,
	generateHelpTextForAllCommands,
	run,
} from "@stricli/core";

export interface CliArgs {
	command?: string;
	subcommand?: string;
	positionals: string[];
	options: Record<string, string | boolean>;
}

export class UsageError extends Error {}

type ParserFlags = {
	json?: boolean;
	page?: string;
	"page-size"?: string;
	since?: string;
	weeks?: string;
	"start-date"?: string;
	"end-date"?: string;
};

let parsedArguments: CliArgs | undefined;

const parserCommand = buildCommand({
	func: (flags: ParserFlags, ...positionals: string[]) => {
		const options: Record<string, string | boolean> = {};
		for (const [name, value] of Object.entries(flags)) {
			if (value !== undefined) options[name] = value;
		}
		parsedArguments = {
			command: positionals[0],
			subcommand: positionals[1],
			positionals: positionals.slice(2),
			options,
		};
	},
	parameters: {
		flags: {
			json: {
				brief: "Print machine-readable JSON",
				kind: "boolean",
				optional: true,
			},
			page: {
				brief: "API page number",
				kind: "parsed",
				parse: String,
				optional: true,
			},
			"page-size": {
				brief: "Number of results per page",
				kind: "parsed",
				parse: String,
				optional: true,
			},
			since: {
				brief: "Return events since this ISO timestamp",
				kind: "parsed",
				parse: String,
				optional: true,
			},
			weeks: {
				brief: "Number of weeks for the summary",
				kind: "parsed",
				parse: String,
				optional: true,
			},
			"start-date": {
				brief: "Exercise history start date",
				kind: "parsed",
				parse: String,
				optional: true,
			},
			"end-date": {
				brief: "Exercise history end date",
				kind: "parsed",
				parse: String,
				optional: true,
			},
		},
		positional: {
			kind: "array",
			parameter: {
				brief: "Command and command arguments",
				parse: String,
			},
		},
	},
	docs: {
		brief: "Run read-only commands against the Hevy API",
	},
});

const parserApplication = buildApplication(parserCommand, {
	name: "hevy",
	versionInfo: { currentVersion: "0.0.0" },
});

export const HELP = `${generateHelpTextForAllCommands(parserApplication)[0]?.[1] ?? "hevy [command] [options]"}

Commands (read-only):
  user
  workouts list|get <id>|count|events
  routines list|get <id>
  exercises search <query>|get <id>|history <id>
  measurements list|get <YYYY-MM-DD>
  summary --weeks N

Authentication uses HEVY_API_KEY only. No mutation commands are available.
`;

export async function parseArguments(argv: string[]): Promise<CliArgs> {
	parsedArguments = undefined;
	const process = {
		stdout: { write: (_text: string) => undefined },
		stderr: { write: (_text: string) => undefined },
	};
	await run(parserApplication, argv, { process });
	if (parsedArguments) return parsedArguments;
	if (argv.includes("--help") || argv.includes("-h")) {
		return { positionals: [], options: { help: true } };
	}
	if (argv.includes("--version") || argv.includes("-v")) {
		return { positionals: [], options: { version: true } };
	}
	throw new UsageError("Unable to parse command-line arguments");
}

export function option(args: CliArgs, name: string): string | undefined {
	const value = args.options[name];
	return typeof value === "string" ? value : undefined;
}

export function positiveInt(
	args: CliArgs,
	name: string,
	fallback: number,
	max?: number,
): number {
	const raw = option(args, name);
	if (raw === undefined) return fallback;
	if (
		!/^[0-9]+$/.test(raw) ||
		Number(raw) < 1 ||
		(max !== undefined && Number(raw) > max)
	) {
		throw new UsageError(
			`--${name} must be a positive integer${max ? ` no greater than ${max}` : ""}`,
		);
	}
	return Number(raw);
}

export function requiredId(value: string | undefined, label: string): string {
	if (!value || !value.trim() || value.includes("/") || value.includes("?"))
		throw new UsageError(`${label} is required`);
	return value;
}

export function iso(
	value: string | undefined,
	label: string,
	dateOnly = false,
): string | undefined {
	if (value === undefined) return undefined;
	if (dateOnly && !/^\d{4}-\d{2}-\d{2}$/.test(value))
		throw new UsageError(`${label} must be an ISO date`);
	if (Number.isNaN(Date.parse(value)))
		throw new UsageError(`${label} must be an ISO timestamp`);
	return value;
}
