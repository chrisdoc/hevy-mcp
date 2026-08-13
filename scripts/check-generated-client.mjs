#!/usr/bin/env node
import {
	cp,
	mkdtemp,
	readFile,
	readdir,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fixOpenAPISpec, validateOpenAPISpec } from "./openapi-spec.js";
import { isString } from "./runtime-value-predicates.mjs";

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = resolve(repositoryRoot, "packages/hevy-client");
const generatedRelative = "src/generated";
const generatedRoot = resolve(clientRoot, generatedRelative);
const curatedBarrels = ["src/types.ts", "src/schemas.ts"];
const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;
const DEFAULT_COMMAND_KILL_SIGNAL = "SIGTERM";
const SIGKILL_GRACE_PERIOD_MS = 2_000;

async function collectFiles(directory) {
	try {
		const entries = await readdir(directory, { withFileTypes: true });
		const files = [];
		for (const entry of entries) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) files.push(...(await collectFiles(path)));
			else files.push(path);
		}
		return files;
	} catch (error) {
		if (error?.code === "ENOENT") return [];
		throw error;
	}
}

function relativePath(root, path) {
	return relative(root, path).replaceAll("\\", "/");
}

export function isNodeModulesPath(path) {
	return path.split(/[\\/]+/).includes("node_modules");
}

/**
 * Compare two generated output trees without mutating either tree.
 *
 * The result is intentionally a list rather than a boolean so CI output
 * identifies the exact generated file that needs review.
 */
export async function compareDirectoryTrees(expectedRoot, actualRoot) {
	const expectedFiles = new Map(
		(await collectFiles(expectedRoot)).map((path) => [
			relativePath(expectedRoot, path),
			path,
		]),
	);
	const actualFiles = new Map(
		(await collectFiles(actualRoot)).map((path) => [
			relativePath(actualRoot, path),
			path,
		]),
	);
	const differences = [];
	const paths = new Set([...expectedFiles.keys(), ...actualFiles.keys()]);

	for (const path of [...paths].sort((left, right) =>
		left.localeCompare(right),
	)) {
		const expectedPath = expectedFiles.get(path);
		const actualPath = actualFiles.get(path);
		if (!expectedPath) {
			differences.push(`unexpected generated file: ${path}`);
			continue;
		}
		if (!actualPath) {
			differences.push(`missing generated file: ${path}`);
			continue;
		}

		const [expected, actual] = await Promise.all([
			readFile(expectedPath),
			readFile(actualPath),
		]);
		if (!expected.equals(actual)) {
			differences.push(`generated file differs: ${path}`);
		}
	}

	return differences;
}

/**
 * Return every file under a repository-root `src` directory. The repository
 * intentionally has no runtime root source tree; a non-empty result means a
 * generator escaped its package output closure.
 */
export async function findForbiddenRootSourceFiles(root) {
	const sourceRoot = resolve(root, "src");
	try {
		const sourceStats = await stat(sourceRoot);
		if (!sourceStats.isDirectory()) return ["src"];
	} catch (error) {
		if (error?.code === "ENOENT") return [];
		throw error;
	}

	const files = await collectFiles(sourceRoot);
	return files.length > 0
		? files.map((path) => relativePath(root, path)).sort()
		: ["src"];
}

function generatedTargetCandidates(specifier) {
	const target = specifier.slice("./generated/".length);
	if (target.includes("..")) return [];
	const candidates = [target];
	if (target.endsWith(".js")) {
		candidates.push(target.slice(0, -3) + ".ts");
		candidates.push(target.slice(0, -3) + ".json");
	}
	return candidates;
}

/**
 * Ensure curated public barrels only reference generated files that exist.
 * This keeps an upstream endpoint/schema change from silently leaving a
 * broken package API after regeneration.
 */
