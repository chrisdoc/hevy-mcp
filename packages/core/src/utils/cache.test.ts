import { afterEach, describe, expect, it, vi } from "vitest";
import { createSafeErrorDiagnostic } from "./error-policy.js";
import { AsyncTtlCache } from "./cache.js";

describe("AsyncTtlCache", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns cached values for subsequent hits before TTL expiry", async () => {
		const cache = new AsyncTtlCache<string, string>({
			ttlMs: 60_000,
			maxSize: 2,
		});
		const fetcher = vi.fn().mockResolvedValue("bench");

		const first = await cache.getOrFetch("catalog", fetcher);
		const second = await cache.getOrFetch("catalog", fetcher);

		expect(first).toBe("bench");
		expect(second).toBe("bench");
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it("expires entries after TTL and fetches again", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

		const cache = new AsyncTtlCache<string, string>({
			ttlMs: 1_000,
			maxSize: 2,
		});
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce("first")
			.mockResolvedValueOnce("second");

		await cache.getOrFetch("catalog", fetcher);
		vi.advanceTimersByTime(1_001);
		const refreshed = await cache.getOrFetch("catalog", fetcher);

		expect(refreshed).toBe("second");
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it("evicts the least recently used entry when max size is exceeded", async () => {
		const cache = new AsyncTtlCache<string, string>({
			ttlMs: 60_000,
			maxSize: 2,
		});

		const fetcher = vi.fn((key: string) => Promise.resolve(`${key}-value`));
		const load = (key: string) => cache.getOrFetch(key, () => fetcher(key));

		await load("a");
		await load("b");
		await load("a");
		await load("c");
		await load("b");

		expect(fetcher.mock.calls.map(([key]) => key)).toEqual([
			"a",
			"b",
			"c",
			"b",
		]);
	});

	it("supports refresh bypass while preserving newly fetched value", async () => {
		const cache = new AsyncTtlCache<string, string>({
			ttlMs: 60_000,
			maxSize: 2,
		});
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce("stale")
			.mockResolvedValueOnce("fresh");

		await cache.getOrFetch("catalog", fetcher);
		const refreshed = await cache.getOrFetch("catalog", fetcher, {
			refresh: true,
		});
		const cached = await cache.getOrFetch("catalog", fetcher);

		expect(refreshed).toBe("fresh");
		expect(cached).toBe("fresh");
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it("de-duplicates concurrent in-flight fetches for the same key", async () => {
		const cache = new AsyncTtlCache<string, string>({
			ttlMs: 60_000,
			maxSize: 2,
		});

		let resolveFetch: ((value: string) => void) | undefined;
		const fetcher = vi.fn(
			() =>
				new Promise<string>((resolve) => {
					resolveFetch = resolve;
				}),
		);

		const first = cache.getOrFetch("catalog", fetcher);
		const second = cache.getOrFetch("catalog", fetcher);

		expect(fetcher).toHaveBeenCalledTimes(1);

		if (!resolveFetch) {
			throw new Error("Expected fetch resolver to be assigned.");
		}
		resolveFetch("shared");

		const [firstResult, secondResult] = await Promise.all([first, second]);
		expect(firstResult).toBe("shared");
		expect(secondResult).toBe("shared");
	});

	it("does not poison cache after failed fetch and retries on next call", async () => {
		const cache = new AsyncTtlCache<string, string>({
			ttlMs: 60_000,
			maxSize: 2,
		});

		const fetcher = vi
			.fn()
			.mockRejectedValueOnce(new Error("catalog fetch failed"))
			.mockResolvedValueOnce("recovered");

		await expect(cache.getOrFetch("catalog", fetcher)).rejects.toThrow(
			"catalog fetch failed",
		);
		await expect(cache.getOrFetch("catalog", fetcher)).resolves.toBe(
			"recovered",
		);

		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it("does not let an older unshared fetch commit after the newer generation settles", async () => {
		const cache = new AsyncTtlCache<string, string>({
			ttlMs: 60_000,
			maxSize: 2,
		});
		let resolveFirst!: (value: string) => void;
		const fetcher = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise<string>((resolve) => {
						resolveFirst = resolve;
					}),
			)
			.mockResolvedValueOnce("newer");

		const first = cache.getOrFetch("catalog", fetcher, {
			shareInFlight: false,
		});
		const second = cache.getOrFetch("catalog", fetcher, {
			shareInFlight: false,
		});

		await expect(second).resolves.toBe("newer");
		resolveFirst("older");
		await expect(first).resolves.toBe("older");
		// The newer request cleaned up its generation before the older one
		// settled; the older result must still be rejected for cache commit.
		await expect(
			cache.getOrFetch("catalog", () => Promise.resolve("unused")),
		).resolves.toBe("newer");
	});

	it("keeps caller cancellation classifiable while waiting on shared work", async () => {
		const cache = new AsyncTtlCache<string, string>({
			ttlMs: 60_000,
			maxSize: 2,
		});
		let resolveFetch!: (value: string) => void;
		const first = cache.getOrFetch(
			"catalog",
			() =>
				new Promise<string>((resolve) => {
					resolveFetch = resolve;
				}),
		);
		const controller = new AbortController();
		const second = cache.getOrFetch(
			"catalog",
			() => Promise.resolve("shared"),
			{
				signal: controller.signal,
			},
		);
		controller.abort(new DOMException("caller cancelled", "AbortError"));
		const error = await second.catch((reason: Error | string) => reason);
		expect(createSafeErrorDiagnostic(error)).toMatchObject({
			outcome: "cancelled",
			commit_state: "unknown",
			safe_to_retry: false,
		});
		resolveFetch("shared");
		await first;
	});

	it("rejects an already-canceled caller before returning a cached value", async () => {
		const cache = new AsyncTtlCache<string, string>({
			ttlMs: 60_000,
			maxSize: 2,
		});
		await cache.getOrFetch("catalog", () => Promise.resolve("cached"));
		const controller = new AbortController();
		const reason = new DOMException("caller canceled", "AbortError");
		controller.abort(reason);

		await expect(
			cache.getOrFetch("catalog", () => Promise.resolve("unused"), {
				signal: controller.signal,
			}),
		).rejects.toBe(reason);
	});

	it("rejects a caller whose cache deadline has already elapsed", async () => {
		const cache = new AsyncTtlCache<string, string>({
			ttlMs: 60_000,
			maxSize: 2,
		});
		await cache.getOrFetch("catalog", () => Promise.resolve("cached"));

		await expect(
			cache.getOrFetch("catalog", () => Promise.resolve("unused"), {
				deadline: Date.now() - 1,
			}),
		).rejects.toMatchObject({ name: "TimeoutError" });
	});

	it("enforces a caller deadline while shared work is still pending", async () => {
		vi.useFakeTimers();
		const cache = new AsyncTtlCache<string, string>({
			ttlMs: 60_000,
			maxSize: 2,
		});
		const pending = cache.getOrFetch(
			"catalog",
			() => new Promise<string>(() => {}),
		);
		const request = cache.getOrFetch(
			"catalog",
			() => Promise.resolve("unused"),
			{ deadline: Date.now() + 1_000 },
		);
		const rejected = expect(request).rejects.toMatchObject({
			name: "TimeoutError",
		});

		await vi.advanceTimersByTimeAsync(1_000);
		await rejected;
		void pending;
	});

	it("observes cache states without exposing keys", async () => {
		const events: string[] = [];
		const cache = new AsyncTtlCache<string, string>({
			ttlMs: 60_000,
			maxSize: 2,
			observer: {
				start: ({ state }) => {
					events.push(`start:${state}`);
					return { finish: () => events.push(`finish:${state}`) };
				},
			},
		});
		let resolveFetch!: (value: string) => void;
		const fetcher = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise<string>((resolve) => {
						resolveFetch = resolve;
					}),
			)
			.mockResolvedValueOnce("fresh");

		const first = cache.getOrFetch("private-key", fetcher);
		const second = cache.getOrFetch("private-key", fetcher);
		expect(events).toEqual(["start:miss", "start:inflight_wait"]);

		resolveFetch("catalog");
		await Promise.all([first, second]);
		await cache.getOrFetch("private-key", fetcher);
		await cache.getOrFetch("private-key", fetcher, { refresh: true });

		expect(events).toEqual([
			"start:miss",
			"start:inflight_wait",
			"finish:miss",
			"finish:inflight_wait",
			"start:hit",
			"finish:hit",
			"start:refresh",
			"finish:refresh",
		]);
		expect(JSON.stringify(events)).not.toContain("private-key");
	});
});
