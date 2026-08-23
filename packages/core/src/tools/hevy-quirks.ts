/**
 * Hevy API behaviors the generated client cannot express. One home per
 * resource quirk: the runtime rule (enforced in mutation-semantics), the
 * user-facing error, and the tool-description clauses derive from these
 * constants so wording and enforcement cannot drift apart.
 */

/**
 * PUT /v1/workouts/:workoutId requires is_private, while the GET endpoint
 * never returns the current value — callers must state it explicitly.
 */
export const WORKOUT_PUT_REQUIRES_IS_PRIVATE = {
	/** Error thrown when metadata-only updates omit is_private. */
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
