export interface CliArgs {
	command?: string;
	subcommand?: string;
	positionals: string[];
	options: Record<string, string | boolean>;
}

export class UsageError extends Error {}

const allowed = new Set([
	"help",
	"version",
	"json",
	"page",
	"page-size",
	"since",
	"weeks",
	"start-date",
	"end-date",
]);

export function parseArguments(argv: string[]): CliArgs {
	const positionals: string[] = [];
	const options: Record<string, string | boolean> = {};
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (!token) continue;
		if (token === "--") {
			positionals.push(...argv.slice(i + 1));
			break;
		}
		if (token.startsWith("--")) {
			const raw = token.slice(2);
			const equals = raw.indexOf("=");
			const name = equals < 0 ? raw : raw.slice(0, equals);
			if (name.includes("api") || name.includes("key") || name === "url") {
				throw new UsageError(
					"API keys and URLs are accepted only through HEVY_API_KEY",
				);
			}
			if (!allowed.has(name)) throw new UsageError(`Unknown option: --${name}`);
			if (name === "help" || name === "version" || name === "json") {
				if (equals >= 0)
					throw new UsageError(`Option --${name} does not take a value`);
				options[name] = true;
				continue;
			}
			const value = equals >= 0 ? raw.slice(equals + 1) : argv[++i];
			if (!value || value.startsWith("--"))
				throw new UsageError(`Option --${name} requires a value`);
			options[name] = value;
			continue;
		}
		if (token.startsWith("-")) throw new UsageError(`Unknown option: ${token}`);
		positionals.push(token);
	}
	return {
		command: positionals[0],
		subcommand: positionals[1],
		positionals: positionals.slice(2),
		options,
	};
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
		!/^\d+$/.test(raw) ||
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

export const HELP = `hevy <command> [options]

Commands (read-only):
  user
  workouts list|get <id>|count|events [--page N --page-size N --since ISO]
  routines list|get <id> [--page N --page-size N]
  exercises search <query>|get <id>|history <id> [--start-date ISO --end-date ISO]
  measurements list|get <YYYY-MM-DD> [--page N --page-size N]
  summary --weeks N

Options: --json, --page, --page-size, --since, --weeks, --start-date, --end-date
Authentication uses HEVY_API_KEY only. No mutation commands are available.
`;
