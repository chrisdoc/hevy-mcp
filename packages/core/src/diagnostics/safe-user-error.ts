export class SafeUserError extends Error {
	public readonly safeForUser = true;

	public constructor(message: string) {
		super(message);
		this.name = "SafeUserError";
	}
}
