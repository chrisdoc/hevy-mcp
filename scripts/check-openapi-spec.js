#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateOpenAPISpec } from "./openapi-spec.js";
import {
	loadArtifactProvenance,
	repositoryRoot,
} from "./repository-control-plane.mjs";
import { isString } from "./runtime-value-predicates.mjs";

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function resolveOpenApiSpecPath(provenance, rootDir) {
	const sources = provenance?.sources;
	assert(Array.isArray(sources), "Artifact provenance sources are required");
	const matches = sources.filter((source) => source?.id === "openapi-spec");
	assert(
		matches.length === 1,
		"Artifact provenance must own exactly one OpenAPI source entry",
	);
	const [source] = matches;
	assert(
		Array.isArray(source.paths) && source.paths.length === 1,
		"Artifact provenance must own exactly one OpenAPI source path",
	);
	const [path] = source.paths;
	assert(
		isString(path) && path.length > 0,
		"Artifact provenance OpenAPI source path must be non-empty",
	);
	return resolve(rootDir, path);
}

export async function checkOpenApiSpec(rootDir = repositoryRoot) {
	const provenance = loadArtifactProvenance(rootDir);
	const specPath = resolveOpenApiSpecPath(provenance, rootDir);
	const spec = JSON.parse(await readFile(specPath, "utf8"));
	validateOpenAPISpec(spec);
}

const isCli =
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isCli) {
	await checkOpenApiSpec();
	console.log("OpenAPI compatibility invariants are valid.");
}
