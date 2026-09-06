import { spawn, spawnSync } from "node:child_process";
import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const miseConfig = resolve(repositoryRoot, "mise.toml");
const miseDataDir =
	process.env.MISE_DATA_DIR ??
	resolve(process.env.HOME ?? "/tmp", ".local/share/mise");
const pnpmPath = spawnSync("mise", ["which", "pnpm"], {
	env: { ...process.env, MISE_AUTO_INSTALL: "false" },
	encoding: "utf8",
}).stdout.trim();
const packageManifest = JSON.parse(
	readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
) as {
	scripts: Record<string, string>;
};

type Fixture = {
	readonly directory: string;
	readonly marker: string;
	readonly cleanup: () => void;
};

interface ProcessResult {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

function runProcess(
	file: string,
	args: string[],
	options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<ProcessResult> {
	return new Promise((resolve, reject) => {
		const proc = spawn(file, args, { ...options, stdio: "pipe" });
		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		proc.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		proc.once("error", reject);
		proc.once("close", (status) => {
			resolve({ status, stdout, stderr });
		});
	});
}

function createFixture(scriptName: "test:integration" | "test:live"): Fixture {
	const directory = realpathSync(
		mkdtempSync(resolve(tmpdir(), "hevy-script-contract-")),
	);
	const marker = resolve(directory, "downstream.marker");
	const scriptsDirectory = resolve(directory, "scripts");
	const vitestDirectory = resolve(directory, "node_modules/vitest");
	symlinkSync(resolve(repositoryRoot, "scripts"), scriptsDirectory, "dir");
	mkdirSync(vitestDirectory, { recursive: true });
	writeFileSync(
		resolve(directory, "package.json"),
		JSON.stringify({
			private: true,
			type: "module",
			scripts: { [scriptName]: packageManifest.scripts[scriptName] },
		}),
	);
	writeFileSync(
		resolve(vitestDirectory, "vitest.mjs"),
		[
			"import { appendFileSync } from 'node:fs';",
			"appendFileSync(process.env.DOWNSTREAM_MARKER, JSON.stringify({",
			"  loaded: true,",
			"  keyPresent: Boolean(process.env.HEVY_API_KEY?.trim()),",
			"  keyMatches: Boolean(process.env.EXPECTED_KEY) && process.env.HEVY_API_KEY === process.env.EXPECTED_KEY,",
			"  cwdIsFixture: process.cwd() === process.env.FIXTURE_CWD,",
			"  homeIsFixture: process.env.HOME === process.env.FIXTURE_CWD,",
			"}) + '\\n');",
			"process.exit(Number(process.env.DOWNSTREAM_EXIT ?? '0'));",
		].join("\n"),
	);
	return {
		directory,
		marker,
		cleanup: () => rmSync(directory, { recursive: true, force: true }),
	};
}

function runPackageScript(
	fixture: Fixture,
	scriptName = "test:integration",
	env: Record<string, string | undefined> = {},
): Promise<ProcessResult> {
	const childEnv = {
		...process.env,
		...env,
		MISE_AUTO_INSTALL: "false",
		MISE_CONFIG_FILE: miseConfig,
		MISE_DATA_DIR: miseDataDir,
		npm_config_update_notifier: "false",
		HOME: fixture.directory,
		DOWNSTREAM_MARKER: fixture.marker,
		FIXTURE_CWD: fixture.directory,
	};
	delete childEnv.HEVY_API_KEY;
	if (env.HEVY_API_KEY !== undefined) childEnv.HEVY_API_KEY = env.HEVY_API_KEY;
	return runProcess(
		pnpmPath,
		[
			"--ignore-workspace",
			"--dir",
			fixture.directory,
			"run",
			"--silent",
			scriptName,
		],
		{ cwd: repositoryRoot, env: childEnv },
	);
}

function runIntegrationRunner(
	fixture: Fixture,
	env: Record<string, string | undefined> = {},
): Promise<ProcessResult> {
	const childEnv = {
		...process.env,
		...env,
		MISE_AUTO_INSTALL: "false",
		HOME: fixture.directory,
		DOWNSTREAM_MARKER: fixture.marker,
		FIXTURE_CWD: fixture.directory,
	};
	delete childEnv.HEVY_API_KEY;
	if (env.HEVY_API_KEY !== undefined) childEnv.HEVY_API_KEY = env.HEVY_API_KEY;
	return runProcess(
		process.execPath,
		[
			resolve(repositoryRoot, "scripts/run-integration-vitest.mjs"),
			"fixture.test.mjs",
		],
		{ cwd: fixture.directory, env: childEnv },
	);
}

function runLiveRunner(
	fixture: Fixture,
	env: Record<string, string | undefined> = {},
): Promise<ProcessResult> {
	const childEnv = {
		...process.env,
		...env,
		MISE_AUTO_INSTALL: "false",
		HOME: fixture.directory,
		DOWNSTREAM_MARKER: fixture.marker,
		FIXTURE_CWD: fixture.directory,
	};
	delete childEnv.HEVY_API_KEY;
	if (env.HEVY_API_KEY !== undefined) childEnv.HEVY_API_KEY = env.HEVY_API_KEY;
	return runProcess(
		process.execPath,
		[
			resolve(repositoryRoot, "scripts/run-live-vitest.mjs"),
			"HEVY_API_KEY",
			"fixture.test.mjs",
		],
		{ cwd: fixture.directory, env: childEnv },
	);
}

function markerRecords(fixture: Fixture) {
	try {
		return readFileSync(fixture.marker, "utf8")
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line) as Record<string, boolean>);
	} catch {
		return [];
	}
}

