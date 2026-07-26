export interface CliArgs {
	command?: string;
	subcommand?: string;
	positionals: string[];
	options: Record<string, string | boolean>;
}

export class UsageError extends Error {}

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
