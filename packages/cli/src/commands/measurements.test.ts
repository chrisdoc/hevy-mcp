import { execute } from "./index.js";
import {
	asCommandOperations,
	commandArgs,
	commandClient,
	commandOperation,
	mutationOptions,
} from "./test-support.js";
import { describe, expect, it } from "vitest";

describe("measurement commands", () => {
	it("merges existing values before updating and returns the merged result", async () => {
		const get = commandOperation("bodyMeasurements.get", {
			bodyMeasurement: {
				date: "2024-01-01",
				weight_kg: 80,
				fat_percent: 20,
			},
			date: "2024-01-01",
		});
		const update = commandOperation("bodyMeasurements.update", undefined);
		const operations = asCommandOperations({
			bodyMeasurements: { get, update },
		});

		await expect(
			execute(
				commandArgs(
					"measurements",
					"update",
					["2024-01-01"],
					mutationOptions({
						date: "2024-01-01",
						weight_kg: 81,
						fat_percent: null,
					}),
				),
				commandClient(),
				undefined,
				undefined,
				operations,
			),
		).resolves.toEqual({
			body_measurement: {
				date: "2024-01-01",
				weight_kg: 81,
				fat_percent: 20,
			},
		});
		expect(get.effect).toHaveBeenCalledWith({ date: "2024-01-01" }, undefined);
		expect(update.effect).toHaveBeenCalledWith(
			{ date: "2024-01-01", weight_kg: 81, fat_percent: 20 },
			undefined,
		);
	});
});
