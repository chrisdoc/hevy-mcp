#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateOpenAPISpec } from "./openapi-spec.js";
import {
	loadArtifactProvenance,
	repositoryRoot,
} from "./repository-control-plane.mjs";

const spec = loadArtifactProvenance(repositoryRoot);
const openApiSource = spec.sources.find(
	(source) => source.id === "openapi-spec",
);
if (!openApiSource || openApiSource.paths.length !== 1)
	throw new Error(
		"Artifact provenance must own exactly one OpenAPI source path",
	);
const specPath = resolve(repositoryRoot, openApiSource.paths[0]);
const document = JSON.parse(await readFile(specPath, "utf8"));
validateOpenAPISpec(document);
console.log("OpenAPI compatibility invariants are valid.");
