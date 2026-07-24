import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
	cloudflareChallengeStatus,
	parseWorkerHttpUrl,
} from "../support/worker-http-live-config.js";

interface DisabledLiveSuiteReport {
	numPendingTests: number;
	success: boolean;
}

describe("parseWorkerHttpUrl", () => {
	it("leaves the local mode unset when the variable is absent", () => {
		expect(parseWorkerHttpUrl(undefined)).toBeUndefined();
	});

	it("collects the disabled live suite with an invalid hosted URL", () => {
		const environment = { ...process.env };
		delete environment.HEVY_API_KEY;
		delete environment.HEVY_RUN_LIVE_WORKER_TESTS;
		environment.HEVY_WORKER_HTTP_URL = "not a URL";

		const result = spawnSync(
			process.execPath,
			[
				"node_modules/vitest/vitest.mjs",
				"run",
				"tests/integration/worker-http.live.integration.test.ts",
				"--reporter=json",
			],
			{
				cwd: process.cwd(),
				encoding: "utf8",
				env: environment,
				timeout: 20_000,
			},
		);

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(0);
		const report = JSON.parse(result.stdout) as DisabledLiveSuiteReport;
		expect(report.success).toBe(true);
		expect(report.numPendingTests).toBeGreaterThan(0);
	});

	it("only treats the explicit Cloudflare challenge header as a challenge", () => {
		expect(cloudflareChallengeStatus(403, "challenge")).toBe(403);
		expect(cloudflareChallengeStatus(403, "Challenge")).toBe(403);
		expect(cloudflareChallengeStatus(401, null)).toBeUndefined();
		expect(cloudflareChallengeStatus(405, "")).toBeUndefined();
	});

	it("accepts the canonical hosted Worker endpoint", () => {
		expect(parseWorkerHttpUrl("https://hevy.chrisdoc.dev/mcp")?.href).toBe(
			"https://hevy.chrisdoc.dev/mcp",
		);
	});

	it("accepts another HTTPS endpoint with the exact MCP path", () => {
		expect(
			parseWorkerHttpUrl("https://preview.example.test/mcp")?.pathname,
		).toBe("/mcp");
	});

	it("rejects non-HTTPS, wrong-path, credentialed, and decorated URLs", () => {
		for (const value of [
			"",
			"http://preview.example.test/mcp",
			"https://preview.example.test/",
			"https://preview.example.test/mcp/",
			"https://@preview.example.test/mcp",
			"https://user:secret@preview.example.test/mcp",
			"https://preview.example.test/mcp?debug=1",
			"https://preview.example.test/mcp#fragment",
			"not a URL",
		]) {
			expect(() => parseWorkerHttpUrl(value)).toThrow("HEVY_WORKER_HTTP_URL");
		}
	});

	it("rejects whitespace around an otherwise valid URL", () => {
		expect(() =>
			parseWorkerHttpUrl(" https://preview.example.test/mcp "),
		).toThrow("HEVY_WORKER_HTTP_URL");
	});
});