describe.concurrent("repository package scripts", () => {
	it("runs the production integration runner when credentials are absent from process and dotenv", async () => {
		const fixture = createFixture("test:integration");
		try {
			const absent = await runPackageScript(fixture);
			expect(absent.status).toBe(0);
			expect(markerRecords(fixture)).toEqual([
				{
					loaded: true,
					keyPresent: false,
					keyMatches: false,
					cwdIsFixture: true,
					homeIsFixture: true,
				},
			]);
		} finally {
			fixture.cleanup();
		}
	}, 15_000);

	it("loads integration credentials from dotenv when unset in the parent process", async () => {
		const fixture = createFixture("test:integration");
		try {
			writeFileSync(
				resolve(fixture.directory, ".env"),
				"HEVY_API_KEY=dotenv-fake\n",
			);
			const dotenvOnly = await runIntegrationRunner(fixture, {
				EXPECTED_KEY: "dotenv-fake",
			});
			expect(dotenvOnly.status).toBe(0);
			expect(markerRecords(fixture).at(-1)).toEqual({
				loaded: true,
				keyPresent: true,
				keyMatches: true,
				cwdIsFixture: true,
				homeIsFixture: true,
			});
		} finally {
			fixture.cleanup();
		}
	});

	it("prefers explicit integration credentials over dotenv", async () => {
		const fixture = createFixture("test:integration");
		try {
			writeFileSync(
				resolve(fixture.directory, ".env"),
				"HEVY_API_KEY=dotenv-fake\n",
			);
			const explicitWins = await runIntegrationRunner(fixture, {
				HEVY_API_KEY: "explicit-fake",
				EXPECTED_KEY: "explicit-fake",
			});
			expect(explicitWins.status).toBe(0);
			expect(markerRecords(fixture).at(-1)).toEqual({
				loaded: true,
				keyPresent: true,
				keyMatches: true,
				cwdIsFixture: true,
				homeIsFixture: true,
			});
		} finally {
			fixture.cleanup();
		}
	});

	it.each([
		["malformed", 'HEVY_API_KEY="unterminated\n'],
		["unreadable", undefined],
	] as const)(
		"fails closed for %s dotenv input",
		async (kind, contents) => {
			const fixture = createFixture("test:integration");
			try {
				const envPath = resolve(fixture.directory, ".env");
				if (kind === "malformed") {
					writeFileSync(envPath, contents);
				} else {
					mkdirSync(envPath);
				}
				const result = await runIntegrationRunner(fixture, {
					HEVY_API_KEY: "explicit-fake",
					EXPECTED_KEY: "explicit-fake",
				});
				expect(result.status).not.toBe(0);
				expect(markerRecords(fixture)).toEqual([]);
				expect(`${result.stdout}\n${result.stderr}`).not.toContain(
					"explicit-fake",
				);
			} finally {
				fixture.cleanup();
			}
		},
		15_000,
	);

	it("loads live credentials from dotenv when unset in the parent process", async () => {
		const fixture = createFixture("test:live");
		try {
			writeFileSync(
				resolve(fixture.directory, ".env"),
				"HEVY_API_KEY=dotenv-live-fake\n",
			);
			const dotenvOnly = await runLiveRunner(fixture, {
				EXPECTED_KEY: "dotenv-live-fake",
			});
			expect(dotenvOnly.status).toBe(0);
			expect(markerRecords(fixture).at(-1)).toEqual({
				loaded: true,
				keyPresent: true,
				keyMatches: true,
				cwdIsFixture: true,
				homeIsFixture: true,
			});
		} finally {
			fixture.cleanup();
		}
	});

	it("prefers explicit live credentials over dotenv", async () => {
		const fixture = createFixture("test:live");
		try {
			writeFileSync(
				resolve(fixture.directory, ".env"),
				"HEVY_API_KEY=dotenv-live-fake\n",
			);
			const explicitWins = await runLiveRunner(fixture, {
				HEVY_API_KEY: "explicit-live-fake",
				EXPECTED_KEY: "explicit-live-fake",
			});
			expect(explicitWins.status).toBe(0);
			expect(markerRecords(fixture).at(-1)).toEqual({
				loaded: true,
				keyPresent: true,
				keyMatches: true,
				cwdIsFixture: true,
				homeIsFixture: true,
			});
		} finally {
			fixture.cleanup();
		}
	});

	it("propagates downstream exit status from the live runner and does not leak credentials", async () => {
		const fixture = createFixture("test:live");
		try {
			const result = await runLiveRunner(fixture, {
				HEVY_API_KEY: "non-secret-fake",
				EXPECTED_KEY: "non-secret-fake",
				DOWNSTREAM_EXIT: "17",
			});
			expect(result.status).toBe(17);
			expect(markerRecords(fixture).at(-1)).toEqual({
				loaded: true,
				keyPresent: true,
				keyMatches: true,
				cwdIsFixture: true,
				homeIsFixture: true,
			});
			expect(`${result.stdout}\n${result.stderr}`).not.toContain(
				"non-secret-fake",
			);
		} finally {
			fixture.cleanup();
		}
	});

	it.each([
		["missing", {}],
		["empty", { HEVY_API_KEY: "" }],
		["whitespace", { HEVY_API_KEY: " \t\n" }],
	] as const)(
		"rejects %s live credentials before loading Vitest",
		async (_, env) => {
			const fixture = createFixture("test:live");
			try {
				const result = await runLiveRunner(fixture, env);
				expect(result.status).not.toBe(0);
				expect(markerRecords(fixture)).toEqual([]);
				expect(`${result.stdout}\n${result.stderr}`).toContain(
					"HEVY_API_KEY is required",
				);
			} finally {
				fixture.cleanup();
			}
		},
	);

	it.each([
		["empty", ""],
		["whitespace", " \t\n"],
	] as const)(
		"does not let %s explicit values fall back to dotenv",
		async (_, value) => {
			const fixture = createFixture("test:live");
			try {
				writeFileSync(
					resolve(fixture.directory, ".env"),
					"HEVY_API_KEY=dotenv-live-fake\n",
				);
				const result = await runLiveRunner(fixture, {
					HEVY_API_KEY: value,
				});
				expect(result.status).not.toBe(0);
				expect(markerRecords(fixture)).toEqual([]);
				expect(`${result.stdout}\n${result.stderr}`).toContain(
					"HEVY_API_KEY is required",
				);
			} finally {
				fixture.cleanup();
			}
		},
	);

	it.each([
		["malformed", 'HEVY_API_KEY="unterminated\n'],
		["unreadable", undefined],
	] as const)(
		"rejects a %s dotenv file before live Vitest",
		async (_, contents) => {
			const fixture = createFixture("test:live");
			try {
				const envPath = resolve(fixture.directory, ".env");
				if (contents === undefined) mkdirSync(envPath);
				else writeFileSync(envPath, contents);
				const result = await runLiveRunner(fixture, {
					HEVY_API_KEY: "non-secret-fake",
				});
				expect(result.status).not.toBe(0);
				expect(markerRecords(fixture)).toEqual([]);
			} finally {
				fixture.cleanup();
			}
		},
	);
});
