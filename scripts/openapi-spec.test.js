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

	it("rejects a non-integer Routine rest_seconds contract", () => {
		expect(() =>
			validateOpenAPISpec(upstreamSpec({ type: "number", example: 60.5 })),
		).toThrow(/must remain an OpenAPI integer/);
	});
});
