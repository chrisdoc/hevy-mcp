import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ShutdownSignal } from "./graceful-shutdown.js";

const repositoryRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../..",
);
const tsxCli = path.join(repositoryRoot, "node_modules/tsx/dist/cli.mjs");
const childFixture = path.join(
	repositoryRoot,
	"tests/fixtures/graceful-shutdown-child.ts",
);

describe("graceful stdio shutdown regression", () => {
	it.each(["SIGTERM", "SIGINT"] satisfies ShutdownSignal[])(
		"flushes backpressured JSON-RPC frames before exiting on %s",
		async (signal) => {
			const child = spawn(process.execPath, [tsxCli, childFixture], {
				cwd: repositoryRoot,
				stdio: ["pipe", "pipe", "pipe"],
			});
			const stdoutChunks: Buffer[] = [];
			const stderrChunks: Buffer[] = [];
			let exited = false;
			const exitResult = new Promise<{
				code: number | null;
				signal: NodeJS.Signals | null;
			}>((resolve) => {
				child.once("exit", (code, exitSignal) => {
					exited = true;
					resolve({ code, signal: exitSignal });
				});
			});

			try {
				let expectedFrameCount = 0;
				await new Promise<void>((resolve, reject) => {
					const timeout = setTimeout(() => {
						reject(new Error("Timed out waiting for backpressure marker"));
					}, 5_000);

					child.stderr.on("data", (chunk: Buffer) => {
						stderrChunks.push(chunk);
						const stderr = Buffer.concat(stderrChunks).toString("utf8");
						const marker = stderr.match(/BACKPRESSURED:(\d+)/);
						if (marker) {
							expectedFrameCount = Number(marker[1]);
							clearTimeout(timeout);
							resolve();
						}
					});
					child.once("error", reject);
					child.once("exit", (code, exitSignal) => {
						clearTimeout(timeout);
						reject(
							new Error(
								`Child exited before marker: code=${code}, signal=${exitSignal}`,
							),
						);
					});
				});

				child.kill(signal);
				await new Promise((resolve) => setTimeout(resolve, 50));
				expect(exited).toBe(false);

				child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
				const timeout = setTimeout(() => child.kill("SIGKILL"), 10_000);
				const result = await exitResult;
				clearTimeout(timeout);

				expect(result).toEqual({ code: 0, signal: null });
				const stdout = Buffer.concat(stdoutChunks).toString("utf8");
				const stderr = Buffer.concat(stderrChunks).toString("utf8");
				const frames = stdout.trimEnd().split("\n");

				expect(expectedFrameCount).toBeGreaterThan(0);
				expect(frames).toHaveLength(expectedFrameCount);
				for (const [index, frame] of frames.entries()) {
					expect(JSON.parse(frame)).toEqual({
						jsonrpc: "2.0",
						id: index + 1,
						result: { payload: "x".repeat(128 * 1024) },
					});
				}
				expect(stdout).not.toContain("Shutting down gracefully");
				expect(stderr).toContain(`Shutting down gracefully after ${signal}`);
			} finally {
				if (!exited) {
					child.kill("SIGKILL");
					await exitResult;
				}
			}
		},
		10_000,
	);
});
