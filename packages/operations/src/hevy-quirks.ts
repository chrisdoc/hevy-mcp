/**
 * Hevy API behaviors that the generated client cannot express. Keep these
 * constants beside the operations that enforce them so adapters can share
 * the same wording without maintaining a second rule set.
 */

/**
 * PUT /v1/workouts/:workoutId requires is_private, while the GET endpoint
 * never returns the current value — callers must state it explicitly.
 */
export const WORKOUT_PUT_REQUIRES_IS_PRIVATE = {
	/** Error returned when metadata-only updates omit is_private. */
	error:
		"is_private is required when updating workout metadata. " +
		"The Hevy API does not return the current privacy setting on GET, " +
		"so it must be explicitly provided on PUT. Set to true to make the workout private, " +
		"or false to make it public.",
	/** Description clause for update-workout. */
	updateClause:
		"is_private must be supplied explicitly because the Hevy API requires it on PUT",
	/** Description clause for replace-workout-exercises. */
	replaceExercisesClause:
		"is_private must be supplied explicitly and is updated with the request",
} as const;
