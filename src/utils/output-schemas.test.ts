import { describe, expect, it } from "vitest";
import type {
	BodyMeasurement,
	ExerciseHistoryEntry,
	ExerciseTemplate,
	Routine,
	RoutineFolder,
	Workout,
} from "../generated/client/types/index.js";
import {
	formatBodyMeasurement,
	formatExerciseHistoryEntry,
	formatExerciseTemplate,
	formatRoutine,
	formatRoutineFolder,
	formatWorkout,
} from "./formatters.js";
import {
	type FormattedRoutine,
	type FormattedWorkout,
	formattedBodyMeasurementSchema,
	formattedExerciseHistoryEntrySchema,
	formattedExerciseTemplateSchema,
	formattedRoutineFolderSchema,
	formattedRoutineExerciseSchema,
	formattedRoutineSchema,
	formattedWorkoutSchema,
	userOutputSchema,
	workoutEventsOutputSchema,
} from "./output-schemas.js";

describe("formatted output schemas", () => {
	it("accepts every formatter output", () => {
		const workout: Workout = {
			id: "workout-1",
			title: "Workout",
			description: "Training session",
			start_time: "2025-01-01T10:00:00Z",
			end_time: "2025-01-01T11:00:00Z",
			exercises: [],
		};
		const routine: Routine = {
			id: "routine-1",
			title: "Routine",
			folder_id: null,
			exercises: [],
		};
		const folder: RoutineFolder = { id: 1, title: "Folder" };
		const template: ExerciseTemplate = {
			id: "template-1",
			title: "Bench Press",
			type: "weight_reps",
			primary_muscle_group: "chest",
			secondary_muscle_groups: [],
			is_custom: false,
		};
		const history: ExerciseHistoryEntry = {
			workout_id: "workout-1",
			exercise_template_id: "template-1",
			weight_kg: null,
		};
		const measurement: BodyMeasurement = { date: "2025-01-01" };

		expect(() =>
			formattedWorkoutSchema.parse(formatWorkout(workout)),
		).not.toThrow();
		expect(() =>
			formattedRoutineSchema.parse(formatRoutine(routine)),
		).not.toThrow();
		expect(() =>
			formattedRoutineFolderSchema.parse(formatRoutineFolder(folder)),
		).not.toThrow();
		expect(() =>
			formattedExerciseTemplateSchema.parse(formatExerciseTemplate(template)),
		).not.toThrow();
		expect(() =>
			formattedExerciseHistoryEntrySchema.parse(
				formatExerciseHistoryEntry(history),
			),
		).not.toThrow();
		expect(() =>
			formattedBodyMeasurementSchema.parse(formatBodyMeasurement(measurement)),
		).not.toThrow();
	});

	it("preserves nullable workout and routine formatter fields", () => {
		const workout: FormattedWorkout = {
			description: null,
			duration: "1h 0m 0s",
			exercises: [{ notes: null }],
		};
		const routine: FormattedRoutine = {
			exercises: [{ notes: null }],
		};

		expect(formattedWorkoutSchema.parse(workout)).toEqual(workout);
		expect(formattedRoutineSchema.parse(routine)).toEqual(routine);
	});

	it("accepts numeric workout timestamps", () => {
		const workout = {
			startTime: 1_735_729_200,
			endTime: 1_735_732_800,
			duration: "1h 0m 0s",
		};

		expect(formattedWorkoutSchema.parse(workout)).toEqual(workout);
	});

	it.each(["60", 60, null])(
		"accepts routine restSeconds value %s",
		(restSeconds) => {
			const exercise = { restSeconds };

			expect(formattedRoutineExerciseSchema.parse(exercise)).toEqual(exercise);
		},
	);

	it("uses formatted schemas for events and generated contract for user info", () => {
		expect(() =>
			workoutEventsOutputSchema.events.parse([
				{ type: "deleted", id: "workout-1", deletedAt: "2025-01-01" },
				{
					type: "updated",
					workout: formatWorkout({
						id: "workout-1",
						title: "Workout",
						start_time: "2025-01-01T10:00:00Z",
						end_time: "2025-01-01T11:00:00Z",
						exercises: [],
					}),
				},
			]),
		).not.toThrow();
		expect(() =>
			userOutputSchema.user.parse({
				id: "user-1",
				name: "Chris",
				url: "https://hevy.com/user/chris",
			}),
		).not.toThrow();
	});
});
