import { afterEach, describe, expect, it, vi } from "vitest";
import { HevyHttpError, type HevyClient } from "@hevy-mcp/hevy-client";
import {
	cacheValidation,
	hasCachedValidation,
	MEMORY_CACHE_MAX_ENTRIES,
	resetMemoryValidationCacheForTests,
	validateHevyApiKeyResilient,
	VALIDATION_CACHE_TTL_SECONDS,
	type HevyKeyValidator,
} from "./validation-cache.js";

function createFakeKv() {
	const store = new Map<string, string>();
	return {
		store,
		get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
		put: vi.fn(
			(key: string, value: string, _options?: { expirationTtl?: number }) => {
				store.set(key, value);
				return Promise.resolve();
			},
		),
		delete: vi.fn((key: string) => {
			store.delete(key);
			return Promise.resolve();
		}),
		list: vi.fn(() => Promise.resolve({ keys: [], list_complete: true })),
	};
}

afterEach(() => {
	resetMemoryValidationCacheForTests();
});

describe("in-memory fallback (no reachable KV binding)", () => {
	it("reports a miss for a key that was never cached", async () => {
		await expect(hasCachedValidation("never-cached", {})).resolves.toBe(false);
	});

	it("reports a hit after caching, scoped to that exact key", async () => {
		await cacheValidation("cached-key", {});

		await expect(hasCachedValidation("cached-key", {})).resolves.toBe(true);
		await expect(hasCachedValidation("other-key", {})).resolves.toBe(false);
	});

	it("expires the cached verdict after the TTL", async () => {
		vi.useFakeTimers();
		try {
			await cacheValidation("expiring-key", {});
			await expect(hasCachedValidation("expiring-key", {})).resolves.toBe(true);

			vi.advanceTimersByTime(VALIDATION_CACHE_TTL_SECONDS * 1_000 + 1);

			await expect(hasCachedValidation("expiring-key", {})).resolves.toBe(
				false,
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it("falls back to memory when OAUTH_KV is not KV-namespace-shaped", async () => {
		const env = { OAUTH_KV: "not-a-kv-namespace" };
		await cacheValidation("legacy-key", env);
		await expect(hasCachedValidation("legacy-key", env)).resolves.toBe(true);
	});

	it("evicts the oldest entry once the cap is exceeded", async () => {
		const env = {};
		for (let index = 0; index < MEMORY_CACHE_MAX_ENTRIES + 1; index++) {
			await cacheValidation(`key-${index}`, env);
		}
		await expect(hasCachedValidation("key-0", env)).resolves.toBe(false);
		await expect(
			hasCachedValidation(`key-${MEMORY_CACHE_MAX_ENTRIES}`, env),
		).resolves.toBe(true);
	});
});

describe("KV-backed cache", () => {
	it("stores a successful validation with the TTL and reads it back", async () => {
		const kv = createFakeKv();
		const env = { OAUTH_KV: kv };

		await cacheValidation("hevy-api-key", env);

		expect(kv.put).toHaveBeenCalledTimes(1);
		const [key, value, options] = kv.put.mock.calls[0] as [
			string,
			string,
			{ expirationTtl?: number },
		];
		expect(key.startsWith("keyvalid:")).toBe(true);
		expect(value).not.toContain("hevy-api-key");
		expect(options?.expirationTtl).toBe(VALIDATION_CACHE_TTL_SECONDS);

		await expect(hasCachedValidation("hevy-api-key", env)).resolves.toBe(true);
		await expect(hasCachedValidation("other-api-key", env)).resolves.toBe(
			false,
		);
	});

	it("derives the same cache key for the same API key, and different keys for different values", async () => {
		const kv = createFakeKv();
		const env = { OAUTH_KV: kv };

		await cacheValidation("key-a", env);
		await cacheValidation("key-a", env);
		await cacheValidation("key-b", env);

		const keys = kv.put.mock.calls.map((call) => call[0] as string);
		expect(keys[0]).toBe(keys[1]);
		expect(keys[0]).not.toBe(keys[2]);
	});

	it("treats a KV read failure as a cache miss rather than throwing", async () => {
		const kv = createFakeKv();
		kv.get.mockRejectedValueOnce(new Error("KV unavailable"));
		const env = { OAUTH_KV: kv };

		await expect(hasCachedValidation("some-key", env)).resolves.toBe(false);
	});

	it("treats a KV write failure as a no-op rather than throwing", async () => {
		const kv = createFakeKv();
		kv.put.mockRejectedValueOnce(new Error("KV unavailable"));
		const env = { OAUTH_KV: kv };

		await expect(cacheValidation("some-key", env)).resolves.toBeUndefined();
	});

	it("does not treat an arbitrary stored value as a valid verdict", async () => {
		const kv = createFakeKv();
		const env = { OAUTH_KV: kv };
		await cacheValidation("tampered-key", env);
		const [key] = kv.put.mock.calls[0] as [
			string,
			string,
			{ expirationTtl?: number },
		];
		kv.store.set(key, "something-else");

		await expect(hasCachedValidation("tampered-key", env)).resolves.toBe(false);
	});
});

describe("validateHevyApiKeyResilient", () => {
	const createValidationClient = () => ({}) as HevyClient;

	function rejectingValidator(status: number, count: number): HevyKeyValidator {
		let calls = 0;
		return vi.fn<HevyKeyValidator>(() => {
			calls += 1;
			if (calls <= count) {
				return Promise.reject(
					new HevyHttpError(`HTTP ${status}`, {
						status,
						method: "GET",
						endpoint: "/v1/user/info",
					}),
				);
			}
			return Promise.resolve("valid");
		});
	}

	it("skips validate entirely on a cache hit", async () => {
		const env = {};
		await cacheValidation("resilient-cached-key", env);
		const validate: HevyKeyValidator = vi.fn();

		const result = await validateHevyApiKeyResilient(
			"resilient-cached-key",
			"https://api.hevyapp.com",
			createValidationClient,
			validate,
			env,
		);

		expect(result).toBe("valid");
		expect(validate).not.toHaveBeenCalled();
	});

	it("validates and caches on a miss", async () => {
		const env = {};
		const validate: HevyKeyValidator = vi.fn().mockResolvedValue("valid");

		const result = await validateHevyApiKeyResilient(
			"resilient-fresh-key",
			"https://api.hevyapp.com",
			createValidationClient,
			validate,
			env,
		);

		expect(result).toBe("valid");
		expect(validate).toHaveBeenCalledTimes(1);
		await expect(hasCachedValidation("resilient-fresh-key", env)).resolves.toBe(
			true,
		);
	});

	it("never caches an invalid verdict", async () => {
		const env = {};
		const validate: HevyKeyValidator = vi.fn().mockResolvedValue("invalid");

		const result = await validateHevyApiKeyResilient(
			"resilient-invalid-key",
			"https://api.hevyapp.com",
			createValidationClient,
			validate,
			env,
		);

		expect(result).toBe("invalid");
		await expect(
			hasCachedValidation("resilient-invalid-key", env),
		).resolves.toBe(false);
	});

	it("retries a transient (non-429) failure and returns the eventual success", async () => {
		const env = {};
		const validate = rejectingValidator(503, 1);

		const result = await validateHevyApiKeyResilient(
			"resilient-retry-key",
			"https://api.hevyapp.com",
			createValidationClient,
			validate,
			env,
		);

		expect(result).toBe("valid");
		expect(validate).toHaveBeenCalledTimes(2);
	});

	it("never retries a 429", async () => {
		const env = {};
		const error = new HevyHttpError("HTTP 429", {
			status: 429,
			method: "GET",
			endpoint: "/v1/user/info",
		});
		const validate: HevyKeyValidator = vi.fn().mockRejectedValue(error);

		await expect(
			validateHevyApiKeyResilient(
				"resilient-429-key",
				"https://api.hevyapp.com",
				createValidationClient,
				validate,
				env,
			),
		).rejects.toBe(error);
		expect(validate).toHaveBeenCalledTimes(1);
	});

	it("stops retrying when aborted during backoff, without another attempt", async () => {
		const env = {};
		const controller = new AbortController();
		const validate = rejectingValidator(503, 1);

		const pending = validateHevyApiKeyResilient(
			"resilient-abort-key",
			"https://api.hevyapp.com",
			createValidationClient,
			validate,
			env,
			{ signal: controller.signal },
		);
		// Abort while the wrapper is sleeping between attempt 1 and attempt 2.
		setTimeout(() => controller.abort(), 10);

		await expect(pending).rejects.toBeInstanceOf(HevyHttpError);
		expect(validate).toHaveBeenCalledTimes(1);
	});

	it("defers the cache write via waitUntil when given an execution context", async () => {
		const env = {};
		const validate: HevyKeyValidator = vi.fn().mockResolvedValue("valid");
		const waitUntil = vi.fn();

		const result = await validateHevyApiKeyResilient(
			"resilient-deferred-key",
			"https://api.hevyapp.com",
			createValidationClient,
			validate,
			env,
			undefined,
			{ waitUntil },
		);

		expect(result).toBe("valid");
		expect(waitUntil).toHaveBeenCalledTimes(1);
	});
});
