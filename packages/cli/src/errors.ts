import { createExecutionErrorProjection } from "@hevy-mcp/core";
import {
	ApiError,
	HevyHttpError,
	isHevyHttpError,
	NetworkError,
	NotFoundError,
	RateLimitError,
	ValidationError,
} from "@hevy-mcp/hevy-client";
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

type TaggedClientError =
	| ApiError
	| NetworkError
	| NotFoundError
	| RateLimitError
	| ValidationError;

function isTaggedClientError(
	error: Error | string,
): error is TaggedClientError {
	return (
		error instanceof ApiError ||
		error instanceof NetworkError ||
		error instanceof NotFoundError ||
		error instanceof RateLimitError ||
		error instanceof ValidationError
	);
}

function executionFields(
	error: Error | string,
): Omit<CliDiagnostic, "code" | "message"> {
	if (!isHevyHttpError(error) && !isTaggedClientError(error)) return {};
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
	if (
		error instanceof HevyHttpError ||
		isHevyHttpError(error) ||
		isTaggedClientError(error)
	) {
		const status = "status" in error ? error.status : undefined;
		if (status === 401)
			return {
				code: EXIT.api,
				message: "Authentication failed; check HEVY_API_KEY",
				...executionFields(error),
			};
		if (status !== undefined)
			return {
				code: EXIT.api,
				message: `Hevy API request failed (HTTP ${status})`,
				...executionFields(error),
			};
		return {
			code: EXIT.network,
			message:
				("code" in error ? error.code : undefined) === "ETIMEDOUT"
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
