import { existsSync } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	loadArtifactProvenance,
	repositoryRoot,
} from "./repository-control-plane.mjs";

const manifestSchema =
	"https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
const repositoryUrl = "https://github.com/chrisdoc/hevy-mcp";

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

async function readJson(path, label) {
	let contents;
	try {
		contents = await readFile(path, "utf8");
	} catch (error) {
		const readError = new Error(`Unable to read ${label}: ${error.message}`);
		readError.cause = error;
		throw readError;
	}

	try {
		return { contents, value: JSON.parse(contents) };
	} catch (error) {
		throw new Error(`${label} is not valid JSON: ${error.message}`);
	}
}

function loadManifestProvenance(rootDir) {
	const fixtureProvenance = resolve(
		rootDir,
		"repository",
		"artifact-provenance.json",
	);
	return existsSync(fixtureProvenance)
		? loadArtifactProvenance(rootDir)
		: loadArtifactProvenance(repositoryRoot);
}

function provenanceEntry(provenance, collection, id, pathCount) {
	const entries = provenance?.[collection];
	assert(
		Array.isArray(entries),
		`Artifact provenance ${collection} entries are required`,
	);
	const matches = entries.filter((candidate) => candidate?.id === id);
	assert(
		matches.length === 1,
		`Artifact provenance ${collection} entry ${id} must be unique`,
	);
	const [entry] = matches;
	assert(
		Array.isArray(entry.paths) && entry.paths.length > 0,
		`Artifact provenance ${collection} entry ${id} paths are required`,
	);
	if (pathCount !== undefined)
		assert(
			entry.paths.length === pathCount,
			`Artifact provenance ${collection} entry ${id} must own exactly ${pathCount} path${pathCount === 1 ? "" : "s"}`,
		);
	assert(
		entry.paths.every((path) => typeof path === "string" && path.length > 0),
		`Artifact provenance ${collection} entry ${id} paths must be non-empty`,
	);
	assert(
		new Set(entry.paths).size === entry.paths.length,
		`Artifact provenance ${collection} entry ${id} paths must be unique`,
	);
	return entry;
}

function resolveProvenancePaths(
	rootDir,
	provenance,
	collection,
	id,
	pathCount,
) {
	return provenanceEntry(provenance, collection, id, pathCount).paths.map(
		(path) => ({
			path: resolve(rootDir, path),
			relativePath: path,
		}),
	);
}

async function resolvePackageMetadata(rootDir, provenance) {
	const [nodePackageSource] = resolveProvenancePaths(
		rootDir,
		provenance,
		"sources",
		"node-package-manifest",
		1,
	);
	try {
		await access(nodePackageSource.path);
		return {
			packagePath: nodePackageSource.path,
			packageLabel: nodePackageSource.relativePath,
		};
	} catch {
		return {
			packagePath: resolve(rootDir, "package.json"),
			packageLabel: "package.json",
		};
	}
}

function validatePackageJson(packageJson) {
	assert(
		packageJson?.name === "hevy-mcp",
		"package.json name must be hevy-mcp",
	);
	assert(
		packageJson.mcpName === "io.github.chrisdoc/hevy-mcp",
		"package.json mcpName must be io.github.chrisdoc/hevy-mcp",
	);
	assert(
		typeof packageJson.version === "string" && packageJson.version.length > 0,
		"package.json version must be a non-empty string",
	);
	assert(
		Array.isArray(packageJson.files) &&
			packageJson.files.includes("server.json"),
		"package.json files must include server.json",
	);
}

function validateManifestShape(manifest) {
	assert(
		manifest && typeof manifest === "object" && !Array.isArray(manifest),
		"server.json must contain an object",
	);
	assert(
		manifest.$schema === manifestSchema,
		"server.json has an unexpected $schema",
	);
	assert(
		manifest.title === "Hevy MCP Server",
		"server.json has an unexpected title",
	);
	assert(
		manifest.description ===
			"MCP server for managing workouts, routines, and exercise data through the Hevy API",
		"server.json has an unexpected description",
	);
	assert(
		manifest.repository?.url === repositoryUrl &&
			manifest.repository?.source === "github",
		"server.json has unexpected repository metadata",
	);
	assert(
		Array.isArray(manifest.packages) && manifest.packages.length === 1,
		"server.json must contain exactly one package",
	);

	const [packageEntry] = manifest.packages;
	assert(
		packageEntry.registryType === "npm",
		"server.json package registryType must be npm",
	);
	assert(
		packageEntry.transport?.type === "stdio",
		"server.json package transport must be stdio",
	);
	assert(
		Array.isArray(packageEntry.environmentVariables) &&
			packageEntry.environmentVariables.length === 1,
		"server.json package must declare exactly one environment variable",
	);

	const [apiKey] = packageEntry.environmentVariables;
	assert(
		apiKey.name === "HEVY_API_KEY" &&
			apiKey.description === "API key for authenticating with the Hevy API" &&
			apiKey.isRequired === true &&
			apiKey.isSecret === true,
		"server.json has unexpected HEVY_API_KEY metadata",
	);
}

