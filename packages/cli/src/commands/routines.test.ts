import { execute } from "./index.js";
import {
	asCommandOperations,
	commandArgs,
	commandClient,
	commandOperation,
	mutationOptions,
} from "./test-support.js";
import { describe, expect, it } from "vitest";

describe("routine commands", () => {
	it("preserves the routine envelope and rep-range output", async () => {
		const create = commandOperation("routines.create", {
			routine: { id: "r1", title: "Strength" },
			usesRepRanges: true,
		});
		const operations = asCommandOperations({ routines: { create } });
		const data = {
			routine: {
				title: "Strength",
				exercises: [
					{
						exercise_template_id: "exercise-1",
						sets: [{ type: "normal", reps: 5 }],
					},
				],
			},
		};

		await expect(
			execute(
				commandArgs("routines", "create", [], mutationOptions(data)),
				commandClient(),
				undefined,
				undefined,
				operations,
			),
		).resolves.toEqual({
			routine: { id: "r1", title: "Strength" },
			uses_rep_ranges: true,
		});
		expect(create.effect).toHaveBeenCalledWith(data, undefined);
	});
});
