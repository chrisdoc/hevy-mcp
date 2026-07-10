import { isAxiosError } from "axios";

/**
 * Specific error types for better categorization.
 */
export enum ErrorType {
	API_ERROR = "API_ERROR",
	RATE_LIMIT = "RATE_LIMIT",
	VALIDATION_ERROR = "VALIDATION_ERROR",
	NOT_FOUND = "NOT_FOUND",
	NETWORK_ERROR = "NETWORK_ERROR",
	UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

type RetryAwareError = {
	hevyRetryExhausted?: boolean;
};

/**
 * Determine the type of error based on error characteristics.
 */
export function determineErrorType(error: unknown, message: string): ErrorType {
	if (
		error !== null &&
		typeof error === "object" &&
		(error as RetryAwareError).hevyRetryExhausted === true
	) {
		return ErrorType.NETWORK_ERROR;
	}

	if (isAxiosError(error) && error.response?.status === 429) {
		return ErrorType.RATE_LIMIT;
	}

	const messageLower = message.toLowerCase();
	const nameLower = error instanceof Error ? error.name.toLowerCase() : "";

	if (
		nameLower.includes("network") ||
		messageLower.includes("network") ||
		nameLower.includes("fetch") ||
		messageLower.includes("fetch") ||
		nameLower.includes("timeout") ||
		messageLower.includes("timeout")
	) {
		return ErrorType.NETWORK_ERROR;
	}

	if (
		nameLower.includes("validation") ||
		messageLower.includes("validation") ||
		messageLower.includes("invalid") ||
		messageLower.includes("required")
	) {
		return ErrorType.VALIDATION_ERROR;
	}

	if (
		messageLower.includes("not found") ||
		messageLower.includes("404") ||
		messageLower.includes("does not exist")
	) {
		return ErrorType.NOT_FOUND;
	}

	if (
		nameLower.includes("api") ||
		messageLower.includes("api") ||
		messageLower.includes("server error") ||
		messageLower.includes("500")
	) {
		return ErrorType.API_ERROR;
	}

	return ErrorType.UNKNOWN_ERROR;
}
