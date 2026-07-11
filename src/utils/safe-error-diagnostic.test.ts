import { describe, expect, it } from "vitest";
import { HevyHttpError } from "./hevy-http-error.js";
import { createSafeErrorDiagnostic } from "./safe-error-diagnostic.js";

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
			"    at request (/home/user/hevy-mcp/src/utils/hevyClientKubb.ts:271:17)",
			"    at /home/user/hevy-mcp/src/worker.ts:219:9",
			"    at named (/home/user/hevy-mcp/src/utils/error-handler.ts:199:3)",
			"    at ignored (/home/user/hevy-mcp/src/index.ts:42:1)",
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
			"    at forged (/tmp/src/worker.ts:1:2)",
			"    at query (/home/user/hevy-mcp/src/worker.ts?token=secret:1:2)",
			"    at zero (/home/user/hevy-mcp/src/worker.ts:0:2)",
			"    at huge (/home/user/hevy-mcp/src/worker.ts:1000001:2)",
			"not a V8 frame /home/user/hevy-mcp/src/worker.ts:8:9",
		].join("\n");

		expect(createSafeErrorDiagnostic(error)).toEqual({
			category: "HevyHttpError",
		});
	});

	it("handles ordinary, cyclic, and adversarial thrown values", () => {
		const ordinary = new TypeError(SECRET, { cause: { token: SECRET } });
		ordinary.stack = `TypeError: ${SECRET}\n    at /home/user/hevy-mcp/src/shared-server.ts:44:5`;
		const cyclic: { self?: unknown; secret: string } = { secret: SECRET };
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
			frames: [{ source: "shared-server", line: 44, column: 5 }],
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
});
