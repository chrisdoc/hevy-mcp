import { describe, expect, it } from "vitest";
import {
	INVALID_API_KEY_MESSAGE,
	InvalidHevyApiKeyError,
	NodeCliArgumentError,
	isSafeStartupError,
} from "./startup-errors.js";

describe("safe startup errors", () => {
	it("classifies parser failures without treating arbitrary errors as safe", () => {
		const error = new NodeCliArgumentError(
			"--host and --port can only be used with --transport http.",
		);

		expect(isSafeStartupError(error)).toBe(true);
		expect(error.message).toBe(
			"--host and --port can only be used with --transport http.",
		);
		expect(isSafeStartupError(new Error(error.message))).toBe(false);
		expect(isSafeStartupError(new Error(INVALID_API_KEY_MESSAGE))).toBe(false);
	});

	it.each([401, 403])(
		"classifies an HTTP %s API-key probe failure with the stable message",
		() => {
			const error = new InvalidHevyApiKeyError();

			expect(isSafeStartupError(error)).toBe(true);
			expect(error.message).toBe(INVALID_API_KEY_MESSAGE);
		},
	);
});
