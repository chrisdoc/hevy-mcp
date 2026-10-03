import { describe, expect, it } from "vitest";
import { fixOpenAPISpec, validateOpenAPISpec } from "./openapi-spec.js";

function upstreamSpec(restSeconds) {
	return {
		components: {
			schemas: {
				Routine: {
					properties: {
						exercises: {
							items: {
								properties: { rest_seconds: restSeconds },
							},
						},
					},
				},
			},
		},
		paths: {},
	};
}

describe("OpenAPI compatibility fixes", () => {
	it("keeps Routine rest_seconds numeric when upstream provides a string", () => {
		const fixed = fixOpenAPISpec({
			...upstreamSpec({ type: "string", example: "60" }),
		});

		expect(
			fixed.components.schemas.Routine.properties.exercises.items.properties
				.rest_seconds,
		).toMatchObject({ type: "integer", example: 60 });
		expect(() => validateOpenAPISpec(fixed)).not.toThrow();
	});

	it("normalizes upstream schema and operation quirks", () => {
		const fixed = fixOpenAPISpec({
			components: {
				schemas: {
					RequiredSchema: {
						properties: { name: { type: "string", required: true } },
					},
					EnumSchema: { type: "enum", enum: ["active"] },
					RefSchema: {
						properties: {
							value: { $ref: "#/components/schemas/Value", nullable: true },
						},
					},
					PostWorkoutsRequestSet: {
						properties: { rpe: { type: "number", example: null } },
					},
					Routine: {
						properties: {
							exercises: {
								items: {
									properties: {
										rest_seconds: { type: "string", example: "60" },
									},
								},
							},
						},
					},
				},
			},
			paths: {
				"/v1/workouts/{id}": {
					get: {
						parameters: [{ in: "header", name: "X-Request-Id" }],
						tags: ["workouts"],
					},
				},
			},
		});

		expect(fixed.components.schemas.RequiredSchema.required).toEqual(["name"]);
		expect(
			fixed.components.schemas.RequiredSchema.properties.name,
		).not.toHaveProperty("required");
		expect(fixed.components.schemas.EnumSchema.type).toBe("string");
		expect(fixed.components.schemas.RefSchema.properties.value).toEqual({
			allOf: [{ $ref: "#/components/schemas/Value" }, { nullable: true }],
		});
		expect(
			fixed.components.schemas.PostWorkoutsRequestSet.properties.rpe,
		).not.toHaveProperty("example");
		expect(fixed.paths["/v1/workouts/{id}"].get.parameters[0].schema).toEqual({
			type: "string",
			format: "uuid",
		});
		expect(fixed.tags).toEqual([
			{ name: "workouts", description: "workouts operations" },
		]);
		expect(fixed.paths["/v1/workouts/{id}"].get.operationId).toBe(
			"getV1WorkoutsId",
		);
		expect(fixed.servers).toEqual([
			{ url: "https://api.hevyapp.com", description: "Hevy API" },
		]);
		expect(
			fixed.components.schemas.Routine.properties.exercises.items.properties
				.rest_seconds,
		).toMatchObject({ type: "integer", example: 60 });
	});

	it("wraps routine and folder write responses in their API envelopes", () => {
		const jsonResponse = (schema) => ({
			content: { "application/json": { schema } },
		});
		const spec = upstreamSpec({ type: "integer", example: 60 });
		spec.paths = {
			"/v1/routines": {
				post: {
					responses: {
						201: jsonResponse({ $ref: "#/components/schemas/Routine" }),
					},
				},
			},
			"/v1/routines/{routineId}": {
				put: {
					responses: {
						200: jsonResponse({ $ref: "#/components/schemas/Routine" }),
					},
				},
			},
			"/v1/routine_folders": {
				post: {
					responses: {
						201: jsonResponse({ $ref: "#/components/schemas/RoutineFolder" }),
					},
				},
			},
		};
		const schemaOf = (fixedSpec, path, method, status) =>
			fixedSpec.paths[path][method].responses[status].content[
				"application/json"
			].schema;
		const routineEnvelope = {
			type: "object",
			properties: { routine: { $ref: "#/components/schemas/Routine" } },
		};

		const fixed = fixOpenAPISpec(spec);

		expect(schemaOf(fixed, "/v1/routines", "post", "201")).toEqual({
			oneOf: [
				routineEnvelope,
				{ type: "object", properties: {}, additionalProperties: false },
			],
		});
		expect(schemaOf(fixed, "/v1/routines/{routineId}", "put", "200")).toEqual(
			routineEnvelope,
		);
		expect(schemaOf(fixed, "/v1/routine_folders", "post", "201")).toEqual({
			type: "object",
			properties: {
				routine_folder: { $ref: "#/components/schemas/RoutineFolder" },
			},
		});
		expect(() => validateOpenAPISpec(fixed)).not.toThrow();
		expect(fixOpenAPISpec(fixed).paths).toEqual(fixed.paths);
	});

	it("rejects a bare Routine routine update response", () => {
		const spec = upstreamSpec({ type: "integer", example: 60 });
		spec.paths = {
			"/v1/routines/{routineId}": {
				put: {
					responses: {
						200: {
							content: {
								"application/json": {
									schema: { $ref: "#/components/schemas/Routine" },
								},
							},
						},
					},
				},
			},
		};

		expect(() => validateOpenAPISpec(spec)).toThrow(
			/PUT \/v1\/routines\/\{routineId\} 200 must use the routine envelope/,
		);
	});

	it("rejects a non-integer Routine rest_seconds contract", () => {
		expect(() =>
			validateOpenAPISpec(upstreamSpec({ type: "number", example: 60.5 })),
		).toThrow(/must remain an OpenAPI integer/);
	});

	it("reports a missing Routine rest_seconds field distinctly", () => {
		const spec = upstreamSpec({ type: "integer", example: 60 });
		delete spec.components.schemas.Routine.properties.exercises.items.properties
			.rest_seconds;

		expect(() => validateOpenAPISpec(spec)).toThrow(
			/field is missing from the OpenAPI spec/,
		);
	});
});
