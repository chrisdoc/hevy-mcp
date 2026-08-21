import { describe, expect, it } from "vitest";
import { HevyHttpError } from "@hevy-mcp/hevy-client";

import {
	createSafeErrorDiagnostic,
	SAFE_ERROR_CATEGORIES,
	SAFE_ERROR_CODES,
	SAFE_HTTP_METHODS,
	SAFE_STACK_SOURCES,
} from "./error-policy.js";

/** A category with no corresponding JS constructor (produced by fallthrough). */
const LAST_RESORT_CATEGORY = "UnknownError" as const;

describe("safe-error diagnostic vocabulary", () => {
	it("freezes the exported allowlists so adapters cannot widen them", () => {
		expect(Object.isFrozen(SAFE_ERROR_CODES)).toBe(true);
		expect(Object.isFrozen(SAFE_HTTP_METHODS)).toBe(true);
		expect(Object.isFrozen(SAFE_ERROR_CATEGORIES)).toBe(true);
		expect(Object.isFrozen(SAFE_STACK_SOURCES)).toBe(true);
	});

	it("covers every category createSafeErrorDiagnostic can classify", () => {
		const samples: unknown[] = [
			new TypeError("t"),
			new RangeError("r"),
			new ReferenceError("ref"),
			new SyntaxError("s"),
			new URIError("u"),
			new EvalError("e"),
			new AggregateError([]),
			new DOMException("d", "AbortError"),
			new Error("plain"),
			"not-an-error",
		];
		for (const sample of samples) {
			const { category } = createSafeErrorDiagnostic(sample);
			expect(SAFE_ERROR_CATEGORIES.has(category)).toBe(true);
		}
		expect(SAFE_ERROR_CATEGORIES.has(LAST_RESORT_CATEGORY)).toBe(true);
		expect(SAFE_ERROR_CATEGORIES.has("HevyHttpError")).toBe(true);
	});

	it("emits only codes from the shared allowlist", () => {
		const allowed = createSafeErrorDiagnostic(
			Object.assign(new Error("net"), { code: "ECONNRESET" }),
		);
		expect(allowed.code).toBe("ECONNRESET");
		expect(SAFE_ERROR_CODES.has(allowed.code ?? "")).toBe(true);

		const rejected = createSafeErrorDiagnostic(
			Object.assign(new Error("secret"), { code: "INTERNAL_TOKEN_XY" }),
		);
		expect(rejected.code).toBeUndefined();
	});

	it("emits only HTTP methods from the shared allowlist", () => {
		const method = createSafeErrorDiagnostic(
			Object.assign(new Error("http"), {
				status: 500,
				method: "TRACE",
				endpoint: "/v1/workouts",
			}),
		).method;
		expect(method).toBeUndefined();
		expect(SAFE_HTTP_METHODS.has("GET")).toBe(true);
	});
});

const SECRET = "sentinel-api-key-value";

