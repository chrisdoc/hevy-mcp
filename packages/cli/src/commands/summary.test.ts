import { execute } from "./index.js";
import {
	asCommandOperations,
	commandArgs,
	commandClient,
	commandOperation,
} from "./test-support.js";
import { describe, expect, it } from "vitest";

describe("summary command", () => {
	it("projects the training summary using the operation period", async () => {
		const summary = commandOperation("workflows.trainingSummary", {
			period: {
				start_date: "2024-01-24",
				end_date: "2024-02-01",
				weeks: 1,
			},
			workouts: {
				count: 2,
				total_duration_seconds: 3_600,
				exercise_count: 3,
				set_count: 6,
			},
			workflow: { pagination: { workouts: 2 } },
		});
		const operations = asCommandOperations({
			workflows: { trainingSummary: summary },
		});
		await expect(
			execute(
				commandArgs("summary", undefined, [], { weeks: "1" }),
				commandClient(),
				undefined,
				operations,
			),
		).resolves.toMatchObject({
			weeks: 1,
			start_date: "2024-01-24",
			end_date: "2024-02-01",
			workout_count: 2,
			total_volume_kg: 0,
			pages_scanned: 2,
			complete: true,
		});
		expect(summary.effect).toHaveBeenCalledWith({ weeks: 1 }, undefined);
	});
});