export async function findCuratedBarrelDrift(packageRoot) {
	const generatedDirectory = resolve(packageRoot, generatedRelative);
	const failures = [];
	const importPattern = /from\s+["'](\.\/generated\/[^"']+)["']/g;

	for (const barrel of curatedBarrels) {
		const barrelPath = resolve(packageRoot, barrel);
		let source;
		try {
			source = await readFile(barrelPath, "utf8");
		} catch (error) {
			if (error?.code === "ENOENT") {
				failures.push(`missing curated barrel: ${barrel}`);
				continue;
			}
			throw error;
		}

		for (const match of source.matchAll(importPattern)) {
			const specifier = match[1];
			const candidates = generatedTargetCandidates(specifier);
			let targetExists = false;
			for (const candidate of candidates) {
				try {
					await stat(resolve(generatedDirectory, candidate));
					targetExists = true;
					break;
				} catch {
					// Try the next extension candidate.
				}
			}
			if (!targetExists) {
				failures.push(`${barrel}: missing generated target ${specifier}`);
			}
		}
	}

	try {
		const tsc = await resolvePackageExecutable("typescript", "tsc");
		await runCommand(
			tsc.command,
			[...tsc.args, "--noEmit", "--pretty", "false", "-p", "./tsconfig.json"],
			packageRoot,
		);
	} catch (error) {
		failures.push(
			`curated barrel TypeScript check failed: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}

	return failures;
}

/**
 * Resolve a package's JavaScript bin entry and invoke it through Node. Calling
 * the bin entry directly avoids npm's platform-specific `.cmd`/shell shims
 * without ever interpolating arguments into a shell command.
 */
export async function resolvePackageExecutable(packageName, binName) {
	let packageJsonPath;
	try {
		packageJsonPath = require.resolve(`${packageName}/package.json`);
	} catch (error) {
		throw new Error(
			`Unable to resolve ${packageName} package metadata: ${
				error instanceof Error ? error.message : String(error)
			}`,
			{ cause: error },
		);
	}

	let packageJson;
	try {
		packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
	} catch (error) {
		throw new Error(
			`Unable to read ${packageName} package metadata: ${
				error instanceof Error ? error.message : String(error)
			}`,
			{ cause: error },
		);
	}
	const packageBin = packageJson.bin;
	const binary = isString(packageBin)
		? packageBin
		: (packageBin?.[binName] ?? packageBin?.[packageName]);

	if (!isString(binary) || binary.length === 0) {
		throw new Error(
			`Package ${packageName} does not declare a ${binName} executable`,
		);
	}

	return {
		command: process.execPath,
		args: [resolve(dirname(packageJsonPath), binary)],
	};
}

function formatCommand(command, args) {
	return [command, ...args]
		.map((part) => JSON.stringify(String(part)))
		.join(" ");
}

export function runCommand(
	command,
	args,
	cwd,
	{
		timeout = DEFAULT_COMMAND_TIMEOUT_MS,
		killSignal = DEFAULT_COMMAND_KILL_SIGNAL,
	} = {},
) {
	const commandTimeout =
		Number.isFinite(timeout) && timeout > 0
			? Math.floor(timeout)
			: DEFAULT_COMMAND_TIMEOUT_MS;
	const displayCommand = formatCommand(command, args);

	return new Promise((resolvePromise, reject) => {
		let output = "";
		let timedOut = false;
		let settled = false;
		let timeoutHandle;
		let gracePeriodHandle;

		const finish = (callback) => {
			if (settled) return;
			settled = true;
			if (timeoutHandle) clearTimeout(timeoutHandle);
			if (gracePeriodHandle) clearTimeout(gracePeriodHandle);
			callback();
		};
		const rejectWithMessage = (status, cause) => {
			finish(() =>
				reject(
					new Error(
						[`${displayCommand} failed: ${status}`, output.trim()]
							.filter(Boolean)
							.join("\n"),
						{ cause },
					),
				),
			);
		};

		let child;
		try {
			child = spawn(command, args, {
				cwd,
				stdio: ["ignore", "pipe", "pipe"],
				shell: false,
				timeout: commandTimeout,
				killSignal,
			});
		} catch (error) {
			rejectWithMessage(
				`could not start: ${error instanceof Error ? error.message : String(error)}`,
				error,
			);
			return;
		}

		timeoutHandle = setTimeout(
			() => {
				if (child.exitCode === null && child.signalCode === null) {
					timedOut = true;
					child.kill(killSignal);

					if (killSignal !== "SIGKILL") {
						gracePeriodHandle = setTimeout(() => {
							if (child.exitCode === null && child.signalCode === null) {
								child.kill("SIGKILL");
							}
						}, SIGKILL_GRACE_PERIOD_MS);
					}
				}
			},
			Math.max(1, commandTimeout - 1),
		);
		child.stdout.on("data", (chunk) => {
			output += chunk;
		});
		child.stderr.on("data", (chunk) => {
			output += chunk;
		});
		child.once("error", (error) => {
			const code = error?.code ? ` (${error.code})` : "";
			rejectWithMessage(`could not start${code}: ${error.message}`, error);
		});
		child.once("close", (code, signal) => {
			if (timedOut) {
				rejectWithMessage(
					`timed out after ${commandTimeout}ms; sent ${String(killSignal)}`,
				);
				return;
			}
			if (code === 0) {
				finish(resolvePromise);
				return;
			}
			rejectWithMessage(
				signal ? `terminated by signal ${signal}` : `exited with code ${code}`,
			);
		});
	});
}

async function readNormalizedSpec() {
	const specPath = resolve(repositoryRoot, "openapi-spec.json");
	const source = JSON.parse(await readFile(specPath, "utf8"));
	const normalized = fixOpenAPISpec(source);
	validateOpenAPISpec(normalized);
	return {
		normalized,
		normalizationDrift: JSON.stringify(source) !== JSON.stringify(normalized),
	};
}

async function createFixtureRepository(normalizedSpec) {
	const root = await mkdtemp(join(tmpdir(), "hevy-generated-client-check-"));
	try {
		const fixtureClient = resolve(root, "packages/hevy-client");
		await cp(clientRoot, fixtureClient, {
			recursive: true,
			filter: (path) => !isNodeModulesPath(path),
		});
		await rm(resolve(fixtureClient, generatedRelative), {
			recursive: true,
			force: true,
		});
		await cp(
			resolve(repositoryRoot, "tsconfig.base.json"),
			resolve(root, "tsconfig.base.json"),
		);
		await cp(
			resolve(repositoryRoot, ".oxfmtrc.json"),
			resolve(root, ".oxfmtrc.json"),
		);
		// Kubb loads the copied config from the temporary tree, so expose the
		// repository dependencies there without copying the entire installation.
		await symlink(
			resolve(repositoryRoot, "node_modules"),
			resolve(root, "node_modules"),
			"junction",
		);
		await writeFile(
			resolve(root, "openapi-spec.json"),
			JSON.stringify(normalizedSpec, null, "\t"),
		);
		return { root, client: fixtureClient };
	} catch (error) {
		await rm(root, { recursive: true, force: true });
		throw error;
	}
}

/**
 * Regenerate the checked contract in a temporary repository copy. Running
 * Kubb with the checked-in config is important: a future path regression must
 * create the fixture's root `src/` tree and fail this check.
 */
export async function checkGeneratedClient() {
	const { normalized, normalizationDrift } = await readNormalizedSpec();
	let fixture;
	try {
		fixture = await createFixtureRepository(normalized);
		const kubb = await resolvePackageExecutable("@kubb/cli", "kubb");
		const oxfmt = await resolvePackageExecutable("oxfmt", "oxfmt");
		await runCommand(
			kubb.command,
			[...kubb.args, "generate", "--config", "./kubb.config.ts"],
			fixture.client,
		);
		await runCommand(
			oxfmt.command,
			[...oxfmt.args, "--write", generatedRelative],
			fixture.client,
		);

		const failures = [];
		if (normalizationDrift) {
			failures.push(
				"checked OpenAPI spec is not normalized; run npm run openapi for a reviewed refresh",
			);
		}
		const rootSourceFiles = await findForbiddenRootSourceFiles(fixture.root);
		if (rootSourceFiles.length > 0) {
			failures.push(
				`forbidden root src creation: ${rootSourceFiles.join(", ")}`,
			);
		}
		failures.push(
			...(await compareDirectoryTrees(
				generatedRoot,
				resolve(fixture.client, generatedRelative),
			)),
		);
		failures.push(...(await findCuratedBarrelDrift(fixture.client)));

		if (failures.length > 0) {
			throw new Error(
				[
					"Generated client regeneration drift detected.",
					...failures.map((failure) => `- ${failure}`),
				].join("\n"),
			);
		}

		return { generatedFiles: (await collectFiles(generatedRoot)).length };
	} finally {
		if (fixture) {
			await rm(fixture.root, { recursive: true, force: true });
		}
	}
}

if (
	process.argv[1] &&
	fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
	try {
		const result = await checkGeneratedClient();
		console.log(
			`Generated client is up to date (${result.generatedFiles} files); no root src tree was created.`,
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
