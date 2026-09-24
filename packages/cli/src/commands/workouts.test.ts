import { execute } from "./index.js";
import {
	asCommandOperations,
	commandArgs,
	commandClient,
	commandOperation,
} from "./test-support.js";
import { describe, expect, it } from "vitest";

describe("workout commands", () => {
	it("keeps paginated list output and forwards the requested page", async () => {
		const list = commandOperation("workouts.list", {
			items: [{ id: "w1", title: "Push" }],
			page: 2,
			pageCount: 3,
		});
		const operations = asCommandOperations({ workouts: { list } });

		await expect(
			execute(
				commandArgs("workouts", "list", [], { page: "2", "page-size": "8" }),
				commandClient(),
				undefined,
				undefined,
				operations,
			),
		).resolves.toEqual({
			page: 2,
			page_count: 3,
			workouts: [{ id: "w1", title: "Push" }],
		});
		expect(list.effect).toHaveBeenCalledWith(
			{ page: 2, pageSize: 8 },
			undefined,
		);
	});
});
