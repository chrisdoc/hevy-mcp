import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const ENV_ENTRY_PATTERN = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/**
 * Load the optional dotenv file for a lane without replacing explicit
 * process environment values.
 *
 * Native `--env-file-if-exists` is intentionally not used as the only
 * boundary here: it does not provide a useful failure signal for malformed
 * input. A lane must fail closed instead of silently falling back to another
 * environment.
 */
export function loadOptionalEnvFile(path = ".env") {
	let source;
	try {
		source = readFileSync(path, "utf8");
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT")
			return;
		throw new Error(`Unable to read ${path}.`);
	}

	for (const line of source.split(/\r?\n/u)) {
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#")) continue;
		const match = ENV_ENTRY_PATTERN.exec(line);
		if (match === null) {
			throw new Error(`Malformed ${path}.`);
		}
		const value = match[2].trim();
		if (
			(value.startsWith('"') && !value.endsWith('"')) ||
			(value.startsWith("'") && !value.endsWith("'"))
		) {
			throw new Error(`Malformed ${path}.`);
		}
	}

	let entries;
	try {
		entries = parseEnv(source);
	} catch {
		throw new Error(`Malformed ${path}.`);
	}

	for (const [name, value] of Object.entries(entries)) {
		if (process.env[name] === undefined) process.env[name] = value;
	}
}
