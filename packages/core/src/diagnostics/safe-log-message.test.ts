import { describe, expect, it } from "vitest";
import { HevyHttpError } from "@hevy-mcp/hevy-client";
import { WorkoutPrivacyError } from "@hevy-mcp/operations";
import { z } from "zod";

import {
	formatSafeErrorLogMessage,
	isClientTransportError,
	isSafeErrorMessage,
} from "./safe-log-message.js";

const SECRET = "secret-token-abcdef123456";

describe("safe-log-message", () => {
	describe("isSafeErrorMessage and isClientTransportError", () => {
		it("identifies MCP transport protocol rejections as safe and client errors", () => {
			const unsupported = new Error(
				"Bad Request: Unsupported protocol version: 2025-11-25 (supported versions: 2025-11-25)",
			);
			expect(isSafeErrorMessage(unsupported.message)).toBe(true);
			expect(isClientTransportError(unsupported)).toBe(true);

			const parseErr = new Error("Parse error: Invalid JSON-RPC message");
			expect(isSafeErrorMessage(parseErr.message)).toBe(true);
			expect(isClientTransportError(parseErr)).toBe(true);

			const notAcceptable = new Error(
				"Not Acceptable: Client must accept both application/json and text/event-stream",
			);
			expect(isSafeErrorMessage(notAcceptable.message)).toBe(true);
			expect(isClientTransportError(notAcceptable)).toBe(true);

			const syntax = new SyntaxError("Unexpected token in JSON at position 0");
			expect(isClientTransportError(syntax)).toBe(true);
		});

		it("rejects generic non-JSON SyntaxError from client transport classification", () => {
			const syntax = new SyntaxError("Unexpected identifier 'foo'");
			expect(isClientTransportError(syntax)).toBe(false);
		});

		it("rejects untrusted or secret-bearing messages", () => {
			const hostile = new Error(`secret key ${SECRET}`);
			expect(isSafeErrorMessage(hostile.message)).toBe(false);
			expect(isClientTransportError(hostile)).toBe(false);
		});
	});

	describe("formatSafeErrorLogMessage", () => {
		it("sanitizes credential-shaped or URL-shaped protocol version values", () => {
			const withSecret = new Error(
				`Bad Request: Unsupported protocol version: ${SECRET} (supported versions: 2025-11-25)`,
			);
			const formattedSecret = formatSafeErrorLogMessage(
				"transport",
				withSecret,
			);
			expect(formattedSecret).not.toContain(SECRET);
			expect(formattedSecret).toBe(
				"transport: Bad Request: Unsupported protocol version: [invalid-or-unsupported] (supported versions: 2025-11-25)",
			);

			const withQuery = new Error(
				"Bad Request: Unsupported protocol version: /mcp?session_id=private (supported versions: 2025-11-25)",
			);
			const formattedQuery = formatSafeErrorLogMessage("transport", withQuery);
			expect(formattedQuery).not.toContain("session_id");
			expect(formattedQuery).toBe(
				"transport: Bad Request: Unsupported protocol version: [invalid-or-unsupported] (supported versions: 2025-11-25)",
			);

			const withValidVersion = new Error(
				"Bad Request: Unsupported protocol version: 2024-10-07 (supported versions: 2025-11-25)",
			);
			const formattedValid = formatSafeErrorLogMessage(
				"transport",
				withValidVersion,
			);
			expect(formattedValid).toBe(
				"transport: Bad Request: Unsupported protocol version: 2024-10-07 (supported versions: 2025-11-25)",
			);
		});

		it("does not expose credentials placed inside error.name", () => {
			const err = new TypeError("Cannot read properties of undefined");
			// Hostile or custom error name containing a secret
			err.name = `HostileSecret_${SECRET}`;
			const formatted = formatSafeErrorLogMessage("test", err);
			expect(formatted).not.toContain(SECRET);
			expect(formatted).toBe(
				"test: TypeError: Cannot read properties of undefined",
			);
		});

		it("discards raw payload fragments from JSON SyntaxError", () => {
			const rawSnippet = `{"apiKey": "${SECRET}"}`;
			const syntax = new SyntaxError(
				`Unexpected token in JSON at position 10: ${rawSnippet}`,
			);
			const formatted = formatSafeErrorLogMessage("json-parser", syntax);
			expect(formatted).not.toContain(SECRET);
			expect(formatted).toBe("json-parser: SyntaxError: Invalid JSON syntax");
		});

		it("discards user-derived refine messages in ZodError and emits field codes", () => {
			const schema = z.object({
				apiKey: z.string().refine(() => false, {
					message: `Leaked secret token: ${SECRET}`,
				}),
			});
			const result = schema.safeParse({ apiKey: "bad-val" });
			expect(result.success).toBe(false);
			if (!result.success) {
				const formatted = formatSafeErrorLogMessage("validation", result.error);
				expect(formatted).not.toContain(SECRET);
				expect(formatted).toBe("validation: Validation error (apiKey: custom)");
			}
		});

		it("includes HTTP status and endpoint for real HevyHttpError instances", () => {
			const error = new HevyHttpError("Hevy API request failed (HTTP 500)", {
				status: 500,
				code: "HEVY_RETRY_EXHAUSTED",
				method: "GET",
				endpoint: "/v1/workouts",
			});
			const formatted = formatSafeErrorLogMessage("hevy-api", error);
			expect(formatted).toBe(
				"hevy-api: HevyHttpError (HEVY_RETRY_EXHAUSTED) (HTTP 500) on GET /v1/workouts",
			);
		});

		it("falls back to category when an arbitrary untrusted error is thrown", () => {
			const error = new Error(SECRET);
			const formatted = formatSafeErrorLogMessage("worker", error);
			expect(formatted).toBe("worker: Error");
			expect(formatted).not.toContain(SECRET);
		});

		it("includes domain error messages after scrubbing", () => {
			const error = new WorkoutPrivacyError({
				message: "Workout privacy is required.",
			});
			const formatted = formatSafeErrorLogMessage("tool", error);
			expect(formatted).toBe("tool: Workout privacy is required.");
		});
	});
});
