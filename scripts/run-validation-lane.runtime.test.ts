import { describe, expect, it, vi } from "vitest";

const { spawnMock, spawnCalls } = vi.hoisted(() => {
	const calls: Array<{
		command: string;
		args: string[];
		options: { env?: NodeJS.ProcessEnv };
	}> = [];
	const mock = vi.fn(
		(command: string, args: string[], options: { env?: NodeJS.ProcessEnv }) => {
			calls.push({ command, args, options });
			const listeners = new Map<string, (...values: unknown[]) => void>();
			return {
				on(event: string, listener: (...values: unknown[]) => void) {
					listeners.set(event, listener);
					if (event === "exit") queueMicrotask(() => listener(0, null));
					return this;
				},
			};
		},
	);
	return { spawnMock: mock, spawnCalls: calls };
});

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

const { runMember } = await import("./run-validation-lane.mjs");

describe("validation lane subprocess environment", () => {
	it("passes an explicitly selected environment through to subprocesses", async () => {
		const environment = {
			HEVY_API_KEY: "test-api-key",
			HEVY_MCP_COMMAND: "node",
			HEVY_MCP_ARGS_JSON: "[]",
		};

		await runMember("nightly", [], [], environment);

		expect(spawnMock).toHaveBeenCalledOnce();
		expect(spawnCalls[0]?.options.env).toBe(environment);
	});
});
