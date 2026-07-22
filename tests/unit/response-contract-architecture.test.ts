import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const toolsDirectory = new URL(
	"../../packages/core/src/tools/",
	import.meta.url,
);
const definitionFiles = [
	"workouts.ts",
	"routines.ts",
	"templates.ts",
	"folders.ts",
	"body-measurements.ts",
	"user.ts",
	"workflows.ts",
	"routine-discovery.ts",
] as const;
const toolSources = definitionFiles
	.map((file) => readFileSync(new URL(file, toolsDirectory), "utf8"))
	.join("\n");
describe("tool response architecture", () => {
	it("requires every definition to provide a response contract", () => {
		expect(toolSources.match(/responseContract:/g)).toHaveLength(25);
		expect(toolSources.match(/execute:/g)).toHaveLength(25);
		expect(toolSources).not.toMatch(/return respond\(/);
		expect(toolSources).not.toMatch(
			/create(?:Json|StructuredJson|Empty|StructuredEmpty|Text)Response/,
		);
	});

	it("keeps formatting and output schema selection out of tool handlers", () => {
		expect(toolSources).not.toContain('/utils/formatters.js"');
		expect(toolSources).not.toContain('/utils/output-schemas.js"');
	});
});
