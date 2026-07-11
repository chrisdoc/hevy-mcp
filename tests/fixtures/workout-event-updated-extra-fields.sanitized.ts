/**
 * Sanitized reproduction of the updated-event shape that exposed extra
 * upstream workout fields in PR #594. All values are deterministic placeholders.
 */
export const updatedWorkoutEventWithExtraFieldsFixture = {
	type: "updated",
	workout: {
		id: "fixture-workout-updated-001",
		title: "Sanitized Updated Workout",
		description: null,
		start_time: "2025-01-15T08:00:00Z",
		end_time: "2025-01-15T08:30:00Z",
		created_at: "2025-01-15T08:00:00Z",
		updated_at: "2025-01-15T09:00:00Z",
		exercises: [
			{
				index: 0,
				title: "Sanitized Exercise",
				exercise_template_id: "fixture-template-001",
				notes: null,
				superset_id: null,
				sets: [],
				muscle_group: "fixture-extra-field",
			},
		],
		upstream_only_marker: "must-not-reach-production-output",
	},
} as const;
