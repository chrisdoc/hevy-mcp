#!/usr/bin/env node
/**
 * OpenAPI Spec Script
 *
 * Fetches the OpenAPI spec from Hevy's API and applies fixes for known issues.
 * Run with: pnpm run openapi
 */
import { writeFileSync } from "node:fs";
import pkg from "abstract-syntax-tree";

const { parse, find, generate } = pkg;

const SPEC_FILE = "openapi-spec.json";
const HEVY_SWAGGER_URL = "https://api.hevyapp.com/docs/swagger-ui-init.js";

/**
 * Fix known OpenAPI spec issues from the upstream Hevy API.
 */
function fixOpenAPISpec(spec) {
	const fixed = JSON.parse(JSON.stringify(spec));

	console.log("Applying fixes...\n");

	fixInvalidRequiredProperties(fixed.components?.schemas || {});
	fixInvalidEnumTypes(fixed.components?.schemas || {});
	fixRefSiblings(fixed.components?.schemas || {});
	fixMissingParameterSchemas(fixed.paths || {});
	fixInvalidExamples(fixed.components?.schemas || {});

	if (!fixed.servers || fixed.servers.length === 0) {
		fixed.servers = [
			{ url: "https://api.hevyapp.com", description: "Hevy API" },
		];
		console.log("  Fixed: Added missing servers array");
	}

	fixMissingGlobalTags(fixed);
	generateOperationIds(fixed.paths || {});

	return fixed;
}

/**
 * Fix schemas with "required": true on properties.
 */
function fixInvalidRequiredProperties(schemas, path = "schemas") {
	for (const [schemaName, schema] of Object.entries(schemas)) {
		if (schema && typeof schema === "object") {
			fixSchemaRequired(schema, `${path}.${schemaName}`);
		}
	}
}

function fixSchemaRequired(schema, path = "") {
	if (!schema || typeof schema !== "object") return;

	if (schema.properties && typeof schema.properties === "object") {
		const requiredProps = [];

		for (const [propName, propSchema] of Object.entries(schema.properties)) {
			if (propSchema && typeof propSchema === "object") {
				if (propSchema.required === true) {
					requiredProps.push(propName);
					delete propSchema.required;
					console.log(
						`  Fixed: ${path}.properties.${propName} - moved "required: true" to schema level`,
					);
				}
				fixSchemaRequired(propSchema, `${path}.properties.${propName}`);
			}
		}

		if (requiredProps.length > 0) {
			if (!schema.required) schema.required = [];
			schema.required.push(...requiredProps);
			schema.required = [...new Set(schema.required)];
		}
	}

	if (schema.items) fixSchemaRequired(schema.items, `${path}.items`);

	for (const keyword of ["allOf", "oneOf", "anyOf"]) {
		if (Array.isArray(schema[keyword])) {
			schema[keyword].forEach((subSchema, i) => {
				fixSchemaRequired(subSchema, `${path}.${keyword}[${i}]`);
			});
		}
	}

	if (
		schema.additionalProperties &&
		typeof schema.additionalProperties === "object"
	) {
		fixSchemaRequired(
			schema.additionalProperties,
			`${path}.additionalProperties`,
		);
	}
}

/**
 * Fix invalid "type": "enum" schemas.
 */
function fixInvalidEnumTypes(schemas) {
	for (const [schemaName, schema] of Object.entries(schemas)) {
		if (schema && schema.type === "enum" && Array.isArray(schema.enum)) {
			const firstValue = schema.enum[0];
			const inferredType = typeof firstValue === "number" ? "number" : "string";
			schema.type = inferredType;
			console.log(
				`  Fixed: schemas.${schemaName} - changed "type": "enum" to "type": "${inferredType}"`,
			);
		}
	}
}

/**
 * Fix $ref siblings - wrap in allOf.
 */
function fixRefSiblings(schemas) {
	for (const [schemaName, schema] of Object.entries(schemas)) {
		if (schema && typeof schema === "object") {
			fixRefSiblingsRecursive(schema, `schemas.${schemaName}`);
		}
	}
}

function fixRefSiblingsRecursive(obj, path = "") {
	if (!obj || typeof obj !== "object") return;

	if (obj.properties) {
		for (const [propName, propSchema] of Object.entries(obj.properties)) {
			if (propSchema && typeof propSchema === "object") {
				if (propSchema.$ref && Object.keys(propSchema).length > 1) {
					const ref = propSchema.$ref;
					const otherProps = { ...propSchema };
					delete otherProps.$ref;
					obj.properties[propName] = { allOf: [{ $ref: ref }, otherProps] };
					console.log(
						`  Fixed: ${path}.properties.${propName} - wrapped $ref with siblings in allOf`,
					);
				} else {
					fixRefSiblingsRecursive(propSchema, `${path}.properties.${propName}`);
				}
			}
		}
	}

	if (obj.items) fixRefSiblingsRecursive(obj.items, `${path}.items`);

	for (const keyword of ["allOf", "oneOf", "anyOf"]) {
		if (Array.isArray(obj[keyword])) {
			obj[keyword].forEach((subSchema, i) => {
				fixRefSiblingsRecursive(subSchema, `${path}.${keyword}[${i}]`);
			});
		}
	}
}

