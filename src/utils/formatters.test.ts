import { describe, expect, it } from "vitest";
import type {
	ExerciseTemplate,
	Routine,
	RoutineFolder,
	Workout,
} from "../generated/client/models";
import {
	calculateDuration,
	formatExerciseTemplate,
	formatRoutine,
	formatRoutineFolder,
	formatWorkout,
} from "./formatters";

describe("Formatters", () => {
	describe("formatWorkout", () => {
		it("should format a workout correctly", () => {
			const workoutId = crypto.randomUUID();
			const workout = {
				id: workoutId,
				created_at: "2025-03-27T07:00:00Z",
				title: "Morning Workout",
				description: "Great session",
				start_time: 1711522800000,
				end_time: 1711526400000,
				exercises: [],
			};

			const result = formatWorkout(workout as Workout);
			expect(result).toEqual({
				id: workoutId,
				title: "Morning Workout",
				description: "Great session",
				startTime: 1711522800000,
				endTime: 1711526400000,
				createdAt: "2025-03-27T07:00:00Z",
				updatedAt: undefined,
				duration: "1h 0m 0s",
				exercises: [],
			});
		});

		it("should format a workout with exercises correctly", () => {
			const workoutId = crypto.randomUUID();
			const workout = {
				id: workoutId,
				created_at: "2025-03-27T07:00:00Z",
				title: "Morning Workout",
				description: "Great session",
				start_time: 1711522800000,
				end_time: 1711526400000,
				exercises: [
					{
						title: "Bench Press",
						notes: "Felt strong today",
						sets: [
							{
								type: "warmup",
								weight_kg: 60,
								reps: 10,
								distance_meters: null,
								duration_seconds: null,
								rpe: 6,
								custom_metric: null,
							},
							{
								type: "normal",
								weight_kg: 80,
								reps: 8,
								distance_meters: null,
								duration_seconds: null,
								rpe: 8,
								custom_metric: null,
							},
						],
					},
				],
			};

			const result = formatWorkout(workout as Workout);
			expect(result).toEqual({
				id: workoutId,
				title: "Morning Workout",
				description: "Great session",
				startTime: 1711522800000,
				endTime: 1711526400000,
				createdAt: "2025-03-27T07:00:00Z",
				updatedAt: undefined,
				duration: "1h 0m 0s",
				exercises: [
					{
						index: undefined,
						name: "Bench Press",
						exerciseTemplateId: undefined,
						notes: "Felt strong today",
						supersetsId: undefined,
						sets: [
							{
								index: undefined,
								type: "warmup",
								weight: 60,
								reps: 10,
								distance: null,
								duration: null,
								rpe: 6,
								customMetric: null,
							},
							{
								index: undefined,
								type: "normal",
								weight: 80,
								reps: 8,
								distance: null,
								duration: null,
								rpe: 8,
								customMetric: null,
							},
						],
					},
				],
			});
		});
	});

	describe("formatRoutine", () => {
		it("should format a routine correctly", () => {
			const routineId = crypto.randomUUID();
			const folderId = 12345;
			const routine = {
				id: routineId,
				title: "Evening Routine",
				folder_id: folderId,
				created_at: "2025-03-26T19:00:00Z",
				updated_at: "2025-03-26T19:30:00Z",
				exercises: [],
			};

			const result = formatRoutine(routine as Routine);
			expect(result).toEqual({
				id: routineId,
				title: "Evening Routine",
				folderId: folderId,
				createdAt: "2025-03-26T19:00:00Z",
				updatedAt: "2025-03-26T19:30:00Z",
				exercises: [],
			});
		});

		it("should format a routine with exercises correctly", () => {
			const routineId = crypto.randomUUID();
			const folderId = 12345;
			const templateId = crypto.randomUUID();
			const routine = {
				id: routineId,
				title: "Evening Routine",
				folder_id: folderId,
				created_at: "2025-03-26T19:00:00Z",
				updated_at: "2025-03-26T19:30:00Z",
				exercises: [
					{
						title: "Squat",
						index: 1,
						exercise_template_id: templateId,
						notes: "Focus on form",
						supersets_id: 1,
						sets: [
							{
								index: 1,
								type: "normal",
								weight_kg: 100,
								reps: 5,
								distance_meters: null,
								duration_seconds: null,
								custom_metric: null,
							},
							{
								index: 2,
								type: "normal",
								weight_kg: 110,
								reps: 3,
								distance_meters: null,
								duration_seconds: null,
								custom_metric: null,
							},
						],
					},
				],
			};

			const result = formatRoutine(routine as Routine);
			expect(result).toEqual({
				id: routineId,
				title: "Evening Routine",
				folderId: folderId,
				createdAt: "2025-03-26T19:00:00Z",
				updatedAt: "2025-03-26T19:30:00Z",
				exercises: [
					{
						name: "Squat",
						index: 1,
						exerciseTemplateId: templateId,
						notes: "Focus on form",
						supersetId: 1,
						restSeconds: undefined,
						sets: [
							{
								index: 1,
								type: "normal",
								weight: 100,
								reps: 5,
								distance: null,
								duration: null,
								customMetric: null,
							},
							{
								index: 2,
								type: "normal",
								weight: 110,
								reps: 3,
								distance: null,
								duration: null,
								customMetric: null,
							},
						],
					},
				],
			});
		});
	});

	describe("formatRoutineFolder", () => {
		it("should format a routine folder correctly", () => {
			const folderId = 12345;
			const folder = {
				id: folderId,
				title: "Cardio",
				created_at: "2025-03-25T10:00:00Z",
				updated_at: "2025-03-25T10:15:00Z",
			};

			const result = formatRoutineFolder(folder as RoutineFolder);
			expect(result).toEqual({
				id: folderId,
				title: "Cardio",
				createdAt: "2025-03-25T10:00:00Z",
				updatedAt: "2025-03-25T10:15:00Z",
			});
		});
	});

	describe("calculateDuration", () => {
		it("should calculate duration correctly", () => {
			const startTime = "2025-03-27T07:00:00Z";
			const endTime = "2025-03-27T08:30:15Z";
			const result = calculateDuration(startTime, endTime);
			expect(result).toBe("1h 30m 15s");
		});

		it("should return 'Unknown duration' for invalid inputs", () => {
			expect(calculateDuration(null, "2025-03-27T08:00:00Z")).toBe(
				"Unknown duration",
			);
			expect(calculateDuration("2025-03-27T07:00:00Z", undefined)).toBe(
				"Unknown duration",
			);
			expect(calculateDuration(null, null)).toBe("Unknown duration");
		});
	});

	describe("formatExerciseTemplate", () => {
		it("should format an exercise template correctly", () => {
			const templateId = crypto.randomUUID();
			const template = {
				id: templateId,
				title: "Bench Press",
				type: "barbell",
				primary_muscle_group: "chest",
				secondary_muscle_groups: ["triceps", "shoulders"],
				is_custom: false,
			};

			const result = formatExerciseTemplate(template as ExerciseTemplate);
			expect(result).toEqual({
				id: templateId,
				title: "Bench Press",
				type: "barbell",
				primaryMuscleGroup: "chest",
				secondaryMuscleGroups: ["triceps", "shoulders"],
				isCustom: false,
			});
		});

		it("should handle missing optional fields", () => {
			const templateId = crypto.randomUUID();
			const template = {
				id: templateId,
				title: "Custom Exercise",
				type: "bodyweight",
				primary_muscle_group: "full_body",
				is_custom: true,
			};

			const result = formatExerciseTemplate(template as ExerciseTemplate);
			expect(result).toEqual({
				id: templateId,
				title: "Custom Exercise",
				type: "bodyweight",
				primaryMuscleGroup: "full_body",
				secondaryMuscleGroups: undefined,
				isCustom: true,
			});
		});
	});
});
