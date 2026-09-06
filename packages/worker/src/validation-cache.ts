/// <reference types="@cloudflare/workers-types" />

import { Cause, Duration, Effect, Schedule } from "effect";
import { createSafeErrorDiagnostic } from "@hevy-mcp/core";
import {
	isHevyHttpError,
	type HevyClient,
	type HevyRequestOptions,
} from "@hevy-mcp/hevy-client";
import { interruptOnAbortSignal } from "@hevy-mcp/hevy-client/internal";
import { isOAuthEnabled, type HevyApiKeyValidation } from "./worker-oauth.js";

/** How long a successful Hevy key validation is trusted before re-checking upstream. */
export const VALIDATION_CACHE_TTL_SECONDS = 900;

const VALIDATION_CACHE_KEY_PREFIX = "keyvalid:";
/** The only value `cacheValidation` ever writes; a KV read must match it exactly. */
const VALIDATION_CACHE_SENTINEL = "valid";
/** Bound the in-memory fallback so a flood of distinct keys cannot grow it unbounded. */
export const MEMORY_CACHE_MAX_ENTRIES = 256;

/** Structural env shape this module needs; kept independent of `WorkerEnv`. */
export interface ValidationCacheEnv {
	OAUTH_KV?: unknown;
	HEVY_VALIDATION_RETRY_DELAYS_MS?: string;
}

interface ValidationCacheKvNamespace {
	get(key: string): Promise<string | null>;
	put(
		key: string,
		value: string,
		options?: { expirationTtl?: number },
	): Promise<void>;
}

/**
 * Fallback store for isolates without a reachable KV binding (local dev,
 * unit tests, or a misconfigured OAUTH_KV). Module-scoped so a warm isolate
 * still benefits, but unlike KV it never survives a cold start and never
 * shares state across isolates. Insertion-ordered so the oldest entry is
 * evicted first once the cap is reached.
 */
const memoryCache = new Map<string, number>();

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(value),
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

async function cacheKeyFor(apiKey: string): Promise<string> {
	return `${VALIDATION_CACHE_KEY_PREFIX}${await sha256Hex(apiKey)}`;
}

function kvNamespace(
	env: ValidationCacheEnv,
): ValidationCacheKvNamespace | undefined {
	return isOAuthEnabled(env)
		? (env.OAUTH_KV as ValidationCacheKvNamespace)
		: undefined;
}

function rememberInMemory(key: string): void {
	memoryCache.set(key, Date.now() + VALIDATION_CACHE_TTL_SECONDS * 1_000);
	while (memoryCache.size > MEMORY_CACHE_MAX_ENTRIES) {
		const oldestKey = memoryCache.keys().next().value;
		if (oldestKey === undefined) break;
		memoryCache.delete(oldestKey);
	}
}

/**
 * Whether `apiKey` has an unexpired cached "valid" verdict. A hit lets a
 * transient Hevy outage (e.g. a 429) skip the upstream validation call
 * entirely for a key that was confirmed valid recently.
 */
export async function hasCachedValidation(
	apiKey: string,
	env: ValidationCacheEnv,
): Promise<boolean> {
	const key = await cacheKeyFor(apiKey);
	const kv = kvNamespace(env);
	if (kv) {
		try {
			return (await kv.get(key)) === VALIDATION_CACHE_SENTINEL;
		} catch {
			// A cache read failure must fall through to a real validation call,
			// not fail the request.
			return false;
		}
	}
	const expiresAt = memoryCache.get(key);
	if (expiresAt === undefined) return false;
	if (expiresAt <= Date.now()) {
		memoryCache.delete(key);
		return false;
	}
	return true;
}

/** Record a successful validation so a request within the TTL can skip Hevy. */
export async function cacheValidation(
	apiKey: string,
	env: ValidationCacheEnv,
): Promise<void> {
	const key = await cacheKeyFor(apiKey);
	const kv = kvNamespace(env);
	if (kv) {
		try {
			await kv.put(key, VALIDATION_CACHE_SENTINEL, {
				expirationTtl: VALIDATION_CACHE_TTL_SECONDS,
			});
		} catch {
			// Best-effort: a cache write failure must not fail an otherwise-valid request.
		}
		return;
	}
	rememberInMemory(key);
}

/** Test-only: clear the in-memory fallback so cases don't leak into each other. */
export function resetMemoryValidationCacheForTests(): void {
	memoryCache.clear();
}

/** The shape of the plain, unmodified (upstream) `validateHevyApiKey`. */
export type HevyKeyValidator = (
	apiKey: string,
	hevyApiBaseUrl: string,
	createValidationClient: (apiKey: string, baseUrl: string) => HevyClient,
	options?: HevyRequestOptions,
) => Promise<HevyApiKeyValidation>;

export const DEFAULT_VALIDATION_RETRY_DELAYS_MS = [300, 600] as const;

export function parseValidationRetryDelays(raw?: string): readonly number[] {
	if (!raw) return DEFAULT_VALIDATION_RETRY_DELAYS_MS;
	const tokens = raw.split(",");
	const parsed: number[] = [];
	for (const token of tokens) {
		const trimmed = token.trim();
		if (trimmed === "") return DEFAULT_VALIDATION_RETRY_DELAYS_MS;
		const n = Number(trimmed);
		if (!Number.isInteger(n) || n < 0) {
			return DEFAULT_VALIDATION_RETRY_DELAYS_MS;
		}
		parsed.push(n);
	}
	return parsed.length > 0 ? parsed : DEFAULT_VALIDATION_RETRY_DELAYS_MS;
}

