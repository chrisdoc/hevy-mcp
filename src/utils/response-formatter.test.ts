import { z } from "zod";
import { describe, expect, it } from "vitest";

import type { Routine, Workout } from "../generated/client/types/index.js";
import {
	bodyMeasurementsResponse,
	compactRoutinesResponse,
	createRoutineResponse,
	defineJsonResponseContract,
	defineStructuredResponseContract,
	exerciseHistoryResponse,
	exerciseTemplatesResponse,
	respond,
	routineFoldersResponse,
	routinesResponse,
	trainingSummaryResponse,
	workoutResponse,
	workoutsResponse,
} from "./response-formatter.js";
import type {
	CompactRoutinesResult,
	TrainingSummaryResult,
} from "./response-formatter.js";

describe("response contracts", () => {
	it("returns canonical schema output and strips unknown fields", () => {
		const contract = defineStructuredResponseContract({
			outputSchema: {
				item: z.object({ id: z.string(), count: z.coerce.number() }),
			},
			normalize: () => ({
				item: { id: "item-1", count: "3", ignored: true },
				ignoredWrapper: true,
			}),
			legacyJson: ({ item }) => item,
		});

		expect(respond(contract, undefined)).toEqual({
			content: [
				{
					type: "text",
					text: JSON.stringify({ id: "item-1", count: 3 }, null, 2),
				},
			],
			structuredContent: { item: { id: "item-1", count: 3 } },
		});
	});

	it("fails locally when normalized structured output is invalid", () => {
		const contract = defineStructuredResponseContract({
			outputSchema: { count: z.number().int() },
			normalize: () => ({ count: "not-a-number" }),
			legacyJson: (output) => output,
		});

		expect(() => respond(contract, undefined)).toThrow();
	});

	it("keeps structured wrappers while projecting legacy text unwrapped", () => {
		const workout: Workout = {
			id: "workout-1",
			title: "Workout",
			start_time: "2025-01-01T10:00:00Z",
			end_time: "2025-01-01T11:00:00Z",
			exercises: [],
		};
		const response = respond(workoutsResponse, [workout]);
		const structured = z
			.object(workoutsResponse.outputSchema)
			.parse(response.structuredContent);

		expect(structured).toMatchObject({
			workouts: [{ id: "workout-1", duration: "1h 0m 0s" }],
		});
		expect(JSON.parse(response.content[0].text)).toEqual(structured.workouts);
	});

	it("preserves empty-list and null result messages", () => {
		expect(respond(workoutsResponse, [])).toEqual({
			content: [
				{
					type: "text",
					text: "No workouts found for the specified parameters",
				},
			],
			structuredContent: { workouts: [] },
		});
		expect(
			respond(workoutResponse, {
				workout: null,
				workoutId: "missing",
			}),
		).toEqual({
			content: [{ type: "text", text: "Workout with ID missing not found" }],
			structuredContent: { workout: null },
		});
	});

	it.each([
		{
			name: "workouts",
			render: () => respond(workoutsResponse, undefined),
			structuredContent: { workouts: [] },
			text: "No workouts found for the specified parameters",
		},
		{
			name: "routines",
			render: () => respond(routinesResponse, undefined),
			structuredContent: { routines: [] },
			text: "No routines found for the specified parameters",
		},
		{
			name: "exercise templates",
			render: () => respond(exerciseTemplatesResponse, undefined),
			structuredContent: { exerciseTemplates: [] },
			text: "No exercise templates found for the specified parameters",
		},
		{
			name: "exercise history",
			render: () =>
				respond(exerciseHistoryResponse, {
					history: undefined,
					exerciseTemplateId: "template-1",
				}),
			structuredContent: { exerciseHistory: [] },
			text: "No exercise history found for template template-1",
		},
		{
			name: "routine folders",
			render: () => respond(routineFoldersResponse, undefined),
			structuredContent: { routineFolders: [] },
			text: "No routine folders found for the specified parameters",
		},
		{
			name: "body measurements",
			render: () => respond(bodyMeasurementsResponse, undefined),
			structuredContent: { bodyMeasurements: [] },
			text: "No body measurements found for the specified parameters",
		},
	])(
		"normalizes undefined $name data to its canonical empty response",
		({ render, structuredContent, text }) => {
			expect(render()).toEqual({
				content: [{ type: "text", text }],
				structuredContent,
			});
		},
	);

	it("supports JSON-only and text-only contracts without structured content", () => {
		const jsonContract = defineJsonResponseContract((value: unknown) => ({
			json: value,
		}));
		const textContract = defineJsonResponseContract((message: string) => ({
			text: message,
		}));

		expect(respond(jsonContract, undefined)).toEqual({
			content: [{ type: "text", text: "null" }],
		});
		expect(respond(textContract, "done")).toEqual({
			content: [{ type: "text", text: "done" }],
		});
	});

	it("preserves the routine rep-range warning as a second content block", () => {
		const routine: Routine = {
			id: "routine-1",
			title: "Routine",
			exercises: [],
		};
		const response = respond(createRoutineResponse, {
			routine,
			usesRepRanges: true,
		});

		expect(response.content).toHaveLength(2);
		expect(JSON.parse(response.content[0].text)).toMatchObject({
			id: "routine-1",
		});
		expect(response.content[1].text).toContain("rep ranges");
		expect(response.content[1].text).toContain("issues/261");
		expect(response.structuredContent).toBeUndefined();
	});

	it("renders empty and populated workflow responses", () => {
		const emptySummary: TrainingSummaryResult = {
			period: { startDate: "2026-07-01", endDate: "2026-07-16", weeks: 2 },
			workouts: {
				count: 0,
				totalDurationSeconds: 0,
				exerciseCount: 0,
				setCount: 0,
				uniqueExerciseTemplateIds: [],
				sessions: [],
			},
			bodyMeasurements: {
				count: 0,
				latest: null,
				earliest: null,
				weightChangeKg: null,
			},
			workflow: {
				name: "training-summary",
				pagination: { workouts: 0, bodyMeasurements: 0 },
				cacheStatus: "not-used",
				itemsScanned: 0,
			},
		};
		const emptyResponse = respond(trainingSummaryResponse, emptySummary);
		expect(emptyResponse.content[0]?.text).toBe(
			"No workouts or body measurements found for the specified period",
		);
		expect(emptyResponse.structuredContent).toEqual(emptySummary);

		const populatedResponse = respond(trainingSummaryResponse, {
			...emptySummary,
			workouts: {
				...emptySummary.workouts,
				count: 1,
			},
		});
		expect(JSON.parse(populatedResponse.content[0]?.text ?? "null")).toEqual(
			populatedResponse.structuredContent,
		);
	});

	it("renders empty and populated compact routine responses", () => {
		const empty: CompactRoutinesResult = {
			routines: [],
			workflow: {
				name: "routine-discovery",
				pagination: { routines: 0 },
				cacheStatus: "not-used",
				itemsScanned: 0,
			},
		};
		const emptyResponse = respond(compactRoutinesResponse, empty);
		expect(emptyResponse.content[0]?.text).toBe(
			"No routines found matching the query",
		);

		const populated = respond(compactRoutinesResponse, {
			...empty,
			routines: [
				{
					id: "routine-1",
					title: "Push",
					folderId: null,
					exerciseCount: 1,
					setCount: 2,
				},
			],
		});
		expect(JSON.parse(populated.content[0]?.text ?? "null")).toEqual([
			{
				id: "routine-1",
				title: "Push",
				folderId: null,
				exerciseCount: 1,
				setCount: 2,
			},
		]);
	});
});
