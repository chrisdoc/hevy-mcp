#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { validateOpenAPISpec } from "./openapi-spec.js";

const spec = JSON.parse(await readFile("openapi-spec.json", "utf8"));
validateOpenAPISpec(spec);
console.log("OpenAPI compatibility invariants are valid.");
