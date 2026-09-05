import type { ResultCountBucket } from "./result-telemetry.js";

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
