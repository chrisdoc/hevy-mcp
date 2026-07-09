import { afterEach, describe, expect, it, vi } from "vitest";
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

		const fetcher = vi.fn(async (key: string) => `${key}-value`);
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
});
