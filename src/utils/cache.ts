export interface AsyncCacheOptions {
	ttlMs: number;
	maxSize: number;
}

export interface CacheGetOptions {
	refresh?: boolean;
}

interface CacheEntry<TValue> {
	value: TValue;
	expiresAt: number;
}

interface InFlightEntry<TValue> {
	promise: Promise<TValue>;
	requestId: number;
}

/**
 * Shared in-memory cache for async fetches with TTL, LRU eviction,
 * in-flight de-duplication, and explicit refresh/invalidation support.
 */
export class AsyncTtlCache<TKey, TValue> {
	private readonly ttlMs: number;
	private readonly maxSize: number;
	private readonly now: () => number;
	private readonly entries = new Map<TKey, CacheEntry<TValue>>();
	private readonly inFlight = new Map<TKey, InFlightEntry<TValue>>();
	private requestCounter = 0;

	constructor(options: AsyncCacheOptions, now: () => number = Date.now) {
		const { ttlMs, maxSize } = options;
		if (ttlMs <= 0) {
			throw new Error("Cache ttlMs must be greater than 0.");
		}
		if (maxSize <= 0) {
			throw new Error("Cache maxSize must be greater than 0.");
		}

		this.ttlMs = ttlMs;
		this.maxSize = maxSize;
		this.now = now;
	}

	async getOrFetch(
		key: TKey,
		fetcher: () => Promise<TValue>,
		options: CacheGetOptions = {},
	): Promise<TValue> {
		const { refresh = false } = options;

		if (refresh) {
			this.invalidate(key);
		} else {
			const cachedEntry = this.entries.get(key);
			if (cachedEntry !== undefined) {
				if (cachedEntry.expiresAt > this.now()) {
					this.markAsRecentlyUsed(key, cachedEntry);
					return cachedEntry.value;
				}

				this.entries.delete(key);
			}

			const inFlightEntry = this.inFlight.get(key);
			if (inFlightEntry !== undefined) {
				return inFlightEntry.promise;
			}
		}

		const requestId = ++this.requestCounter;
		const request = (async () => {
			try {
				const value = await fetcher();

				if (this.isCurrentRequest(key, requestId)) {
					this.setValue(key, value);
				}

				return value;
			} finally {
				const inFlightEntry = this.inFlight.get(key);
				if (inFlightEntry?.requestId === requestId) {
					this.inFlight.delete(key);
				}
			}
		})();

		this.inFlight.set(key, { promise: request, requestId });
		return request;
	}

	invalidate(key: TKey): void {
		this.entries.delete(key);
		this.inFlight.delete(key);
	}

	clear(): void {
		this.entries.clear();
		this.inFlight.clear();
	}

	get size(): number {
		return this.entries.size;
	}

	private isCurrentRequest(key: TKey, requestId: number): boolean {
		return this.inFlight.get(key)?.requestId === requestId;
	}

	private markAsRecentlyUsed(key: TKey, entry: CacheEntry<TValue>): void {
		this.entries.delete(key);
		this.entries.set(key, entry);
	}

	private setValue(key: TKey, value: TValue): void {
		this.entries.delete(key);
		this.entries.set(key, {
			value,
			expiresAt: this.now() + this.ttlMs,
		});

		this.evictLeastRecentlyUsed();
	}

	private evictLeastRecentlyUsed(): void {
		while (this.entries.size > this.maxSize) {
			const oldestKey = this.entries.keys().next().value;
			if (oldestKey === undefined) {
				return;
			}

			this.entries.delete(oldestKey);
		}
	}
}
