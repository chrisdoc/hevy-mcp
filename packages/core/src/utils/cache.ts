import type { ResultCountBucket } from "./result-telemetry.js";
import type { RuntimeValue } from "./type-predicates.js";

export type CacheObservationState =
	| "hit"
	| "miss"
	| "refresh"
	| "expired"
	| "inflight_wait";

export interface CacheObservationMetadata {
	readonly refreshReason?: "explicit-refresh" | "initial-load" | "ttl-expired";
	readonly pageCountBucket?: ResultCountBucket;
	readonly itemCountBucket?: ResultCountBucket;
}

export interface CacheObservation extends CacheObservationMetadata {
	readonly state: CacheObservationState;
}

export interface CacheObservationScope {
	finish(metadata?: CacheObservationMetadata): void;
}

export interface CacheObserver {
	start(observation: CacheObservation): CacheObservationScope | void;
}

export interface AsyncCacheOptions {
	ttlMs: number;
	maxSize: number;
	observer?: CacheObserver;
}

export interface CacheGetOptions {
	refresh?: boolean;
	/** Controlled callers must not share an in-flight request they can cancel. */
	shareInFlight?: boolean;
	signal?: AbortSignal;
	deadline?: number;
	getObservationMetadata?: () => CacheObservationMetadata | undefined;
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
	private readonly observer?: CacheObserver;
	private readonly entries = new Map<TKey, CacheEntry<TValue>>();
	private readonly inFlight = new Map<TKey, InFlightEntry<TValue>>();
	/** Latest request generation per key, including unshared requests. */
	private readonly latestRequestIds = new Map<TKey, number>();
	private requestCounter = 0;

	constructor(options: AsyncCacheOptions, now: () => number = Date.now) {
		const { ttlMs, maxSize, observer } = options;
		if (ttlMs <= 0) {
			throw new Error("Cache ttlMs must be greater than 0.");
		}
		if (maxSize <= 0) {
			throw new Error("Cache maxSize must be greater than 0.");
		}

		this.ttlMs = ttlMs;
		this.maxSize = maxSize;
		this.now = now;
		this.observer = observer;
	}

	private startObservation(
		state: CacheObservationState,
	): CacheObservationScope | undefined {
		try {
			return this.observer?.start({ state }) ?? undefined;
		} catch {
			return undefined;
		}
	}

	private finishObservation(
		scope: CacheObservationScope | undefined,
		metadata?: CacheObservationMetadata,
	): void {
		try {
			scope?.finish(metadata);
		} catch {
			// Cache observation is best-effort and cannot affect cache behavior.
		}
	}

	private async waitForCaller<T>(
		promise: Promise<T>,
		signal?: AbortSignal,
		deadline?: number,
	): Promise<T> {
		if (signal === undefined && deadline === undefined) return promise;
		if (signal?.aborted) {
			throw (
				signal.reason ?? new DOMException("Operation canceled", "AbortError")
			);
		}
		if (deadline !== undefined && Date.now() >= deadline) {
			throw new DOMException("Operation deadline exceeded", "TimeoutError");
		}
		return new Promise<T>((resolve, reject) => {
			let settled = false;
			let timer: ReturnType<typeof setTimeout> | undefined;
			const cleanup = () => {
				if (timer !== undefined) clearTimeout(timer);
				signal?.removeEventListener("abort", onAbort);
			};
			const finish = (callback: () => void) => {
				if (settled) return;
				settled = true;
				cleanup();
				callback();
			};
			const onAbort = () =>
				finish(() =>
					reject(
						signal?.reason ??
							new DOMException("Operation canceled", "AbortError"),
					),
				);
			if (signal !== undefined)
				signal.addEventListener("abort", onAbort, { once: true });
			if (deadline !== undefined) {
				timer = setTimeout(
					() =>
						finish(() =>
							reject(
								new DOMException("Operation deadline exceeded", "TimeoutError"),
							),
						),
					Math.max(0, deadline - Date.now()),
				);
			}
			void promise.then(
				(value) => finish(() => resolve(value)),
				(error: RuntimeValue) => finish(() => reject(error)),
			);
		});
	}

	async getOrFetch(
		key: TKey,
		fetcher: () => Promise<TValue>,
		options: CacheGetOptions = {},
	): Promise<TValue> {
		const {
			refresh = false,
			shareInFlight = true,
			signal,
			deadline,
			getObservationMetadata,
		} = options;
		let observationState: CacheObservationState = refresh ? "refresh" : "miss";

		if (refresh) {
			if (shareInFlight) this.invalidate(key);
		} else {
			const cachedEntry = this.entries.get(key);
			if (cachedEntry !== undefined) {
				if (cachedEntry.expiresAt > this.now()) {
					this.markAsRecentlyUsed(key, cachedEntry);
					const observationScope = this.startObservation("hit");
					this.finishObservation(observationScope);
					return this.waitForCaller(
						Promise.resolve(cachedEntry.value),
						signal,
						deadline,
					);
				}

				this.entries.delete(key);
				observationState = "expired";
			}

			const inFlightEntry = shareInFlight ? this.inFlight.get(key) : undefined;
			if (inFlightEntry !== undefined) {
				const observationScope = this.startObservation("inflight_wait");
				void inFlightEntry.promise.then(
					() => this.finishObservation(observationScope),
					() => this.finishObservation(observationScope),
				);
				return this.waitForCaller(inFlightEntry.promise, signal, deadline);
			}
		}

		const requestId = ++this.requestCounter;
		this.latestRequestIds.set(key, requestId);
		const observationScope = this.startObservation(observationState);
		const request = (async () => {
			try {
				const value = await fetcher();

				if (this.isCurrentRequest(key, requestId)) {
					this.setValue(key, value);
				}

				return value;
			} finally {
				let metadata: CacheObservationMetadata | undefined;
				try {
					metadata = getObservationMetadata?.();
				} catch {
					metadata = undefined;
				}
				this.finishObservation(observationScope, metadata);
				const inFlightEntry = shareInFlight
					? this.inFlight.get(key)
					: undefined;
				if (inFlightEntry?.requestId === requestId) {
					this.inFlight.delete(key);
				}
				if (this.latestRequestIds.get(key) === requestId) {
					this.latestRequestIds.delete(key);
				}
			}
		})();

		if (shareInFlight) this.inFlight.set(key, { promise: request, requestId });
		return this.waitForCaller(request, signal, deadline);
	}

	invalidate(key: TKey): void {
		this.entries.delete(key);
		this.inFlight.delete(key);
		this.latestRequestIds.delete(key);
	}

	clear(): void {
		this.entries.clear();
		this.inFlight.clear();
		this.latestRequestIds.clear();
	}

	get size(): number {
		return this.entries.size;
	}

	private isCurrentRequest(key: TKey, requestId: number): boolean {
		return this.latestRequestIds.get(key) === requestId;
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
