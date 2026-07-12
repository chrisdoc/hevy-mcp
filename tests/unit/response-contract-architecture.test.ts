import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const toolsDirectory = new URL("../../src/tools/", import.meta.url);
const toolSources = readdirSync(toolsDirectory)
	.filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
	.map((file) => readFileSync(new URL(file, toolsDirectory), "utf8"))
	.join("\n");

describe("tool response architecture", () => {
	it("routes every successful tool path through respond contracts", () => {
		expect(toolSources.match(/return respond\(/g)).toHaveLength(23);
		expect(toolSources).not.toMatch(
			/create(?:Json|StructuredJson|Empty|StructuredEmpty|Text)Response/,
		);
	});

	it("keeps formatting and output schema selection out of tool handlers", () => {
		expect(toolSources).not.toContain('/utils/formatters.js"');
		expect(toolSources).not.toContain('/utils/output-schemas.js"');
	});
});
