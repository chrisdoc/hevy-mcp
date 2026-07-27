import { describe, expect, it } from "vitest";
import {
	parseExerciseHistoryOptions,
	parseExerciseId,
	parseMeasurementDate,
	parsePagination,
	parseSearchMaxPages,
	parseSearchQuery,
	parseWeeks,
	parseWorkoutEventsOptions,
	parseWorkoutId,
	UsageError,
	requireMutationConfirmation,
	type CliArgs,
} from "./arguments.js";

const args = (
	options: CliArgs["options"] = {},
	positionals: string[] = [],
): CliArgs => ({ positionals, options });
const invalid = (callback: () => unknown, message: string) => {
	expect(callback).toThrow(UsageError);
	expect(callback).toThrow(message);
};

describe("CLI argument validation", () => {
	it("coerces pagination and preserves defaults", () => {
		expect(parsePagination(args())).toEqual({ page: 1, pageSize: 5 });
		expect(parsePagination(args({ page: "1", "page-size": "10" }))).toEqual({
			page: 1,
			pageSize: 10,
		});
	});

	it("rejects invalid and out-of-range pagination", () => {
		for (const page of ["0", "-1", "1.5", "nope"])
			invalid(
				() => parsePagination(args({ page })),
				"--page must be a positive integer",
			);
		for (const pageSize of ["0", "-1", "1.5", "nope", "11"])
			invalid(
				() => parsePagination(args({ "page-size": pageSize })),
				"--page-size must be a positive integer no greater than 10",
			);
	});

	it("validates event timestamps and maps options once", () => {
		expect(parseWorkoutEventsOptions(args())).toEqual({
			page: 1,
			pageSize: 5,
			since: "1970-01-01T00:00:00Z",
		});
		expect(
			parseWorkoutEventsOptions(
				args({
					page: "2",
					"page-size": "10",
					since: "2024-01-01T00:00:00+01:00",
				}),
			),
		).toEqual({ page: 2, pageSize: 10, since: "2024-01-01T00:00:00+01:00" });
		invalid(
			() => parseWorkoutEventsOptions(args({ since: "not-a-date" })),
			"--since must be an ISO timestamp",
		);
	});

	it("maps and validates optional exercise history dates", () => {
		expect(parseExerciseHistoryOptions()).toEqual({});
		expect(
			parseExerciseHistoryOptions(
				args({ "start-date": "2024-01-01T00:00:00+01:00" }),
			),
		).toEqual({ start_date: "2024-01-01T00:00:00+01:00" });
		expect(
			parseExerciseHistoryOptions(
				args({
					"start-date": "2024-01-01T00:00:00Z",
					"end-date": "2024-02-01T00:00:00Z",
				}),
			),
		).toEqual({
			start_date: "2024-01-01T00:00:00Z",
			end_date: "2024-02-01T00:00:00Z",
		});
		invalid(
			() => parseExerciseHistoryOptions(args({ "start-date": "2024-01-01" })),
			"--start-date must be an ISO timestamp",
		);
	});

	it("validates safe resource IDs and search terms", () => {
		expect(parseWorkoutId(" workout-1 ")).toBe("workout-1");
		expect(parseExerciseId(" exercise-1 ")).toBe("exercise-1");
		for (const value of [undefined, "", "  ", "a/b", "a?b"])
			invalid(() => parseWorkoutId(value), "Workout ID");
		for (const value of [undefined, "", "  ", "a/b", "a?b"])
			invalid(() => parseSearchQuery(value), "Search query");
		expect(parseSearchQuery(" Bench Press ")).toBe("bench press");
		expect(parseSearchMaxPages(args())).toBe(10);
		expect(parseSearchMaxPages(args({ "max-pages": "25" }))).toBe(25);
		invalid(
			() => parseSearchMaxPages(args({ "max-pages": "101" })),
			"--max-pages must be a positive integer no greater than 100",
		);
	});

	it("accepts real calendar dates and rejects impossible dates", () => {
		expect(parseMeasurementDate("2024-02-29")).toBe("2024-02-29");
		invalid(
			() => parseMeasurementDate("2023-02-29"),
			"Measurement date must be an ISO date",
		);
		invalid(
			() => parseMeasurementDate("2024-02-30"),
			"Measurement date must be an ISO date",
		);
	});

	it("coerces positive integer summary weeks", () => {
		expect(parseWeeks(args())).toBe(1);
		expect(parseWeeks(args({ weeks: "10" }))).toBe(10);
		for (const weeks of [
			"0",
			"-1",
			"1.5",
			"nope",
			"999999999999999999999",
			"521",
		])
			invalid(
				() => parseWeeks(args({ weeks })),
				"--weeks must be a positive integer no greater than 520",
			);
	});
});

describe("mutation confirmation", () => {
	it("requires an explicit true --yes flag", () => {
		expect(() =>
			requireMutationConfirmation(args({ yes: true })),
		).not.toThrow();
		for (const yes of [undefined, false])
			expect(() =>
				requireMutationConfirmation(args(yes === undefined ? {} : { yes })),
			).toThrow("Mutation requires --yes");
	});
});
