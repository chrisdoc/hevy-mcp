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

		expect(redacted).toMatchObject({
			type: "object",
			fieldCount: 19,
			fields: {
				"field-1": "[number]",
				"field-2": "[boolean]",
				"field-3": "[number]",
				"field-4": "[number]",
				"field-5": "[number]",
				"field-6": "[string]",
				"field-7": "[string]",
				"field-8": "[bigint]",
				"field-9": "[number]",
				"field-10": "[number]",
				"field-11": "[symbol]",
				"field-12": "[function]",
				"field-13": "[undefined]",
				"field-14": "[null]",
				"field-15": "[string]",
				"field-16": "[string]",
				"field-17": "[string]",
				"field-18": {
					type: "object",
					fieldCount: 3,
					fields: {
						"field-1": "[string]",
						"field-2": {
							type: "array",
							length: 1,
							items: {
								"item-1": {
									type: "object",
									fieldCount: 1,
									fields: { "field-1": "[string]" },
								},
							},
						},
						"field-3": "[number]",
					},
				},
				"field-19": "[circular]",
			},
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

	it("removes adversarial keys and bounds nested structural diagnostics", () => {
		const manyKeys = Object.fromEntries(
			Array.from({ length: 30 }, (_, index) => [`key${index}`, index]),
		);
		let getterCalls = 0;
		const accessorObject = Object.defineProperty({}, "AliceDiagnosis", {
			enumerable: true,
			get: () => {
				getterCalls += 1;
				return "private getter value";
			},
		});
		const accessorArray = Array.from({ length: 1 });
		Object.defineProperty(accessorArray, "0", {
			enumerable: true,
			get: () => {
				getterCalls += 1;
				return "private array getter value";
			},
		});
		const redacted = redactToolArgs({
			kneePain_notes: "private knee value",
			johnToken: "private token value",
			AliceDiagnosis: "private diagnosis value",
			"私密な鍵🔒": "private unicode value",
			items: Array.from({ length: 1_000 }, () => "private array value"),
			level1: { level2: { level3: { level4: { level5: "secret" } } } },
			manyKeys,
			accessorObject,
			accessorArray,
		});
		const serialized = JSON.stringify(redacted);

		expect(redacted).toMatchObject({
			type: "object",
			fieldCount: 9,
			fields: {
				"field-1": "[string]",
				"field-2": "[string]",
				"field-3": "[string]",
				"field-4": "[string]",
				"field-5": {
					type: "array",
					length: 1_000,
					truncatedItems: 980,
				},
				"field-7": {
					type: "object",
					fieldCount: 30,
					truncatedFields: 10,
				},
				"field-8": {
					type: "object",
					fieldCount: 1,
					fields: { "field-1": "[accessor]" },
				},
				"field-9": {
					type: "array",
					length: 1,
					items: { "item-1": "[empty-or-accessor]" },
				},
			},
		});
		expect(serialized).toContain("[max-depth]");
		expect(serialized).not.toContain("kneePain_notes");
		expect(serialized).not.toContain("johnToken");
		expect(serialized).not.toContain("AliceDiagnosis");
		expect(serialized).not.toContain("私密な鍵🔒");
		expect(serialized).not.toContain("private knee value");
		expect(serialized).not.toContain("private token value");
		expect(serialized).not.toContain("private diagnosis value");
		expect(serialized).not.toContain("private unicode value");
		expect(serialized).not.toContain("private array value");
		expect(getterCalls).toBe(0);

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
		const hostileProxy = new Proxy(
			{},
			{
				ownKeys: () => {
					throw new Error("reflection unavailable");
				},
			},
		);
		expect(redactToolArgs(hostileProxy)).toBe("[unavailable]");
		expect(stdoutSpy).not.toHaveBeenCalled();
	});
});
