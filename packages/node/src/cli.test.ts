import { describe, expect, it, vi } from "vitest";
import { MissingHevyApiKeyError } from "./utils/config.js";
import {
	handleFatalStartupError,
	InvalidHevyApiKeyError,
	NodeCliArgumentError,
} from "./utils/startup-errors.js";

describe("CLI startup failures", () => {
	it("prints the typed parser message and exits before transport startup", async () => {
		const log = vi.fn();
		const exit = vi.fn();
		const flush = vi.fn().mockResolvedValue(undefined);

		const error = new NodeCliArgumentError(
			"--host and --port can only be used with --transport http.",
		);

		await handleFatalStartupError(error, { log, exit, flush });

		expect(exit).toHaveBeenCalledWith(1);
		expect(log).toHaveBeenCalledWith(
			"--host and --port can only be used with --transport http.",
		);
		expect(flush).toHaveBeenCalled();
	});

	it.each([401, 403])(
		"prints the stable invalid-key message for an HTTP %s startup probe",
		async () => {
			const log = vi.fn();
			const exit = vi.fn();
			const flush = vi.fn().mockResolvedValue(undefined);

			const error = new InvalidHevyApiKeyError();

			await handleFatalStartupError(error, { log, exit, flush });

			expect(exit).toHaveBeenCalledWith(1);
			expect(log).toHaveBeenCalledWith(
				"HEVY_API_KEY is invalid or expired. Please check your API key in the Hevy app under Settings > API Key.",
			);
			expect(flush).toHaveBeenCalled();
		},
	);

	it("keeps arbitrary startup errors behind the safe diagnostic projection", async () => {
		const log = vi.fn();
		const exit = vi.fn();
		const flush = vi.fn().mockResolvedValue(undefined);
		const secret = "arbitrary-startup-secret";

		const error = new Error(
			`Connection failed with token ${secret} which requires attention`,
		);

		await handleFatalStartupError(error, { log, exit, flush });

		expect(exit).toHaveBeenCalledWith(1);
		expect(log).toHaveBeenCalledWith(
			"Fatal error in main()",
			expect.objectContaining({ category: "Error" }),
		);
		const loggedArgs = JSON.stringify(log.mock.calls);
		expect(loggedArgs).not.toContain(secret);
		expect(loggedArgs).not.toContain("requires");
	});

	it("prints missing api key error directly", async () => {
		const log = vi.fn();
		const exit = vi.fn();
		const flush = vi.fn().mockResolvedValue(undefined);

		const error = new MissingHevyApiKeyError();

		await handleFatalStartupError(error, { log, exit, flush });

		expect(exit).toHaveBeenCalledWith(1);
		expect(log).toHaveBeenCalledWith(error.message);
	});

	it("preserves fatal exit even when telemetry flush rejects", async () => {
		const log = vi.fn();
		const exit = vi.fn();
		const flush = vi.fn().mockRejectedValue(new Error("flush failed"));

		const error = new InvalidHevyApiKeyError();

		await handleFatalStartupError(error, { log, exit, flush });

		expect(exit).toHaveBeenCalledWith(1);
	});
});
