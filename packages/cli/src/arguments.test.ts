import { describe, expect, it } from "vitest";
import { positiveInt, UsageError, type CliArgs } from "./arguments.js";

const args = (options: CliArgs["options"]): CliArgs => ({
	positionals: [],
	options,
});

describe("CLI argument validation", () => {
	it("validates positive integer bounds", () => {
		expect(positiveInt(args({}), "page-size", 5, 10)).toBe(5);
		expect(() =>
			positiveInt(args({ "page-size": "11" }), "page-size", 5, 10),
		).toThrow(UsageError);
	});
});
