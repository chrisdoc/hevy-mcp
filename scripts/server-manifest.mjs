import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
		throw new Error(`Unable to read ${label}: ${error.message}`);
	}

	try {
		return { contents, value: JSON.parse(contents) };
	} catch (error) {
		throw new Error(`${label} is not valid JSON: ${error.message}`);
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

	const packagePath = resolve(rootDir, "package.json");
	const manifestPath = resolve(rootDir, "server.json");
	const [{ value: packageJson }, { contents, value: manifest }] =
		await Promise.all([
			readJson(packagePath, "package.json"),
			readJson(manifestPath, "server.json"),
		]);

	validatePackageJson(packageJson);
	validateManifestShape(manifest);

	const drift = findDrift(packageJson, manifest);
	if (mode === "check") {
		assert(
			drift.length === 0,
			`server.json is out of sync with package.json: ${drift.join(", ")}. Run npm run sync:server-manifest.`,
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
	if (updatedContents !== contents) {
		await writeFile(manifestPath, updatedContents, "utf8");
	}

	return { changed: updatedContents !== contents, drift };
}

const isCli =
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isCli) {
	try {
		const result = await runServerManifest({ mode: process.argv[2] });
		console.log(
			result.changed
				? "Synchronized server.json with package.json."
				: "server.json is synchronized with package.json.",
		);
	} catch (error) {
		console.error(`server-manifest: ${error.message}`);
		process.exitCode = 1;
	}
}