function findDrift(packageJson, manifest) {
	const packageEntry = manifest.packages[0];
	const drift = [];

	if (manifest.name !== packageJson.mcpName) {
		drift.push("name");
	}
	if (manifest.version !== packageJson.version) {
		drift.push("version");
	}
	if (packageEntry.identifier !== packageJson.name) {
		drift.push("packages[0].identifier");
	}
	if (packageEntry.version !== packageJson.version) {
		drift.push("packages[0].version");
	}

	return drift;
}

export async function runServerManifest({ mode, rootDir = process.cwd() }) {
	assert(
		mode === "check" || mode === "sync",
		`Invalid mode ${JSON.stringify(mode)}; expected "check" or "sync"`,
	);

	const provenance = loadManifestProvenance(rootDir);
	const { packagePath, packageLabel } = await resolvePackageMetadata(
		rootDir,
		provenance,
	);
	const serverManifestPaths = resolveProvenancePaths(
		rootDir,
		provenance,
		"outputs",
		"server-manifest",
	);
	const pluginManifestPaths = resolveProvenancePaths(
		rootDir,
		provenance,
		"outputs",
		"plugin-manifest",
	);
	const [primaryManifest, ...mirrorManifests] = serverManifestPaths;
	const manifestPath = primaryManifest.path;
	const [{ value: packageJson }, { value: manifest }] = await Promise.all([
		readJson(packagePath, packageLabel),
		readJson(manifestPath, primaryManifest.relativePath),
	]);
	const packageManifests = [];
	for (const mirror of mirrorManifests) {
		try {
			packageManifests.push({
				...mirror,
				value: (await readJson(mirror.path, mirror.relativePath)).value,
			});
		} catch (error) {
			if (error.cause?.code !== "ENOENT") throw error;
		}
	}
	const pluginManifests = [];
	for (const plugin of pluginManifestPaths) {
		try {
			pluginManifests.push({
				...plugin,
				value: (await readJson(plugin.path, plugin.relativePath)).value,
			});
		} catch (error) {
			if (error.cause?.code !== "ENOENT") throw error;
		}
	}

	validatePackageJson(packageJson);
	validateManifestShape(manifest);

	const drift = findDrift(packageJson, manifest);
	for (const packageManifest of packageManifests) {
		if (JSON.stringify(packageManifest.value) !== JSON.stringify(manifest))
			drift.push(packageManifest.relativePath);
	}
	for (const plugin of pluginManifests)
		if (plugin.value.version !== packageJson.version)
			drift.push(plugin.relativePath);
	if (mode === "check") {
		assert(
			drift.length === 0,
			`server.json or plugin.json is out of sync with package.json: ${drift.join(", ")}. Run npm run sync:server-manifest.`,
		);
		return { changed: false, drift };
	}

	if (drift.length === 0) {
		return { changed: false, drift };
	}

	manifest.name = packageJson.mcpName;
	manifest.version = packageJson.version;
	manifest.packages[0].identifier = packageJson.name;
	manifest.packages[0].version = packageJson.version;

	const updatedContents = `${JSON.stringify(manifest, null, "\t")}\n`;
	await writeFile(manifestPath, updatedContents, "utf8");
	for (const mirror of mirrorManifests) {
		try {
			await access(dirname(mirror.path));
		} catch (error) {
			if (error.code === "ENOENT") {
				// Fixture repositories may only include the primary manifest output.
				continue;
			}
			throw error;
		}
		await writeFile(mirror.path, updatedContents, "utf8");
	}

	for (const plugin of pluginManifests) {
		if (plugin.value.version === packageJson.version) continue;
		plugin.value.version = packageJson.version;
		const updatedPluginContents = `${JSON.stringify(plugin.value, null, "\t")}\n`;
		await writeFile(plugin.path, updatedPluginContents, "utf8");
	}

	return { changed: true, drift };
}

const isCli =
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isCli) {
	try {
		const result = await runServerManifest({ mode: process.argv[2] });
		console.log(
			result.changed
				? "Synchronized server.json and plugin.json with package.json."
				: "server.json and plugin.json are synchronized with package.json.",
		);
	} catch (error) {
		console.error(`server-manifest: ${error.message}`);
		process.exitCode = 1;
	}
}
