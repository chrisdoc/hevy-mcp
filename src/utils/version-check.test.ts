import { afterEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, scheduleUpdateCheck } from "./version-check.js";

const NOW = Date.UTC(2026, 6, 10, 12);
const DAY_MS = 24 * 60 * 60 * 1_000;
const OPTIONS = {
	packageName: "hevy-mcp",
	currentVersion: "1.0.0",
};

function registryResponse(latestVersion: unknown, ok = true): Response {
	return new Response(
		JSON.stringify({
			"dist-tags": { latest: latestVersion },
		}),
		{ status: ok ? 200 : 500 },
	);
}

function createDependencies() {
	return {
		fetch: vi.fn().mockResolvedValue(registryResponse("2.0.0")),
		readFile: vi.fn().mockRejectedValue(new Error("missing cache")),
		mkdir: vi.fn().mockResolvedValue(undefined),
		writeFile: vi.fn().mockResolvedValue(undefined),
		rename: vi.fn().mockResolvedValue(undefined),
		unlink: vi.fn().mockResolvedValue(undefined),
		homedir: vi.fn(() => "/home/test-user"),
		randomUUID: vi.fn(() => "00000000-0000-4000-8000-000000000000" as const),
		now: vi.fn(() => NOW),
		env: { XDG_CACHE_HOME: "/test-cache" } as NodeJS.ProcessEnv,
		writeStderr: vi.fn(),
	};
}

