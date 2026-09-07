/**
 * Safe CLI validation helper (manual, not a validation lane).
 *
 * Default (`pnpm run test:cli:safe`) is deterministic and makes no live
 * Hevy calls: it uses a fake key and only exercises `--help`, auth, and
 * argument/`--data` validation paths that fail before any network request.
 * It never runs a valid mutation with `--yes`.
 *
 * Opt-in live read-only checks:
 * `HEVY_RUN_CLI_SAFE_LIVE=1 pnpm run test:cli:safe` loads `.env` (fail
 * closed on malformed input), requires `HEVY_API_KEY`, and runs a bounded
 * set of read-only commands. Live mode still never runs a valid mutation
 * with `--yes`.
 *
 * The CLI intentionally returns exit 0 with a null payload for documented
 * `not_found` reads and an empty page for `end_of_list` pagination; this
 * script asserts that contract so changes to it are conscious.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadOptionalEnvFile } from "./load-optional-env.mjs";
import { isString } from "./runtime-value-predicates.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = resolve(root, "packages/cli/dist/cli.mjs");
if (!existsSync(cli)) {
	console.error(
		"Missing packages/cli/dist/cli.mjs; run pnpm --filter @chrisdoc/hevy-cli run build first.",
	);
	process.exit(1);
}

const FAKE_KEY = "cli-safe-validation-fake-key-0000";
const LIVE_FLAG = "HEVY_RUN_CLI_SAFE_LIVE";
const TIMEOUT_MS = 60_000;

let pass = 0;
let fail = 0;
const failures = [];

function report(name, ok, detail = "") {
	if (ok) {
		pass += 1;
		console.log(`PASS ${name}`);
		return;
	}
	fail += 1;
	failures.push(name);
	console.log(`FAIL ${name}${detail ? ` ${detail}` : ""}`);
}

function runCli(argv, env) {
	const result = spawnSync(process.execPath, [cli, ...argv], {
		cwd: root,
		env,
		encoding: "utf8",
		timeout: TIMEOUT_MS,
	});
	return {
		status: result.status ?? 1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		signal: result.signal ?? undefined,
	};
}

function envWithoutKey() {
	const env = { ...process.env };
	delete env.HEVY_API_KEY;
	return env;
}

function envWithFakeKey() {
	return { ...process.env, HEVY_API_KEY: FAKE_KEY };
}

function isJson(text) {
	try {
		JSON.parse(text);
		return true;
	} catch {
		return false;
	}
}

function expectExit(name, argv, env, expected) {
	const result = runCli(argv, env);
	report(
		name,
		result.status === expected,
		`exit got=${result.status} want=${expected} err=${result.stderr.slice(0, 160)}`,
	);
	return result;
}

function expectUsage(name, argv, env, snippet) {
	const result = runCli(argv, env);
	const ok =
		result.status === 2 &&
		result.stdout === "" &&
		result.stderr.includes(snippet) &&
		!result.stderr.includes(FAKE_KEY);
	report(name, ok, `exit=${result.status} err=${result.stderr.slice(0, 160)}`);
	return result;
}

function expectUsageJson(name, argv, env, snippet) {
	const result = runCli(argv, env);
	const ok =
		result.status === 2 &&
		result.stdout === "" &&
		isJson(result.stderr) &&
		result.stderr.includes(snippet);
	report(name, ok, `exit=${result.status} err=${result.stderr.slice(0, 160)}`);
	return result;
}

// ----- Default deterministic checks (fake key, no network) -----
console.log("== meta (no key) ==");
{
	const env = envWithoutKey();
	expectExit("version-nokey", ["--version"], env, 0);
	expectExit("help-nokey", ["--help"], env, 0);
	expectExit("alias-h", ["-h"], env, 0);
	expectExit("alias-v", ["-v"], env, 0);
}

console.log("== auth (no key) ==");
{
	const env = envWithoutKey();
	const human = runCli(["workouts", "count"], env);
	report(
		"missing-key-human",
		human.status === 1 &&
			human.stdout === "" &&
			human.stderr.includes("HEVY_API_KEY"),
		`exit=${human.status}`,
	);
	const json = runCli(["workouts", "count", "--json"], env);
	report(
		"missing-key-json",
		json.status === 1 &&
			json.stdout === "" &&
			isJson(json.stderr) &&
			json.stderr.includes('"code":1'),
		`exit=${json.status}`,
	);
}

console.log("== validation (fake key, no network) ==");
{
	const env = envWithFakeKey();
	const pagination = [
		["workouts", "list", "--page", "0", "--json"],
		["workouts", "list", "--page", "-1", "--json"],
		["workouts", "list", "--page", "1.5", "--json"],
		["workouts", "list", "--page", "nope", "--json"],
		["workouts", "list", "--page-size", "0", "--json"],
		["workouts", "list", "--page-size", "11", "--json"],
		["workouts", "list", "--page-size", "nope", "--json"],
		["routines", "list", "--page", "0", "--json"],
		["measurements", "list", "--page-size", "99", "--json"],
	];
	for (const argv of pagination) {
		expectUsage(
			`val:${argv.join(" ")}`,
			argv,
			env,
			"must be a positive integer",
		);
	}
	for (const weeks of ["0", "-1", "1.5", "nope", "521"]) {
		expectUsageJson(
			`weeks:${weeks}`,
			["summary", "--weeks", weeks, "--json"],
			env,
			"--weeks",
		);
	}
	for (const maxPages of ["0", "-1", "101", "nope"]) {
		expectUsageJson(
			`max-pages:${maxPages}`,
			["exercises", "search", "bench", "--max-pages", maxPages, "--json"],
			env,
			"--max-pages",
		);
	}
	expectUsageJson(
		"since-bad",
		["workouts", "events", "--since", "not-a-date", "--json"],
		env,
		"--since",
	);
	expectUsageJson(
		"history-start-bad",
		["exercises", "history", "79D0BB3A", "--start-date", "garbage", "--json"],
		env,
		"--start-date",
	);
	for (const id of ["a/b", "a?b", "a#b", "", "  ", "../etc"]) {
		expectUsage(
			`wid:${JSON.stringify(id)}`,
			["workouts", "get", id, "--json"],
			env,
			"Workout ID",
		);
	}
	for (const query of ["a/b", "a?b", "", "  "]) {
		expectUsage(
			`query:${JSON.stringify(query)}`,
			["exercises", "search", query, "--json"],
			env,
			"Search query",
		);
	}
	for (const date of ["not-a-date", "2026-13-40", "2023-02-29", ""]) {
		expectUsage(
			`mdate:${JSON.stringify(date)}`,
			["measurements", "get", date, "--json"],
			env,
			"Measurement date",
		);
	}
	expectUsage("wget-nopos", ["workouts", "get", "--json"], env, "arg1");
	expectUsage("search-nopos", ["exercises", "search", "--json"], env, "arg1");
	expectUsage(
		"unknown-sub",
		["workouts", "frobnicate", "--json"],
		env,
		"No command registered",
	);
	expectUsage(
		"unknown-flag",
		["workouts", "list", "--bogus-flag", "--json"],
		env,
		"--bogus-flag",
	);
	expectUsage(
		"case-sensitive",
		["WORKOUTS", "list", "--json"],
		env,
		"WORKOUTS",
	);
}

console.log("== mutation guards (fake key, never a live write) ==");
{
	const env = envWithFakeKey();
	const withoutYes = [
		[
			"folders",
			"create",
			"--data",
			'{"routine_folder":{"title":"X"}}',
			"--json",
		],
		["workouts", "create", "--data", "{}", "--json"],
		["routines", "create", "--data", "{}", "--json"],
		["exercises", "create", "--data", "{}", "--json"],
	];
	for (const argv of withoutYes) {
		expectUsage(
			`noyes:${argv.slice(0, 2).join(" ")}`,
			argv,
			env,
			"Mutation requires --yes",
		);
	}
	expectUsage(
		"mut-missing-data",
		["folders", "create", "--yes", "--json"],
		env,
		"--data",
	);
	expectUsageJson(
		"mut-bad-json",
		["folders", "create", "--data", "{", "--yes", "--json"],
		env,
		"must contain valid JSON",
	);
	expectUsageJson(
		"mut-wrong-envelope",
		["folders", "create", "--data", '{"name":"X"}', "--yes", "--json"],
		env,
		"routine_folder",
	);
	expectUsageJson(
		"mut-extra-key",
		[
			"folders",
			"create",
			"--data",
			'{"routine_folder":{"title":"X","extra":true}}',
			"--yes",
			"--json",
		],
		env,
		"extra",
	);
	expectUsage(
		"mut-at-empty",
		["folders", "create", "--data", "@", "--yes", "--json"],
		env,
		"source is required",
	);
	expectUsage(
		"mut-missing-file",
		[
			"folders",
			"create",
			"--data",
			"@/nonexistent-cli-safe.json",
			"--yes",
			"--json",
		],
		env,
		"Unable to read",
	);
	expectUsageJson(
		"mut-id-mismatch",
		[
			"workouts",
			"update",
			"workout-1",
			"--data",
			'{"workout_id":"other","workout":{"title":"T","start_time":"2024-01-01T10:00:00Z","end_time":"2024-01-01T11:00:00Z","exercises":[]}}',
			"--yes",
			"--json",
		],
		env,
		"does not match",
	);
}

console.log("== output contract (fake key) ==");
{
	const env = envWithFakeKey();
	const usage = runCli(["workouts", "list", "--page", "nope", "--json"], env);
	report(
		"json-err-contract",
		usage.status === 2 && usage.stdout === "" && isJson(usage.stderr),
		`exit=${usage.status}`,
	);
	const human = runCli(["workouts", "list", "--page", "nope"], env);
	report(
		"human-err-contract",
		human.status === 2 && human.stdout === "" && !human.stderr.includes("{"),
		`exit=${human.status}`,
	);
}

// ----- Opt-in bounded live read-only checks -----
if (process.env[LIVE_FLAG] === "1") {
	console.log("== live read-only (bounded, no mutations) ==");
	try {
		loadOptionalEnvFile();
	} catch (error) {
		console.error(
			error instanceof Error ? error.message : "Unable to load .env.",
		);
		process.exit(1);
	}
	const liveKey = process.env.HEVY_API_KEY?.trim();
	if (!liveKey) {
		console.error(
			`HEVY_API_KEY is required for ${LIVE_FLAG}=1; no live tests were started.`,
		);
		process.exit(1);
	}
	const liveEnv = { ...process.env, HEVY_API_KEY: liveKey };
	const leakFree = (text) => !text.includes(liveKey);

	const liveJson = (name, argv, snippet) => {
		const result = runCli(argv, liveEnv);
		const ok =
			result.status === 0 &&
			isJson(result.stdout) &&
			result.stdout.includes(snippet) &&
			result.stderr === "" &&
			leakFree(result.stdout + result.stderr);
		report(
			name,
			ok,
			`exit=${result.status} out=${result.stdout.slice(0, 120)}`,
		);
		try {
			return JSON.parse(result.stdout);
		} catch {
			return undefined;
		}
	};

	liveJson("live-count", ["workouts", "count", "--json"], "workout_count");
	liveJson("live-user", ["user", "--json"], "data");
	const workouts = liveJson(
		"live-workouts-list",
		["workouts", "list", "--page-size", "1", "--json"],
		"workouts",
	);
	liveJson(
		"live-routines-list",
		["routines", "list", "--page-size", "1", "--json"],
		"routines",
	);
	liveJson(
		"live-measurements-list",
		["measurements", "list", "--page-size", "1", "--json"],
		"body_measurements",
	);
	liveJson(
		"live-summary",
		["summary", "--weeks", "1", "--json"],
		"workout_count",
	);
	liveJson(
		"live-events",
		["workouts", "events", "--page-size", "1", "--json"],
		"events",
	);
	liveJson(
		"live-search",
		["exercises", "search", "bench", "--max-pages", "1", "--json"],
		"matches",
	);

	const firstWorkoutId = workouts?.workouts?.[0]?.id;
	if (isString(firstWorkoutId) && firstWorkoutId.length > 0) {
		liveJson(
			"live-workout-get",
			["workouts", "get", firstWorkoutId, "--json"],
			firstWorkoutId,
		);
	} else {
		console.log("SKIP live-workout-get (no workouts)");
	}

	// Documented absence contract: missing members succeed with null.
	const missing = runCli(
		["workouts", "get", "00000000-0000-0000-0000-000000000000", "--json"],
		liveEnv,
	);
	report(
		"live-missing-is-null-success",
		missing.status === 0 &&
			isJson(missing.stdout) &&
			missing.stdout.includes("not_found") &&
			leakFree(missing.stdout + missing.stderr),
		`exit=${missing.status}`,
	);
	const oob = runCli(
		["workouts", "list", "--page", "9999", "--page-size", "10", "--json"],
		liveEnv,
	);
	report(
		"live-oob-page-is-empty-success",
		oob.status === 0 &&
			isJson(oob.stdout) &&
			oob.stdout.includes('"workouts":[]') &&
			leakFree(oob.stdout + oob.stderr),
		`exit=${oob.status}`,
	);
} else {
	console.log(
		`SKIP live read-only (set ${LIVE_FLAG}=1 with HEVY_API_KEY to enable)`,
	);
}

console.log(`\nCLI safe validation: PASS=${pass} FAIL=${fail}`);
if (failures.length > 0) {
	console.error(`Failures: ${failures.join(", ")}`);
}
process.exit(fail === 0 ? 0 : 1);
