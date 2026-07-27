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
	title: "Push",
	startTime: "2024-01-01T10:00:00Z",
	endTime: "2024-01-01T11:00:00Z",
	exercises: [
		{
			exerciseTemplateId: "exercise-1",
			sets: [{ type: "normal", weightKg: 50, reps: 5 }],
		},
	],
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
				async (source) => {
					expect(source).toBe("-");
					return JSON.stringify(workout);
				},
			);
			expect(file).toEqual(inline);
			expect(stdin).toEqual(inline);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("reports source, JSON, and schema failures as usage errors", async () => {
		const reader: DataSourceReader = async () => {
			throw new Error("missing");
		};
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
				z.object({ outer: z.object({ inner: z.string() }).strict() }).strict(),
			),
		).rejects.toThrow(/--data\.outer\.inner/);
	});

	it.each([
		["top-level", { ...workout, extra: true }],
		[
			"exercise",
			{
				...workout,
				exercises: [{ ...workout.exercises[0], extra: true }],
			},
		],
		[
			"set",
			{
				...workout,
				exercises: [
					{ ...workout.exercises[0], sets: [{ type: "normal", extra: true }] },
				],
			},
		],
		[
			"repRange",
			{
				title: "Routine",
				exercises: [
					{
						exerciseTemplateId: "exercise-1",
						sets: [{ type: "normal", repRange: { start: 5, extra: true } }],
					},
				],
			},
		],
	] as const)("rejects unknown %s keys", async (name, value) => {
		if (name === "repRange") {
			await expect(
				loadMutationInput(JSON.stringify(value), createRoutineInputSchema),
			).rejects.toThrow(/--data.*extra/);
			return;
		}
		await expect(
			loadMutationInput(JSON.stringify(value), workoutInputSchema),
		).rejects.toThrow(/--data.*extra/);
	});

	it("uses strict simple-resource schemas", async () => {
		await expect(
			loadMutationInput(
				JSON.stringify({ name: "Strength", extra: true }),
				routineFolderInputSchema,
			),
		).rejects.toThrow(/--data.*extra/);
	});
});
