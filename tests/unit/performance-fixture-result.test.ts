import { describe, expect, it } from "vitest";
import {
	FIXTURE_RESULT_PREFIX,
	parseFixtureResult,
} from "../performance/fixture-result.js";

function marker(overrides: Record<string, unknown> = {}) {
	return `${FIXTURE_RESULT_PREFIX}${JSON.stringify({
		version: 1,
		mode: "startup",
		expectedRequestCount: 1,
		observedRequestCount: 1,
		startupRequestCount: 1,
		scenarioRequestCount: 0,
		pendingMocks: [],
		unexpectedRequests: [],
		blockedFetchRequests: [],
		setupFailure: null,
		cleanupFailure: null,
		verified: true,
		...overrides,
	})}`;
}

describe("child fixture result parsing", () => {
	it("extracts one validated prefixed marker from normal stderr", () => {
		expect(
			parseFixtureResult(`startup log\n${marker()}\n`, "startup"),
		).toMatchObject({ mode: "startup", verified: true });
	});

	it("rejects missing, duplicate, malformed, and mismatched markers", () => {
		expect(() => parseFixtureResult("no marker", "startup")).toThrow("found 0");
		expect(() =>
			parseFixtureResult(`${marker()}\n${marker()}`, "startup"),
		).toThrow("found 2");
		expect(() =>
			parseFixtureResult(`${FIXTURE_RESULT_PREFIX}{`, "startup"),
		).toThrow("malformed JSON");
		expect(() => parseFixtureResult(marker(), "tools-list")).toThrow(
			"mode mismatch",
		);
	});

	it("returns machine-readable failed verification for scenario reporting", () => {
		const result = parseFixtureResult(
			marker({ verified: false, pendingMocks: ["GET /v1/user/info"] }),
			"startup",
		);
		expect(result).toMatchObject({
			verified: false,
			pendingMocks: ["GET /v1/user/info"],
		});
	});
});
