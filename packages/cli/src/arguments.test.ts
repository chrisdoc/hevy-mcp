import { describe, expect, it } from "vitest";
import { parseArguments, UsageError, positiveInt } from "./arguments.js";

describe("CLI arguments", () => {
	it("parses commands and options", () => {
		const parsed = parseArguments([
			"workouts",
			"list",
			"--page",
			"2",
			"--json",
		]);
		expect(parsed.command).toBe("workouts");
		expect(parsed.subcommand).toBe("list");
		expect(parsed.options).toEqual({ page: "2", json: true });
	});
	it("rejects credential-like options and invalid bounds", () => {
		expect(() => parseArguments(["user", "--api-key", "secret"])).toThrow(
			UsageError,
		);
		expect(() =>
			positiveInt(parseArguments(["--page-size", "11"]), "page-size", 5, 10),
		).toThrow(UsageError);
	});
});
