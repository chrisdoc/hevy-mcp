import { execute } from "./index.js";
import {
	asCommandOperations,
	commandArgs,
	commandClient,
	commandOperation,
} from "./test-support.js";
import { describe, expect, it } from "vitest";

describe("exercise template commands", () => {
	it("keeps search limits and result metadata in the command output", async () => {
		const matches = [{ id: "e1", title: "Bench Press" }];
		const search = commandOperation("templates.search", {
			matches,
			pages: 2,
			itemsScanned: 14,
			complete: false,
		});
		const operations = asCommandOperations({ templates: { search } });

		await expect(
			execute(
				commandArgs("exercises", "search", ["BENCH"], { "max-pages": "2" }),
				commandClient(),
				undefined,
				undefined,
				operations,
			),
		).resolves.toEqual({
			query: "bench",
			matches,
			pages_scanned: 2,
			complete: false,
		});
		expect(search.effect).toHaveBeenCalledWith(
			{ query: "bench", maxPages: 2 },
			undefined,
		);
	});
});
