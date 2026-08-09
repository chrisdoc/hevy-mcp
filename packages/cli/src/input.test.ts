import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	loadMutationInput,
	readDataSource,
	type DataSourceReader,
} from "./input.js";
import { UsageError } from "./arguments.js";
import {
	createRoutineInputSchema,
	routineFolderInputSchema,
	workoutInputSchema,
} from "@hevy-mcp/core/mutations";

const workout = {
	workout: {
		title: "Push",
		start_time: "2024-01-01T10:00:00Z",
		end_time: "2024-01-01T11:00:00Z",
		exercises: [
			{
				exercise_template_id: "exercise-1",
				sets: [{ type: "normal", weight_kg: 50, reps: 5 }],
			},
		],
	},
};

describe("mutation input sources", () => {
	it("loads equivalent inline, file, and stdin JSON", async () => {
		const inline = await loadMutationInput(
			JSON.stringify(workout),
			workoutInputSchema,
		);
		const directory = await mkdtemp(join(tmpdir(), "hevy-cli-"));
		const path = join(directory, "workout.json");
		try {
			await writeFile(path, JSON.stringify(workout), "utf8");
			const file = await loadMutationInput(
				`@${path}`,
				workoutInputSchema,
				readDataSource,
			);
			const stdin = await loadMutationInput(
				"@-",
				workoutInputSchema,
				(source) => {
					expect(source).toBe("-");
					return Promise.resolve(JSON.stringify(workout));
				},
			);
			expect(file).toEqual(inline);
			expect(stdin).toEqual(inline);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("reports source, JSON, and schema failures as usage errors", async () => {
		const reader: DataSourceReader = () => Promise.reject(new Error("missing"));
		await expect(
			loadMutationInput("@", workoutInputSchema, reader),
		).rejects.toThrow(new UsageError("--data source is required after @"));
		await expect(
			loadMutationInput("@missing", workoutInputSchema, reader),
		).rejects.toThrow(new UsageError('Unable to read --data source "missing"'));
		await expect(loadMutationInput("{", workoutInputSchema)).rejects.toThrow(
			new UsageError("--data must contain valid JSON"),
		);
		await expect(
			loadMutationInput(
				JSON.stringify({ outer: { inner: 1 } }),
				z.strictObject({ outer: z.strictObject({ inner: z.string() }) }),
			),
		).rejects.toThrow(/--data\.outer\.inner/);
	});

	it.each([
		[
			"top-level",
			{ ...workout, extra: true },
			workoutInputSchema,
			/--data.*"extra"/,
		],
		[
			"wrapperless",
			{ ...workout.workout, extra: true },
			workoutInputSchema.shape.workout,
			/--data.*"extra"/,
		],
		[
			"exercise",
			{
				workout: {
					...workout.workout,
					exercises: [{ ...workout.workout.exercises[0], extra: true }],
				},
			},
			workoutInputSchema,
			/--data\.workout\.exercises\.0.*"extra"/,
		],
		[
			"legacy weight alias",
			{
				workout: {
					...workout.workout,
					exercises: [
						{
							...workout.workout.exercises[0],
							sets: [{ type: "normal", weightKg: 50 }],
						},
					],
				},
			},
			workoutInputSchema,
			/--data\.workout\.exercises\.0\.sets\.0.*"weightKg"/,
		],
		[
			"legacy routine field",
			{
				routine: {
					title: "Routine",
					exercises: [
						{
							exercise_template_id: "exercise-1",
							sets: [{ type: "normal", rep_range: { start: 5, extra: true } }],
						},
					],
				},
			},
			createRoutineInputSchema,
			/--data\.routine\.exercises\.0\.sets\.0\.rep_range.*"extra"/,
		],
	] as const)(
		"rejects unknown %s keys",
		async (_name, value, schema, expectedPattern) => {
			await expect(
				loadMutationInput<unknown>(
					JSON.stringify(value),
					schema as z.ZodType<unknown>,
				),
			).rejects.toThrow(expectedPattern);
		},
	);

	it("uses strict API-shaped folder schemas", async () => {
		await expect(
			loadMutationInput(
				JSON.stringify({ routine_folder: { title: "Strength", extra: true } }),
				routineFolderInputSchema,
			),
		).rejects.toThrow(/--data.*extra/);
		await expect(
			loadMutationInput(
				JSON.stringify({ name: "Strength" }),
				routineFolderInputSchema,
			),
		).rejects.toThrow(/--data/);
	});
});
