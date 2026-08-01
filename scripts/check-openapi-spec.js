#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateOpenAPISpec } from "./openapi-spec.js";

const specPath = resolve(
	fileURLToPath(new URL("..", import.meta.url)),
	"openapi-spec.json",
);
const spec = JSON.parse(await readFile(specPath, "utf8"));
validateOpenAPISpec(spec);
console.log("OpenAPI compatibility invariants are valid.");
