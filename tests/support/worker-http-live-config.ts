const INVALID_WORKER_HTTP_URL_MESSAGE =
	"HEVY_WORKER_HTTP_URL must be an HTTPS URL with the exact /mcp path and no credentials, query, or fragment";

export function cloudflareChallengeStatus(
	status: number,
	cfMitigatedHeader: string | null,
): number | undefined {
	return cfMitigatedHeader?.trim().toLowerCase() === "challenge"
		? status
		: undefined;
}

export function parseWorkerHttpUrl(value: string | undefined): URL | undefined {
	if (value === undefined) return undefined;
	if (value.length === 0 || value.trim() !== value) {
		throw new Error(INVALID_WORKER_HTTP_URL_MESSAGE);
	}

	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(INVALID_WORKER_HTTP_URL_MESSAGE);
	}

	if (
		url.protocol !== "https:" ||
		url.pathname !== "/mcp" ||
		url.username ||
		url.password ||
		value.includes("@") ||
		url.search ||
		url.hash ||
		value.includes("?") ||
		value.includes("#")
	) {
		throw new Error(INVALID_WORKER_HTTP_URL_MESSAGE);
	}

	return url;
}
