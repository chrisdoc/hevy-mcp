import nock from "nock";

const PREFIX = "HEVY_PERFORMANCE_FIXTURE_RESULT=";
const API_BASE = "https://api.hevyapp.com";
const API_KEY = "performance-fixture-api-key";
const EXPECTED_UPDATE_CHECK_URL = "https://registry.npmjs.org/hevy-mcp";
const MODES = new Set([
	"startup",
	"tools-list",
	"representative-read",
	"concurrent-reads",
	"sequential-reads",
]);

const mode = process.env.HEVY_PERFORMANCE_FIXTURE_MODE ?? "";
const result = {
	version: 1,
	mode,
	expectedRequestCount: 0,
	observedRequestCount: 0,
	startupRequestCount: 0,
	scenarioRequestCount: 0,
	pendingMocks: [],
	unexpectedRequests: [],
	blockedFetchRequests: [],
	setupFailure: null,
	cleanupFailure: null,
	verified: false,
};

function describeRequest(request) {
	const method = request?.method ?? "UNKNOWN";
	const path = request?.path ?? request?.pathname ?? request?.href ?? "unknown";
	return `${method} ${path}`;
}

nock.emitter.on("no match", (request) => {
	result.unexpectedRequests.push(describeRequest(request));
});

process.once("exit", () => {
	try {
		result.pendingMocks = nock.pendingMocks();
		result.verified =
			result.setupFailure === null &&
			result.cleanupFailure === null &&
			result.pendingMocks.length === 0 &&
			result.unexpectedRequests.length === 0 &&
			result.observedRequestCount === result.expectedRequestCount &&
			result.startupRequestCount === 1;
	} catch (error) {
		result.cleanupFailure =
			error instanceof Error ? error.message : String(error);
		result.verified = false;
	}
	process.stderr.write(`${PREFIX}${JSON.stringify(result)}\n`);
});

try {
	if (!MODES.has(mode)) {
		throw new Error(`unsupported fixture mode: ${mode || "<empty>"}`);
	}
	if (process.env.HEVY_API_KEY !== API_KEY) {
		throw new Error("child fixture requires the dedicated fake API key");
	}

	nock.disableNetConnect();
	globalThis.fetch = async (input) => {
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.href
					: input instanceof Request
						? input.url
						: "<unsupported-fetch-input>";
		result.blockedFetchRequests.push(url);
		if (url !== EXPECTED_UPDATE_CHECK_URL) {
			result.unexpectedRequests.push(`FETCH ${url}`);
		}
		throw new Error("performance fixture blocked global fetch");
	};

	const scope = () => nock(API_BASE, { reqheaders: { "api-key": API_KEY } });
	const observed = (kind, body) => () => {
		result.observedRequestCount += 1;
		result[`${kind}RequestCount`] += 1;
		return body;
	};

	scope()
		.get("/v1/user/info")
		.reply(
			200,
			observed("startup", {
				data: {
					id: "performance-user",
					name: "Performance Fixture",
					url: "https://hevy.com/user/performance-fixture",
				},
			}),
		);
	result.expectedRequestCount = 1;

	if (mode === "representative-read") {
		for (let iteration = 1; iteration <= 20; iteration += 1) {
			scope()
				.get("/v1/workouts/count")
				.reply(200, observed("scenario", { workout_count: iteration }));
		}
		result.expectedRequestCount += 20;
	}

	if (mode === "concurrent-reads") {
		for (let iteration = 1; iteration <= 20; iteration += 1) {
			const id = `concurrent-${iteration}`;
			scope()
				.get(`/v1/workouts/${id}`)
				.reply(
					200,
					observed("scenario", {
						id,
						title: `Performance Workout ${id}`,
						description: "Deterministic child-local fixture",
						start_time: "2026-01-01T08:00:00Z",
						end_time: "2026-01-01T09:00:00Z",
						created_at: "2026-01-01T08:00:00Z",
						updated_at: "2026-01-01T09:00:00Z",
						exercises: [],
					}),
				);
		}
		result.expectedRequestCount += 20;
	}

	if (mode === "sequential-reads") {
		for (let iteration = 1; iteration <= 100; iteration += 1) {
			scope()
				.get("/v1/workouts/count")
				.reply(200, observed("scenario", { workout_count: iteration }));
		}
		result.expectedRequestCount += 100;
	}
} catch (error) {
	result.setupFailure = error instanceof Error ? error.message : String(error);
	process.exitCode = 1;
}
