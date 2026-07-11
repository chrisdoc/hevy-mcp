import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import type { Readable } from "node:stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import {
	FIXTURE_RESULT_PREFIX,
	parseFixtureResult,
	type FixtureMode,
	type FixtureResult,
} from "./fixture-result.js";

export const PERFORMANCE_API_KEY = "performance-fixture-api-key";

export interface ServerMemoryObservation {
	iteration: number;
	phase: "initialized" | "scenario-complete";
	rssBytes: number | null;
	unavailableReason: string | null;
}

export function parseProcStatusRss(status: string): number | null {
	const match = /^VmRSS:\s+(\d+)\s+kB$/mu.exec(status);
	if (!match?.[1]) return null;
	const kibibytes = Number(match[1]);
	return Number.isSafeInteger(kibibytes) ? kibibytes * 1024 : null;
}

export function observeServerRss(
	pid: number | null,
	iteration: number,
	phase: ServerMemoryObservation["phase"],
): ServerMemoryObservation {
	if (process.platform !== "linux") {
		return {
			iteration,
			phase,
			rssBytes: null,
			unavailableReason: `server RSS is unavailable on ${process.platform}`,
		};
	}
	if (pid === null) {
		return {
			iteration,
			phase,
			rssBytes: null,
			unavailableReason: "server process ID is unavailable",
		};
	}

	try {
		const rssBytes = parseProcStatusRss(
			readFileSync(`/proc/${pid}/status`, "utf8"),
		);
		return {
			iteration,
			phase,
			rssBytes,
			unavailableReason:
				rssBytes === null ? "VmRSS was missing from proc status" : null,
		};
	} catch (error) {
		return {
			iteration,
			phase,
			rssBytes: null,
			unavailableReason: error instanceof Error ? error.message : String(error),
		};
	}
}

function withTimeout(promise: Promise<void>, timeoutMs = 2_000) {
	return new Promise<void>((resolvePromise) => {
		const timer = setTimeout(resolvePromise, timeoutMs);
		void promise.then(() => {
			clearTimeout(timer);
			resolvePromise();
		});
	});
}

export interface PerformanceHarness {
	client: Client;
	pid: number | null;
	close: () => Promise<FixtureResult>;
}

export async function createPerformanceHarness(
	mode: FixtureMode,
): Promise<PerformanceHarness> {
	const stderrChunks: string[] = [];
	const transport = new StdioClientTransport({
		command: process.execPath,
		args: [
			"--import",
			resolve("tests/performance/child-fixture.mjs"),
			resolve("dist/cli.mjs"),
		],
		cwd: process.cwd(),
		env: {
			...process.env,
			HEVY_API_KEY: PERFORMANCE_API_KEY,
			HEVY_PERFORMANCE_FIXTURE_MODE: mode,
			OTEL_COLLECTOR_TOKEN: "",
			SENTRY_DSN: "",
		},
		stderr: "pipe",
	});
	const stderr = transport.stderr as Readable | null;
	let resolveFixtureMarker: () => void = () => undefined;
	const fixtureMarkerSeen = new Promise<void>((resolvePromise) => {
		resolveFixtureMarker = resolvePromise;
	});
	stderr?.setEncoding("utf8");
	stderr?.on("data", (chunk: string) => {
		stderrChunks.push(chunk);
		if (stderrChunks.join("").includes(FIXTURE_RESULT_PREFIX)) {
			resolveFixtureMarker();
		}
	});

	const client = new Client(
		{ name: "hevy-mcp-performance-client", version: "1.0.0" },
		{ capabilities: {} },
	);

	try {
		await client.connect(transport);
	} catch (error) {
		try {
			await client.close();
		} catch {
			// Preserve the connection error; scenario reporting records the failure.
		}
		if (stderr) await withTimeout(fixtureMarkerSeen);
		const detail = stderrChunks.join("").trim();
		throw new Error(
			`failed to initialize built CLI${detail ? `: ${detail}` : ""}`,
			{ cause: error },
		);
	}

	let closed = false;
	return {
		client,
		pid: transport.pid,
		async close() {
			if (closed) {
				throw new Error("performance harness was closed more than once");
			}
			closed = true;
			await client.close();
			if (stderr) await withTimeout(fixtureMarkerSeen);
			return parseFixtureResult(stderrChunks.join(""), mode);
		},
	};
}

export async function callPerformanceTool(
	client: Client,
	name: string,
	arguments_: Record<string, unknown>,
) {
	const result = await client.request(
		{
			method: "tools/call",
			params: { name, arguments: arguments_ },
		},
		CallToolResultSchema,
	);
	const firstContent = result.content[0];
	if (!firstContent || firstContent.type !== "text") {
		throw new Error(`${name} did not return text content`);
	}
	if (result.isError) {
		throw new Error(`${name} returned an MCP error: ${firstContent.text}`);
	}

	return {
		text: firstContent.text,
		structuredContent: result.structuredContent,
	};
}

export function measuredDuration(startedAt: number) {
	return Math.max(performance.now() - startedAt, Number.EPSILON);
}
