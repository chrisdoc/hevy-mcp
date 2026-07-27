import { HevyHttpError, isHevyHttpError } from "@hevy-mcp/hevy-client";
import { ConfigurationError, UsageError } from "./arguments.js";

export class ApiResponseError extends Error {}

export const EXIT = { configuration: 1, usage: 2, api: 3, network: 4 } as const;

export function diagnostic(error: unknown): { code: number; message: string } {
	if (error instanceof ConfigurationError)
		return { code: EXIT.configuration, message: error.message };
	if (error instanceof ApiResponseError)
		return {
			code: EXIT.api,
			message: error.message.replace(/https?:\/\/\S+/gi, "[redacted]"),
		};
	if (error instanceof HevyHttpError || isHevyHttpError(error)) {
		if (error.status === 401)
			return {
				code: EXIT.api,
				message: "Authentication failed; check HEVY_API_KEY",
			};
		if (error.status !== undefined)
			return {
				code: EXIT.api,
				message: `Hevy API request failed (HTTP ${error.status})`,
			};
		return {
			code: EXIT.network,
			message:
				error.code === "ETIMEDOUT"
					? "Hevy API request timed out"
					: "Unable to reach the Hevy API",
		};
	}
	if (error instanceof UsageError)
		return {
			code: EXIT.usage,
			message: error.message.replace(/https?:\/\/\S+/gi, "[redacted]"),
		};
	return { code: EXIT.usage, message: "Command failed" };
}
