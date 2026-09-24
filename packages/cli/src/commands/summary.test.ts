import { execute } from "./index.js";
import {
	asCommandOperations,
	commandArgs,
	commandClient,
	commandOperation,
} from "./test-support.js";
import { describe, expect, it } from "vitest";

describe("summary command", () => {
	it("projects the training summary using the injected clock", async () => {
		const summary = commandOperation("workflows.trainingSummary", {
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
		const now = () => new Date("2024-02-01T00:00:00.000Z");

		await expect(
			execute(
				commandArgs("summary", undefined, [], { weeks: "1" }),
				commandClient(),
				now,
				undefined,
				operations,
			),
		).resolves.toMatchObject({
			weeks: 1,
			start_date: "2024-01-25T00:00:00.000Z",
			end_date: "2024-02-01T00:00:00.000Z",
			workout_count: 2,
			total_volume_kg: 0,
			pages_scanned: 2,
			complete: true,
		});
		expect(summary.effect).toHaveBeenCalledWith({ weeks: 1 }, undefined);
	});
});
