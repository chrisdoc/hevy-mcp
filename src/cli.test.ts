import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "./cli.js";
import { SERVER_NAME, SERVER_VERSION } from "./server-metadata.js";

vi.mock("./index.js", () => ({ runServer: vi.fn() }));

describe("runCli", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each(["--version", "-v"])(
		"prints version for %s before API key validation",
		async (flag) => {
			const runServer = vi.fn();
			const logSpy = vi
				.spyOn(console, "log")
				.mockImplementation(() => undefined);
			const errorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => undefined);

			await runCli([flag], {}, { runServer });

			expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
				`${SERVER_NAME} v${SERVER_VERSION}`,
			);
			expect(logSpy).not.toHaveBeenCalled();
			expect(runServer).not.toHaveBeenCalled();
		},
	);

	it.each(["--help", "-h"])(
		"prints help for %s before API key validation",
		async (flag) => {
			const runServer = vi.fn();
			const logSpy = vi
				.spyOn(console, "log")
				.mockImplementation(() => undefined);

			await runCli([flag], {}, { runServer });

			expect(logSpy).toHaveBeenCalledTimes(1);
			const [helpText] = logSpy.mock.calls[0] ?? [];
			expect(helpText).toContain("Usage:");
			expect(helpText).toContain("HEVY_API_KEY");
			expect(helpText).toContain("HEVY_MCP_DEBUG=1");
			expect(helpText).toContain("Examples:");
			expect(helpText).not.toContain("--hevy-api-key");
			expect(runServer).not.toHaveBeenCalled();
		},
	);

	it("passes only the environment API key to the Node server runner", async () => {
		const runServer = vi.fn().mockResolvedValue(undefined);

		await runCli([], { HEVY_API_KEY: "test-api-key" }, { runServer });

		expect(runServer).toHaveBeenCalledExactlyOnceWith("test-api-key");
	});

	it.each([
		"--hevy-api-key=cli-key",
		"--hevyApiKey=cli-key",
		"hevy-api-key=cli-key",
	])("ignores removed CLI API key argument %s", async (legacyArg) => {
		const runServer = vi.fn().mockResolvedValue(undefined);

		await runCli([legacyArg], { HEVY_API_KEY: "env-key" }, { runServer });

		expect(runServer).toHaveBeenCalledExactlyOnceWith("env-key");
		expect(JSON.stringify(runServer.mock.calls)).not.toContain("cli-key");
	});

	it("rejects a missing API key before calling the server runner", async () => {
		const runServer = vi.fn();
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit called");
		});
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		await expect(runCli([], {}, { runServer })).rejects.toThrow(
			"process.exit called",
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(errorSpy).toHaveBeenCalledWith(
			"Hevy API key is required. Provide it via the HEVY_API_KEY environment variable.",
		);
		expect(runServer).not.toHaveBeenCalled();
	});

	it("reports and exits when the CLI entrypoint cannot start", async () => {
		const argv = process.argv;
		const apiKey = process.env.HEVY_API_KEY;
		const entrypoint = "/virtual/hevy-mcp.mjs";
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const exitSpy = vi
			.spyOn(process, "exit")
			.mockImplementation(() => undefined as never);

		process.argv = ["node", entrypoint];
		process.env.HEVY_API_KEY = "test-api-key";
		vi.resetModules();
		vi.doMock("node:fs", () => ({ realpathSync: () => entrypoint }));
		vi.doMock("node:url", () => ({ fileURLToPath: () => entrypoint }));

		const { runServer } = await import("./index.js");
		vi.mocked(runServer).mockRejectedValueOnce(new Error("startup failed"));
		await import("./cli.js");

		await vi.waitFor(() => {
			expect(exitSpy).toHaveBeenCalledExactlyOnceWith(1);
		});
		expect(errorSpy).toHaveBeenCalledWith(
			"Fatal error in main()",
			expect.any(Object),
		);

		process.argv = argv;
		if (apiKey === undefined) {
			delete process.env.HEVY_API_KEY;
		} else {
			process.env.HEVY_API_KEY = apiKey;
		}
		vi.doUnmock("node:fs");
		vi.doUnmock("node:url");
	});

	it("does not start when no CLI entrypoint path is available", async () => {
		const argv = process.argv;
		const { runServer } = await import("./index.js");
		vi.mocked(runServer).mockClear();

		try {
			process.argv = ["node"];
			vi.resetModules();

			await import("./cli.js");

			expect(runServer).not.toHaveBeenCalled();
		} finally {
			process.argv = argv;
		}
	});

	it("does not start when the CLI entrypoint path cannot be resolved", async () => {
		const argv = process.argv;
		const entrypoint = "/virtual/hevy-mcp.mjs";
		const { runServer } = await import("./index.js");
		vi.mocked(runServer).mockClear();

		try {
			process.argv = ["node", entrypoint];
			vi.resetModules();
			vi.doMock("node:fs", () => ({
				realpathSync: () => {
					throw new Error("entrypoint unavailable");
				},
			}));

			await import("./cli.js");

			expect(runServer).not.toHaveBeenCalled();
		} finally {
			process.argv = argv;
			vi.doUnmock("node:fs");
		}
	});
});
