import {
	ApiError,
	HevyHttpError,
	isHevyHttpError,
	NetworkError,
	NotFoundError,
	RateLimitError,
	SAFE_OBSERVATION_CODES,
	ValidationError,
} from "@hevy-mcp/hevy-client";
import {
	EmptyMeasurementUpdateError,
	PaginationMismatchError,
	TemplatesSearchValidationError,
	TrainingSummaryDataError,
	TrainingSummaryValidationError,
	WorkoutPayloadError,
	WorkoutPrivacyError,
} from "@hevy-mcp/operations";
import { ConfigurationError, UsageError } from "./arguments.js";

export class ApiResponseError extends Error {}

export const EXIT = { configuration: 1, usage: 2, api: 3, network: 4 } as const;

export interface CliDiagnostic {
	code: number;
	message: string;
	error_code?: string;
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

const SAFE_ERROR_CODES = new Set([
	...SAFE_OBSERVATION_CODES,
	"HEVY_INVALID_ENDPOINT",
]);

type OperationDomainError =
	| EmptyMeasurementUpdateError
	| PaginationMismatchError
	| TemplatesSearchValidationError
	| TrainingSummaryDataError
	| TrainingSummaryValidationError
	| WorkoutPayloadError
	| WorkoutPrivacyError;

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

function isOperationDomainError(
	error: Error | string,
): error is OperationDomainError {
	return (
		error instanceof EmptyMeasurementUpdateError ||
		error instanceof TrainingSummaryDataError ||
		error instanceof PaginationMismatchError ||
		error instanceof TemplatesSearchValidationError ||
		error instanceof TrainingSummaryValidationError ||
		error instanceof WorkoutPayloadError ||
		error instanceof WorkoutPrivacyError
	);
}

function projectExecutionFields(fields: {
	outcome?: CliDiagnostic["outcome"];
	phase?: CliDiagnostic["phase"];
	operationSafety?: CliDiagnostic["operation_safety"];
	commitState?: CliDiagnostic["commit_state"];
	safeToRetry?: CliDiagnostic["safe_to_retry"];
	code?: string;
}): Omit<CliDiagnostic, "code" | "message"> {
	const execution = {
		outcome: fields.outcome ?? "terminal_failure",
		phase: fields.phase ?? "before-dispatch",
		operation_safety: fields.operationSafety ?? "read",
		commit_state: fields.commitState ?? "not_sent",
		safe_to_retry: fields.safeToRetry ?? false,
	};
	const errorCode =
		fields.code !== undefined && SAFE_ERROR_CODES.has(fields.code)
			? fields.code
			: undefined;
	return errorCode === undefined
		? execution
		: { ...execution, error_code: errorCode };
}

function executionFields(
	error: Error | string,
): Omit<CliDiagnostic, "code" | "message"> {
	if (isHevyHttpError(error)) {
		return projectExecutionFields({
			outcome: error.outcome,
			phase: error.phase_name,
			operationSafety: error.operation_safety,
			commitState: error.commit_state,
			safeToRetry: error.safe_to_retry,
			code: error.code,
		});
	}
	if (isTaggedClientError(error)) {
		return projectExecutionFields({
			outcome: error.outcome,
			phase: error.phase,
			operationSafety: error.operationSafety,
			commitState: error.commitState,
			safeToRetry: error.safeToRetry,
			code: error.code,
		});
	}
	return {};
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
	if (isOperationDomainError(error)) {
		if (
			error instanceof PaginationMismatchError ||
			error instanceof WorkoutPayloadError ||
			error instanceof TrainingSummaryDataError
		) {
			return {
				code: EXIT.api,
				message:
					error instanceof PaginationMismatchError
						? "The API returned invalid pagination metadata"
						: error.message,
			};
		}
		return { code: EXIT.usage, message: error.message };
	}
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
