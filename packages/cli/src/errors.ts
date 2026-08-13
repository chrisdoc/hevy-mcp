import { createExecutionErrorProjection } from "@hevy-mcp/core";
import { HevyHttpError, isHevyHttpError } from "@hevy-mcp/hevy-client";
import { ConfigurationError, UsageError } from "./arguments.js";

export class ApiResponseError extends Error {}

export const EXIT = { configuration: 1, usage: 2, api: 3, network: 4 } as const;

export interface CliDiagnostic {
	code: number;
	message: string;
	outcome?: string;
	phase?: string;
	operation_safety?: string;
	commit_state?: string;
	safe_to_retry?: boolean;
}

function executionFields(
	error: Error | string,
): Omit<CliDiagnostic, "code" | "message"> {
	if (!isHevyHttpError(error)) return {};
	const {
		code: _code,
		status: _status,
		...execution
	} = createExecutionErrorProjection(error);
	return execution;
}

export function diagnostic(error: Error | string): CliDiagnostic {
	if (error instanceof ConfigurationError)
		return { code: EXIT.configuration, message: error.message };
	if (error instanceof ApiResponseError)
		return {
			code: EXIT.api,
			message: error.message.replace(/https?:\/\/\S+/gi, "[redacted]"),
			...executionFields(error),
		};
	if (error instanceof HevyHttpError || isHevyHttpError(error)) {
		if (error.status === 401)
			return {
				code: EXIT.api,
				message: "Authentication failed; check HEVY_API_KEY",
				...executionFields(error),
			};
		if (error.status !== undefined)
			return {
				code: EXIT.api,
				message: `Hevy API request failed (HTTP ${error.status})`,
				...executionFields(error),
			};
		return {
			code: EXIT.network,
			message:
				error.code === "ETIMEDOUT"
					? "Hevy API request timed out"
					: "Unable to reach the Hevy API",
			...executionFields(error),
		};
	}
	if (error instanceof UsageError)
		return {
			code: EXIT.usage,
			message: error.message.replace(/https?:\/\/\S+/gi, "[redacted]"),
		};
	return { code: EXIT.usage, message: "Command failed" };
}