describe("checkForUpdate", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("uses a fresh cached registry result without fetching", async () => {
		const dependencies = createDependencies();
		dependencies.readFile.mockResolvedValue(
			JSON.stringify({
				checkedAt: NOW - DAY_MS + 1,
				latestVersion: "2.0.0",
			}),
		);

		await checkForUpdate(OPTIONS, dependencies);

		expect(dependencies.readFile).toHaveBeenCalledWith(
			"/test-cache/hevy-mcp/update-check.json",
			"utf8",
		);
		expect(dependencies.fetch).not.toHaveBeenCalled();
		expect(dependencies.writeStderr).toHaveBeenCalledTimes(1);
	});

	it("falls back to the user home cache when XDG_CACHE_HOME is unset", async () => {
		const dependencies = createDependencies();
		dependencies.env = {};

		await checkForUpdate(OPTIONS, dependencies);

		expect(dependencies.readFile).toHaveBeenCalledWith(
			"/home/test-user/.cache/hevy-mcp/update-check.json",
			"utf8",
		);
	});

	it.each([
		["stale cache", NOW - DAY_MS - 1],
		["exactly 24 hours old", NOW - DAY_MS],
		["future-dated cache", NOW + 1],
	])("refreshes %s", async (_description, checkedAt) => {
		const dependencies = createDependencies();
		dependencies.readFile.mockResolvedValue(
			JSON.stringify({ checkedAt, latestVersion: "1.5.0" }),
		);

		await checkForUpdate(OPTIONS, dependencies);

		expect(dependencies.fetch).toHaveBeenCalledTimes(1);
		expect(dependencies.writeFile).toHaveBeenCalledTimes(1);
		expect(dependencies.writeStderr).toHaveBeenCalledTimes(1);
	});

	it.each([
		["invalid JSON", "not json"],
		["wrong shape", JSON.stringify({ checkedAt: NOW })],
		[
			"invalid cached version",
			JSON.stringify({ checkedAt: NOW, latestVersion: "not-semver" }),
		],
	])("refreshes malformed cache with %s", async (_description, cache) => {
		const dependencies = createDependencies();
		dependencies.readFile.mockResolvedValue(cache);

		await checkForUpdate(OPTIONS, dependencies);

		expect(dependencies.fetch).toHaveBeenCalledTimes(1);
	});

	it("requests abbreviated npm registry metadata with a timeout signal", async () => {
		const dependencies = createDependencies();

		await checkForUpdate(OPTIONS, dependencies);

		expect(dependencies.fetch).toHaveBeenCalledWith(
			"https://registry.npmjs.org/hevy-mcp",
			expect.objectContaining({
				headers: {
					Accept: "application/vnd.npm.install-v1+json",
				},
				signal: expect.any(AbortSignal),
			}),
		);
	});

	it.each([
		["network failure", () => Promise.reject(new Error("offline"))],
		[
			"non-OK response",
			() => Promise.resolve(registryResponse("2.0.0", false)),
		],
		["invalid payload", () => Promise.resolve(registryResponse(undefined))],
		[
			"invalid remote version",
			() => Promise.resolve(registryResponse("latest")),
		],
	])("silently ignores %s", async (_description, fetchImplementation) => {
		const dependencies = createDependencies();
		dependencies.fetch.mockImplementation(fetchImplementation);

		await expect(
			checkForUpdate(OPTIONS, dependencies),
		).resolves.toBeUndefined();

		expect(dependencies.writeStderr).not.toHaveBeenCalled();
		expect(dependencies.writeFile).not.toHaveBeenCalled();
	});

	it("writes successful registry results atomically", async () => {
		const dependencies = createDependencies();

		await checkForUpdate(OPTIONS, dependencies);

		const temporaryPath =
			`/test-cache/hevy-mcp/update-check.json.${process.pid}.` +
			"00000000-0000-4000-8000-000000000000.tmp";
		expect(dependencies.mkdir).toHaveBeenCalledWith("/test-cache/hevy-mcp", {
			recursive: true,
		});
		expect(dependencies.writeFile).toHaveBeenCalledWith(
			temporaryPath,
			`${JSON.stringify({ checkedAt: NOW, latestVersion: "2.0.0" })}\n`,
			"utf8",
		);
		expect(dependencies.rename).toHaveBeenCalledWith(
			temporaryPath,
			"/test-cache/hevy-mcp/update-check.json",
		);
	});

	it("still reports an update when the cache write fails", async () => {
		const dependencies = createDependencies();
		dependencies.writeFile.mockRejectedValue(new Error("read-only cache"));

		await checkForUpdate(OPTIONS, dependencies);

		expect(dependencies.unlink).toHaveBeenCalled();
		expect(dependencies.writeStderr).toHaveBeenCalledTimes(1);
	});

	it.each([
		["1.26.5", "1.28.0", false],
		["1.25.9", "1.28.0", true],
		["1.28.0", "1.28.1", false],
		["1.28.0", "2.0.0", true],
		["2.0.0", "2.0.0", false],
		["2.0.0", "1.0.0", false],
		["1.0.0", "2.0.0-beta.1", false],
		["2.0.0-beta.1", "2.0.0", false],
		["2.0.0", "2.0.0-beta.1", false],
	])(
		"applies the notification threshold from current %s to latest %s",
		async (currentVersion, latestVersion, shouldNotify) => {
			const dependencies = createDependencies();
			dependencies.fetch.mockResolvedValue(registryResponse(latestVersion));

			await checkForUpdate(
				{ packageName: "hevy-mcp", currentVersion },
				dependencies,
			);

			expect(dependencies.writeStderr).toHaveBeenCalledTimes(
				shouldNotify ? 1 : 0,
			);
		},
	);

	it("emits a manager-neutral notice with versions and threshold", async () => {
		const dependencies = createDependencies();
		dependencies.fetch.mockResolvedValue(registryResponse("1.28.0"));

		await checkForUpdate(
			{ packageName: "hevy-mcp", currentVersion: "1.25.9" },
			dependencies,
		);

		const notice = dependencies.writeStderr.mock.calls[0]?.[0];
		expect(notice).toContain("current 1.25.9");
		expect(notice).toContain("latest 1.28.0");
		expect(notice).toMatch(/more than two minor versions/i);
		expect(notice).not.toMatch(/npm install/i);
	});

	it("skips invalid local versions without cache or network work", async () => {
		const dependencies = createDependencies();

		await checkForUpdate(
			{ packageName: "hevy-mcp", currentVersion: "dev" },
			dependencies,
		);

		expect(dependencies.readFile).not.toHaveBeenCalled();
		expect(dependencies.fetch).not.toHaveBeenCalled();
		expect(dependencies.writeStderr).not.toHaveBeenCalled();
	});

	it("writes the only user-visible notice to stderr with a newline", async () => {
		const dependencies = createDependencies();
		const stderrSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);
		const stdoutSpy = vi
			.spyOn(process.stdout, "write")
			.mockImplementation(() => true);

		const { writeStderr: _writeStderr, ...nonOutputDependencies } =
			dependencies;
		await checkForUpdate(OPTIONS, nonOutputDependencies);

		expect(stderrSpy).toHaveBeenCalledTimes(1);
		expect(stderrSpy.mock.calls[0]?.[0]).toMatch(/\n$/);
		expect(stdoutSpy).not.toHaveBeenCalled();
	});
});

describe("scheduleUpdateCheck", () => {
	it("uses an unref'ed immediate and absorbs check rejection", async () => {
		let scheduledCallback: (() => void) | undefined;
		const unref = vi.fn();
		const setImmediate = vi.fn((callback: () => void) => {
			scheduledCallback = callback;
			return { unref };
		});
		const check = vi.fn().mockRejectedValue(new Error("unexpected failure"));

		scheduleUpdateCheck(OPTIONS, {
			setImmediate,
			checkForUpdate: check,
		});

		expect(check).not.toHaveBeenCalled();
		expect(unref).toHaveBeenCalledTimes(1);
		scheduledCallback?.();
		await Promise.resolve();
		expect(check).toHaveBeenCalledWith(OPTIONS);
	});
});