function resolveValidationRetryDelays(
	env?: ValidationCacheEnv,
): readonly number[] {
	const globalProcess = (
		globalThis as {
			readonly process?: {
				readonly env?: Record<string, string | undefined>;
			};
		}
	).process;
	const raw =
		env?.HEVY_VALIDATION_RETRY_DELAYS_MS ??
		globalProcess?.env?.HEVY_VALIDATION_RETRY_DELAYS_MS;
	return parseValidationRetryDelays(raw);
}

/**
 * Whether a failed validation attempt is worth retrying.
 *
 * HTTP 429 is deliberately excluded: fast-retrying it would spend up to
 * three Hevy calls in a few seconds against the exact rate limit that
 * caused the outage this module guards against. The shared hevy-client
 * retry classification (packages/hevy-client) treats 429 as transient and
 * has no per-call override for that; carving it out there would mean
 * touching upstream-owned client internals, so the exclusion lives here
 * instead, local to this one caller.
 */
function isRetryableValidationFailure<T>(error: T): boolean {
	if (!isHevyHttpError(error)) return false;
	if (error.outcome === "deadline_exceeded") return false;
	const status = error.status;
	if (status === 429) return false;
	return (
		status === undefined || status === 408 || (status >= 500 && status <= 599)
	);
}

function logValidationRetry<T>(
	attempt: number,
	maxAttempts: number,
	delayMs: number,
	error: T,
): void {
	console.warn({
		event: "worker.hevy_validation_retry",
		attempt,
		maxAttempts,
		delayMs,
		...createSafeErrorDiagnostic(error),
	});
}

/**
 * Execution-context-like handle for deferring the cache write past the
 * response. Structural (not the full Cloudflare `ExecutionContext`) so this
 * module doesn't need to depend on callers having one.
 */
export interface WaitUntilHandle {
	waitUntil(promise: Promise<unknown>): void;
}

function validationRetrySchedule(
	options: HevyRequestOptions | undefined,
	retryDelaysMs: readonly number[],
): Schedule.Schedule<number, unknown, never> {
	const maxAttempts = retryDelaysMs.length + 1;
	return Schedule.recurs(retryDelaysMs.length).pipe(
		Schedule.while((metadata: Schedule.Metadata<number, unknown>) => {
			const delayMs = retryDelaysMs[metadata.attempt - 1];
			if (
				delayMs === undefined ||
				!isRetryableValidationFailure(metadata.input)
			) {
				return false;
			}
			if (
				options?.deadline !== undefined &&
				Date.now() + delayMs >= options.deadline
			) {
				return false;
			}
			logValidationRetry(
				metadata.attempt,
				maxAttempts,
				delayMs,
				metadata.input,
			);
			return true;
		}),
		Schedule.addDelay((metadata) => {
			const delayMs = retryDelaysMs[metadata.attempt - 1];
			return Effect.succeed(
				Duration.millis(delayMs === undefined ? 0 : delayMs),
			);
		}),
	);
}

/**
 * Wrap the plain `validateHevyApiKey` with this fork's resilience additions:
 * a cache check/set (skips Hevy entirely on a recent "valid" verdict), and a
 * bounded retry for transient upstream failures. Never caches "invalid" or
 * thrown verdicts — only a confirmed-valid key is cached.
 *
 * When `executionContext` is supplied, the cache write is deferred via
 * `waitUntil` so it never adds latency to the response; otherwise it's
 * awaited inline (the OAuth validation path doesn't have one reachable
 * today).
 */
export async function validateHevyApiKeyResilient(
	apiKey: string,
	hevyApiBaseUrl: string,
	createValidationClient: (apiKey: string, baseUrl: string) => HevyClient,
	validate: HevyKeyValidator,
	env: ValidationCacheEnv,
	options?: HevyRequestOptions,
	executionContext?: WaitUntilHandle,
): Promise<HevyApiKeyValidation> {
	if (options?.signal?.aborted) {
		throw (
			options.signal.reason ??
			new DOMException("Validation request canceled", "AbortError")
		);
	}
	if (await hasCachedValidation(apiKey, env)) return "valid";

	const retryDelaysMs = resolveValidationRetryDelays(env);
	const validationProgram = Effect.retry(
		Effect.tryPromise({
			try: () =>
				validate(apiKey, hevyApiBaseUrl, createValidationClient, options),
			catch: (error) => error,
		}),
		validationRetrySchedule(options, retryDelaysMs),
	);
	const cancellableProgram = options?.signal
		? Effect.raceFirst(
				validationProgram,
				interruptOnAbortSignal(options.signal),
			)
		: validationProgram;
	const result = await Effect.runPromise(
		cancellableProgram.pipe(
			Effect.catchCause((cause) => {
				if (!Cause.hasInterrupts(cause)) return Effect.failCause(cause);
				return Effect.fail(
					options?.signal?.reason ??
						new DOMException("Validation request canceled", "AbortError"),
				);
			}),
		),
	);
	if (result === "valid") {
		const write = cacheValidation(apiKey, env);
		if (executionContext) executionContext.waitUntil(write);
		else await write;
	}
	return result;
}