describe("createSafeErrorDiagnostic", () => {
	it("retains only allowlisted Hevy metadata and internal stack locations", () => {
		const error = new HevyHttpError(`Bearer ${SECRET}`, {
			status: 503,
			statusText: SECRET,
			method: "get",
			endpoint: "/v1/workouts/:workoutId",
			code: "HEVY_RETRY_EXHAUSTED",
			headers: new Headers({ authorization: `Bearer ${SECRET}` }),
			data: { secret: SECRET },
			cause: new Error(SECRET),
		});
		error.stack = [
			`HevyHttpError: ${SECRET}`,
			"    at request (/home/user/hevy-mcp/packages/hevy-client/src/hevy-client-kubb.ts:271:17)",
			"    at /home/user/hevy-mcp/packages/worker/src/worker.ts:219:9",
			"    at named (/home/user/hevy-mcp/packages/core/src/utils/error-handler.ts:199:3)",
			"    at ignored (/home/user/hevy-mcp/packages/core/src/index.ts:42:1)",
		].join("\n");

		const diagnostic = createSafeErrorDiagnostic(error);

		expect(diagnostic).toEqual({
			category: "HevyHttpError",
			code: "HEVY_RETRY_EXHAUSTED",
			status: 503,
			method: "GET",
			endpoint: "/v1/workouts/:workoutId",
			frames: [
				{ source: "hevy-client", line: 271, column: 17 },
				{ source: "worker", line: 219, column: 9 },
				{ source: "error-handler", line: 199, column: 3 },
			],
		});
		expect(JSON.stringify(diagnostic)).not.toContain(SECRET);
		expect(JSON.stringify(diagnostic)).not.toContain("/home/user");
	});

	it("omits hostile messages, codes, statuses, methods, endpoints, and frames", () => {
		const error = new HevyHttpError(`${SECRET}\nforged`, {
			status: 999,
			method: `GET\n${SECRET}`,
			endpoint: `https://attacker.example/${SECRET}`,
			code: SECRET,
		});
		error.stack = [
			`Error: ${SECRET}`,
			`    at attacker (https://attacker.example/${SECRET}:1:2)`,
			"    at forged (/tmp/packages/worker/src/worker.ts:1:2)",
			"    at query (/home/user/hevy-mcp/packages/worker/src/worker.ts?token=secret:1:2)",
			"    at zero (/home/user/hevy-mcp/packages/worker/src/worker.ts:0:2)",
			"    at huge (/home/user/hevy-mcp/packages/worker/src/worker.ts:1000001:2)",
			"not a V8 frame /home/user/hevy-mcp/packages/worker/src/worker.ts:8:9",
		].join("\n");

		expect(createSafeErrorDiagnostic(error)).toEqual({
			category: "HevyHttpError",
		});
	});

	it("handles ordinary, cyclic, and adversarial thrown values", () => {
		const ordinary = new TypeError(SECRET, { cause: { token: SECRET } });
		ordinary.stack = `TypeError: ${SECRET}\n    at /home/user/hevy-mcp/packages/core/src/server.ts:44:5`;
		type CyclicThrownValue = {
			self?: CyclicThrownValue;
			secret: string;
		};
		const cyclic: CyclicThrownValue = { secret: SECRET };
		cyclic.self = cyclic;
		const hostile = new Proxy(
			{},
			{
				has() {
					throw new Error(SECRET);
				},
			},
		);

		expect(createSafeErrorDiagnostic(ordinary)).toEqual({
			category: "TypeError",
			frames: [{ source: "server", line: 44, column: 5 }],
		});
		expect(createSafeErrorDiagnostic(cyclic)).toEqual({
			category: "UnknownError",
		});
		expect(createSafeErrorDiagnostic(hostile)).toEqual({
			category: "UnknownError",
		});
		expect(
			createSafeErrorDiagnostic(new DOMException(SECRET, "AbortError")),
		).toMatchObject({ category: "DOMException" });
	});

	it("normalizes cache and transport cancellation taxonomy", () => {
		expect(
			createSafeErrorDiagnostic(new DOMException("cancel", "AbortError")),
		).toMatchObject({
			code: "HEVY_REQUEST_ABORTED",
			outcome: "cancelled",
			commit_state: "unknown",
			safe_to_retry: false,
		});
		expect(
			createSafeErrorDiagnostic(new DOMException("cancel", "AbortError")),
		).not.toHaveProperty("phase");
		expect(
			createSafeErrorDiagnostic(new DOMException("cancel", "AbortError")),
		).not.toHaveProperty("operation_safety");
		expect(
			createSafeErrorDiagnostic(new DOMException("deadline", "TimeoutError")),
		).toMatchObject({
			code: "HEVY_DEADLINE_EXCEEDED",
			outcome: "deadline_exceeded",
			commit_state: "unknown",
			safe_to_retry: false,
		});
	});
});