/**
 * Fix missing schema on parameters.
 */
function fixMissingParameterSchemas(paths) {
	for (const [pathName, pathItem] of Object.entries(paths)) {
		for (const method of ["get", "post", "put", "patch", "delete"]) {
			const operation = pathItem[method];
			if (!operation?.parameters) continue;

			for (const param of operation.parameters) {
				if (!param.schema && !param.content) {
					if (param.in === "header") {
						param.schema = { type: "string", format: "uuid" };
					} else {
						param.schema = { type: "string" };
					}
					console.log(
						`  Fixed: paths.${pathName}.${method}.parameters - added missing schema to "${param.name}" ${param.in} param`,
					);
				}
			}
		}
	}
}

/**
 * Fix invalid examples in schemas.
 */
function fixInvalidExamples(schemas) {
	const postWorkoutsSet = schemas.PostWorkoutsRequestSet;
	if (postWorkoutsSet?.properties?.rpe?.example === null) {
		delete postWorkoutsSet.properties.rpe.example;
		console.log(
			"  Fixed: schemas.PostWorkoutsRequestSet.properties.rpe - removed invalid null example",
		);
	}

	const routine = schemas.Routine;
	if (routine?.properties?.exercises?.items?.properties?.rest_seconds) {
		const restSeconds =
			routine.properties.exercises.items.properties.rest_seconds;
		if (typeof restSeconds.example === "number") {
			restSeconds.example = String(restSeconds.example);
			console.log(
				"  Fixed: schemas.Routine...rest_seconds - converted example to string",
			);
		}
	}
}

/**
 * Add missing global tags from operations.
 */
function fixMissingGlobalTags(spec) {
	const usedTags = new Set();

	for (const pathItem of Object.values(spec.paths || {})) {
		for (const method of ["get", "post", "put", "patch", "delete"]) {
			const operation = pathItem[method];
			if (operation?.tags) {
				for (const tag of operation.tags) usedTags.add(tag);
			}
		}
	}

	if (!spec.tags) spec.tags = [];
	const existingTags = new Set(spec.tags.map((t) => t.name));

	for (const tag of usedTags) {
		if (!existingTags.has(tag)) {
			spec.tags.push({ name: tag, description: `${tag} operations` });
			console.log(`  Fixed: Added missing global tag "${tag}"`);
		}
	}
}

/**
 * Generate operationIds matching Kubb's expected format.
 * e.g., GET /v1/workouts/{workoutId} -> getV1WorkoutsWorkoutid
 */
function generateOperationIds(paths) {
	for (const [pathName, pathItem] of Object.entries(paths)) {
		for (const method of ["get", "post", "put", "patch", "delete"]) {
			const operation = pathItem[method];
			if (!operation || operation.operationId) continue;

			const pathParts = pathName
				.replace(/^\//, "")
				.replace(/\{(\w+)\}/g, (_, param) => param.toLowerCase())
				.split("/")
				.map((part, i) => {
					const camelCase = part.replace(/_(\w)/g, (_, c) => c.toUpperCase());
					return i === 0
						? camelCase
						: camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
				})
				.join("");

			operation.operationId =
				method + pathParts.charAt(0).toUpperCase() + pathParts.slice(1);
			console.log(
				`  Fixed: paths.${pathName}.${method} - generated operationId "${operation.operationId}"`,
			);
		}
	}
}

/**
 * Fetch the OpenAPI spec from Hevy's swagger-ui-init.js file
 */
async function fetchSpecFromHevy() {
	console.log("Fetching OpenAPI spec from Hevy API...\n");

	const response = await fetch(HEVY_SWAGGER_URL);
	if (!response.ok) {
		throw new Error(`HTTP error! Status: ${response.status}`);
	}

	const jsContent = await response.text();
	const ast = parse(jsContent);

	const optionsNode = find(ast, 'VariableDeclarator[id.name="options"]')[0];
	if (!optionsNode?.init?.properties) {
		throw new Error("options variable not found in swagger-ui-init.js");
	}

	const swaggerDocProperty = optionsNode.init.properties.find(
		(prop) => prop.key.value === "swaggerDoc",
	);
	if (!swaggerDocProperty) {
		throw new Error("swaggerDoc property not found in options");
	}

	const swaggerDocCode = generate(swaggerDocProperty.value, { tabs: true });
	return JSON.parse(swaggerDocCode);
}

async function main() {
	try {
		const spec = await fetchSpecFromHevy();
		const fixedSpec = fixOpenAPISpec(spec);

		writeFileSync(SPEC_FILE, JSON.stringify(fixedSpec, null, "\t"));
		console.log(`\n✓ OpenAPI spec saved to ${SPEC_FILE}`);
	} catch (error) {
		console.error("Error:", error.message);
		process.exit(1);
	}
}

main();
