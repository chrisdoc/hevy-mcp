import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debugLog, isDebugEnabled, redactToolArgs } from "./debug.js";

describe("debug diagnostics", () => {
	let stderrSpy: ReturnType<typeof vi.spyOn>;
	let stdoutSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		delete process.env.HEVY_MCP_DEBUG;
		stderrSpy = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);
		stdoutSpy = vi
			.spyOn(process.stdout, "write")
			.mockImplementation(() => true);
	});

	afterEach(() => {
		delete process.env.HEVY_MCP_DEBUG;
		vi.restoreAllMocks();
	});

	it.each([undefined, "", "0", "true", "yes", "01", " 1"])(
		"keeps diagnostics disabled for %s",
		(value) => {
			if (value === undefined) {
				delete process.env.HEVY_MCP_DEBUG;
			} else {
				process.env.HEVY_MCP_DEBUG = value;
			}

			expect(isDebugEnabled()).toBe(false);
			debugLog("disabled", { value: 1 });
			expect(stderrSpy).not.toHaveBeenCalled();
			expect(stdoutSpy).not.toHaveBeenCalled();
		},
	);

	it("enables only the exact value 1 and writes one structured stderr line", () => {
		process.env.HEVY_MCP_DEBUG = "1";

		expect(isDebugEnabled()).toBe(true);
		debugLog("test_event", { enabled: true });

		expect(stderrSpy).toHaveBeenCalledExactlyOnceWith(
			'[hevy-mcp:debug] {"event":"test_event","enabled":true}\n',
		);
		expect(stdoutSpy).not.toHaveBeenCalled();
	});

	it("redacts all input scalars while preserving bounded structure", () => {
		const args: Record<string, unknown> = {
			page: 2,
			includeCustom: true,
			weightKg: 81.5,
			fatPercent: 18.2,
			waist: 84,
			date: "2026-07-10",
			unknownString: "private scalar",
			bigintValue: 123n,
			notANumber: Number.NaN,
			positiveInfinity: Number.POSITIVE_INFINITY,
			symbolValue: Symbol("private symbol"),
			callback: () => "private result",
			missing: undefined,
			empty: null,
			apiKey: "sk-secret-api-key",
			title: "Private leg workout",
			query: "Find Chris's rehab routine",
			workout: {
				notes: "Knee pain and personal details",
				exercises: [{ name: "Secret exercise" }],
				sets: 4,
			},
		};
		args.circular = args;

		const redacted = redactToolArgs(args);
		const serialized = JSON.stringify(redacted);

		expect(redacted).toEqual({
			page: "[redacted]",
			includeCustom: "[redacted]",
			weightKg: "[redacted]",
			fatPercent: "[redacted]",
			waist: "[redacted]",
			date: "[redacted]",
			unknownString: "[redacted]",
			bigintValue: "[redacted]",
			notANumber: "[redacted]",
			positiveInfinity: "[redacted]",
			symbolValue: "[redacted]",
			callback: "[redacted]",
			missing: "[redacted]",
			empty: "[redacted]",
			apiKey: "[redacted]",
			title: "[redacted]",
			query: "[redacted]",
			workout: {
				notes: "[redacted]",
				exercises: { type: "array", length: 1 },
				sets: "[redacted]",
			},
			circular: "[circular]",
		});
		expect(serialized).not.toContain("81.5");
		expect(serialized).not.toContain("18.2");
		expect(serialized).not.toContain("84");
		expect(serialized).not.toContain("2026-07-10");
		expect(serialized).not.toContain("private scalar");
		expect(serialized).not.toContain("123");
		expect(serialized).not.toContain("private symbol");
		expect(serialized).not.toContain("sk-secret-api-key");
		expect(serialized).not.toContain("Private leg workout");
		expect(serialized).not.toContain("Chris");
		expect(serialized).not.toContain("Knee pain");
		expect(serialized).not.toContain("Secret exercise");

		process.env.HEVY_MCP_DEBUG = "1";
		debugLog("redacted_args", { params: redacted });
		const output = String(stderrSpy.mock.calls[0]?.[0]);
		expect(output).not.toContain("81.5");
		expect(output).not.toContain("18.2");
		expect(output).not.toContain("84");
	});

	it("bounds depth, object keys, array contents, unsafe keys, and output size", () => {
		const manyKeys = Object.fromEntries(
			Array.from({ length: 30 }, (_, index) => [`key${index}`, index]),
		);
		const redacted = redactToolArgs({
			"private workout title as a key": "secret",
			items: Array.from({ length: 1_000 }, () => "private value"),
			level1: { level2: { level3: { level4: { level5: "secret" } } } },
			manyKeys,
		});

		expect(redacted).toMatchObject({
			"[redacted-key]": "[redacted]",
			items: { type: "array", length: 1_000 },
			level1: { level2: { level3: { level4: "[max-depth]" } } },
			manyKeys: { "[truncated-keys]": 10 },
		});

		process.env.HEVY_MCP_DEBUG = "1";
		debugLog("bounded", { payload: "x".repeat(20_000) });
		const output = String(stderrSpy.mock.calls[0]?.[0]);
		expect(output.length).toBeLessThan(200);
		expect(output).toContain('"truncated":true');
		expect(stdoutSpy).not.toHaveBeenCalled();
	});

	it("swallows serialization and stderr write failures", () => {
		process.env.HEVY_MCP_DEBUG = "1";
		stderrSpy.mockImplementation(() => {
			throw new Error("stderr unavailable");
		});

		expect(() => debugLog("write_failure", { ok: true })).not.toThrow();
		expect(() =>
			debugLog("serialization_failure", { value: 1n }),
		).not.toThrow();
		expect(stdoutSpy).not.toHaveBeenCalled();
	});
});
