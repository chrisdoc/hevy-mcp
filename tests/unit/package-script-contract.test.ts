import { spawnSync } from "node:child_process";
import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
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

function createFixture(scriptName: "test:integration" | "test:live"): Fixture {
	const directory = mkdtempSync(resolve(tmpdir(), "hevy-script-contract-"));
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
) {
	const childEnv = {
		...process.env,
		...env,
		MISE_AUTO_INSTALL: "false",
		MISE_CONFIG_FILE: miseConfig,
		MISE_DATA_DIR: miseDataDir,
		HOME: fixture.directory,
		DOWNSTREAM_MARKER: fixture.marker,
		FIXTURE_CWD: fixture.directory,
	};
	delete childEnv.HEVY_API_KEY;
	if (env.HEVY_API_KEY !== undefined) childEnv.HEVY_API_KEY = env.HEVY_API_KEY;
	return spawnSync(
		"mise",
		[
			"exec",
			"--",
			pnpmPath,
			"--ignore-workspace",
			"--dir",
			fixture.directory,
			"run",
			"--silent",
			scriptName,
		],
		{ cwd: repositoryRoot, env: childEnv, encoding: "utf8" },
	);
}

function runLiveRunner(
	fixture: Fixture,
	env: Record<string, string | undefined> = {},
) {
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
	return spawnSync(
		process.execPath,
		[
			resolve(repositoryRoot, "scripts/run-live-vitest.mjs"),
			"HEVY_API_KEY",
			"fixture.test.mjs",
		],
		{ cwd: fixture.directory, env: childEnv, encoding: "utf8" },
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

describe("repository package scripts", () => {
	it("runs the production integration runner with isolated dotenv behavior", () => {
		const fixture = createFixture("test:integration");
		try {
			const absent = runPackageScript(fixture);
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

			writeFileSync(
				resolve(fixture.directory, ".env"),
				"HEVY_API_KEY=dotenv-fake\n",
			);
			const dotenvOnly = runPackageScript(fixture, "test:integration", {
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

			const explicitWins = runPackageScript(fixture, "test:integration", {
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
	] as const)("fails closed for %s dotenv input", (kind, contents) => {
		const fixture = createFixture("test:integration");
		try {
			const envPath = resolve(fixture.directory, ".env");
			if (kind === "malformed") {
				writeFileSync(envPath, contents);
			} else {
				mkdirSync(envPath);
			}
			const result = runPackageScript(fixture, "test:integration", {
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
	});

	it("executes the production live runner once and propagates downstream status", () => {
		const fixture = createFixture("test:live");
		try {
			writeFileSync(
				resolve(fixture.directory, ".env"),
				"HEVY_API_KEY=dotenv-live-fake\n",
			);
			const dotenvOnly = runLiveRunner(fixture, {
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

			const explicitWins = runLiveRunner(fixture, {
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

			const result = runLiveRunner(fixture, {
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
	] as const)("rejects %s live credentials before loading Vitest", (_, env) => {
		const fixture = createFixture("test:live");
		try {
			const result = runLiveRunner(fixture, env);
			expect(result.status).not.toBe(0);
			expect(markerRecords(fixture)).toEqual([]);
			expect(`${result.stdout}\n${result.stderr}`).toContain(
				"HEVY_API_KEY is required",
			);
		} finally {
			fixture.cleanup();
		}
	});

	it("does not let empty explicit values fall back to dotenv", () => {
		const fixture = createFixture("test:live");
		try {
			writeFileSync(
				resolve(fixture.directory, ".env"),
				"HEVY_API_KEY=dotenv-live-fake\n",
			);
			for (const value of ["", " \t\n"]) {
				const result = runLiveRunner(fixture, {
					HEVY_API_KEY: value,
				});
				expect(result.status).not.toBe(0);
				expect(markerRecords(fixture)).toEqual([]);
				expect(`${result.stdout}\n${result.stderr}`).toContain(
					"HEVY_API_KEY is required",
				);
			}
		} finally {
			fixture.cleanup();
		}
	});

	it("rejects a malformed or unreadable dotenv file before live Vitest", () => {
		for (const contents of ['HEVY_API_KEY="unterminated\n', undefined]) {
			const fixture = createFixture("test:live");
			try {
				const envPath = resolve(fixture.directory, ".env");
				if (contents === undefined) mkdirSync(envPath);
				else writeFileSync(envPath, contents);
				const result = runLiveRunner(fixture, {
					HEVY_API_KEY: "non-secret-fake",
				});
				expect(result.status).not.toBe(0);
				expect(markerRecords(fixture)).toEqual([]);
			} finally {
				fixture.cleanup();
			}
		}
	});
});
