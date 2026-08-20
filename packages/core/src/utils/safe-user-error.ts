export const WORKOUT_METADATA_PRIVACY_REQUIRED_ERROR =
	"is_private is required when updating workout metadata. " +
	"The Hevy API does not return the current privacy setting on GET, " +
	"so it must be explicitly provided on PUT. Set to true to make the workout private, " +
	"or false to make it public.";

export class SafeUserError extends Error {
	public readonly safeForUser = true;

	public constructor(message: string) {
		super(message);
		this.name = "SafeUserError";
	}
}