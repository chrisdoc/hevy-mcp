import { Cache, Clock, Deferred, Effect, Fiber, Option } from "effect";
import type { HevyRequestOptions } from "@hevy-mcp/hevy-client";
import type { ExerciseTemplate } from "@hevy-mcp/hevy-client/types";
import type { TemplatesListAllOperation } from "@hevy-mcp/operations";
import type {
	CacheObservationMetadata,
	CacheObservationScope,
	CacheObservationState,
	CacheObserver,
} from "./cache.js";
import { bucketCount } from "./result-telemetry.js";

export const EXERCISE_TEMPLATE_CATALOG_CACHE_KEY = "exercise-template-catalog";
export const EXERCISE_TEMPLATE_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
export const EXERCISE_TEMPLATE_CATALOG_CACHE_MAX_SIZE = 1;
const EXERCISE_TEMPLATE_CATALOG_PAGE_SIZE = 100;

export type ExerciseTemplateCatalogRefreshReason =
	| "explicit-refresh"
	| "initial-load"
	| "ttl-expired";

export interface ExerciseTemplateCatalogOptions {
	refresh?: boolean;
	execution?: HevyRequestOptions;
	onRefreshed?: (
		catalog: ExerciseTemplate[],
		reason: ExerciseTemplateCatalogRefreshReason,
	) => void;
}

type TemplateListAllError = Effect.Error<
	ReturnType<TemplatesListAllOperation["effect"]>
>;
export type ExerciseTemplateCatalogCache = Cache.Cache<
	string,
	ExerciseTemplate[],
	TemplateListAllError
>;
export interface ExerciseTemplateCatalog {
	effect(
		options?: ExerciseTemplateCatalogOptions,
	): Effect.Effect<ExerciseTemplate[], TemplateListAllError>;
	get(options?: ExerciseTemplateCatalogOptions): Promise<ExerciseTemplate[]>;
	reset(): void;
	close?(): void;
}

type CatalogOperations = {
	readonly templates?: {
		readonly listAll?: Pick<TemplatesListAllOperation, "effect">;
	};
};

function startObservation(
	observer: CacheObserver | undefined,
	state: CacheObservationState,
) {
	try {
		return observer?.start({ state });
	} catch {
		return undefined;
	}
}
function finishObservation(
	scope: CacheObservationScope | void,
	metadata?: CacheObservationMetadata,
): void {
	try {
		scope?.finish(metadata);
	} catch {
		// Observability is not allowed to affect catalog behavior.
	}
}
function notifyRefreshed(
	options: ExerciseTemplateCatalogOptions,
	catalog: ExerciseTemplate[],
	reason: ExerciseTemplateCatalogRefreshReason,
): void {
	try {
		const callback = options.onRefreshed;
		if (!callback) return;
		// Refresh notifications are telemetry. Defer invocation so both
		// synchronous throws and rejected promises are contained here.
		void Promise.resolve()
			.then(() => callback(catalog, reason))
			.catch(() => undefined);
	} catch {
		// Callbacks are best effort.
	}
}
function catalogPageCount(catalog: readonly ExerciseTemplate[]): number {
	const pages = (
		catalog as ExerciseTemplate[] & { readonly pageCount?: number }
	).pageCount;
	return (
		pages ??
		Math.max(1, Math.ceil(catalog.length / EXERCISE_TEMPLATE_CATALOG_PAGE_SIZE))
	);
}

export function createExerciseTemplateCatalog(
	operations: CatalogOperations,
	cache: ExerciseTemplateCatalogCache,
	cacheObserver?: CacheObserver,
): ExerciseTemplateCatalog {
	const listAll = operations.templates?.listAll;
	if (!listAll)
		throw new Error("Exercise template list operation is unavailable.");

	let hasLoadedValue = false;
	let generation = 0;
	let inFlight:
		| {
				deferred: Deferred.Deferred<ExerciseTemplate[], TemplateListAllError>;
				fiber: Fiber.Fiber<boolean, never>;
				waiters: number;
		  }
		| undefined;

	const getState = Effect.fn("core.exerciseTemplateCatalog.cacheState")(
		function* () {
			const success = yield* Cache.getSuccess(
				cache,
				EXERCISE_TEMPLATE_CATALOG_CACHE_KEY,
			);
			if (Option.isSome(success)) return "hit" as const;
			const present = yield* Cache.has(
				cache,
				EXERCISE_TEMPLATE_CATALOG_CACHE_KEY,
			);
			return present
				? ("inflight_wait" as const)
				: hasLoadedValue
					? ("expired" as const)
					: ("miss" as const);
		},
	);

	const awaitAbort = (signal: AbortSignal) =>
		Effect.callback<never, TemplateListAllError>((resume) => {
			const abort = () =>
				resume(
					Effect.fail(
						signal.reason ??
							new DOMException("Operation canceled", "AbortError"),
					) as Effect.Effect<never, TemplateListAllError>,
				);
			if (signal.aborted) abort();
			else signal.addEventListener("abort", abort, { once: true });
			return Effect.sync(() => signal.removeEventListener("abort", abort));
		});

	const effect = Effect.fn("core.exerciseTemplateCatalog.get")(function* (
		options: ExerciseTemplateCatalogOptions = {},
	): Effect.fn.Return<ExerciseTemplate[], TemplateListAllError> {
		const refresh = options.refresh === true;
		const state = refresh ? "refresh" : yield* getState();
		const observationScope = startObservation(cacheObserver, state);
		const reason: ExerciseTemplateCatalogRefreshReason =
			state === "refresh"
				? "explicit-refresh"
				: state === "expired"
					? "ttl-expired"
					: "initial-load";
		let metadata: CacheObservationMetadata | undefined;
		const currentGeneration = ++generation;
		const load = Effect.gen(function* () {
			const catalog = yield* refresh
				? listAll.effect()
				: Cache.get(cache, EXERCISE_TEMPLATE_CATALOG_CACHE_KEY);
			if (refresh)
				yield* Cache.set(cache, EXERCISE_TEMPLATE_CATALOG_CACHE_KEY, catalog);
			hasLoadedValue = true;
			return catalog;
		});
		let shared = inFlight;
		if (!shared) {
			const deferred = yield* Deferred.make<
				ExerciseTemplate[],
				TemplateListAllError
			>();
			const fiber = yield* Effect.forkDetach(
				Effect.ensuring(
					Effect.flatMap(Effect.exit(load), (exit) =>
						Deferred.done(deferred, exit),
					),
					Effect.sync(() => {
						if (inFlight?.deferred === deferred) inFlight = undefined;
					}),
				),
			);
			shared = { deferred, fiber, waiters: 0 };
			inFlight = shared;
		}
		const loaded = Effect.gen(function* () {
			shared.waiters += 1;
			return yield* Effect.ensuring(
				Deferred.await(shared.deferred).pipe(
					Effect.raceFirst(
						options.execution?.signal
							? awaitAbort(options.execution.signal)
							: Effect.never,
					),
				),
				Effect.sync(() => {
					shared.waiters -= 1;
					if (shared.waiters === 0 && inFlight === shared) {
						inFlight = undefined;
						void Effect.runPromise(Fiber.interrupt(shared.fiber));
					}
				}),
			);
		});
		const controlled = options.execution
			? checkExecution(options.execution).pipe(Effect.flatMap(() => loaded))
			: loaded;
		return yield* Effect.ensuring(
			controlled.pipe(
				Effect.tap((catalog) =>
					Effect.sync(() => {
						if (currentGeneration === generation && state !== "hit") {
							metadata = {
								refreshReason: reason,
								pageCountBucket: bucketCount(catalogPageCount(catalog)),
								itemCountBucket: bucketCount(catalog.length),
							};
							if (state !== "inflight_wait")
								notifyRefreshed(options, catalog, reason);
						}
					}),
				),
				Effect.catch((error) =>
					Effect.flatMap(
						Cache.invalidate(cache, EXERCISE_TEMPLATE_CATALOG_CACHE_KEY),
						() => Effect.fail(error),
					),
				),
			),
			Effect.sync(() => finishObservation(observationScope, metadata)),
		);
	});

	return {
		effect,
		get: (options) => Effect.runPromise(effect(options)),
		reset() {
			hasLoadedValue = false;
			generation += 1;
			if (inFlight) void Effect.runPromise(Fiber.interrupt(inFlight.fiber));
			inFlight = undefined;
			Effect.runSync(
				Cache.invalidate(cache, EXERCISE_TEMPLATE_CATALOG_CACHE_KEY),
			);
		},
		close() {
			if (inFlight) void Effect.runPromise(Fiber.interrupt(inFlight.fiber));
			inFlight = undefined;
		},
	};
}

function checkExecution(execution: HevyRequestOptions) {
	return Effect.gen(function* () {
		if (execution.signal?.aborted) {
			return yield* Effect.fail(
				execution.signal.reason ??
					new DOMException("Operation canceled", "AbortError"),
			);
		}
		const now = yield* Clock.currentTimeMillis;
		if (execution.deadline !== undefined && now >= execution.deadline) {
			return yield* Effect.fail(
				new DOMException("Operation deadline exceeded", "TimeoutError"),
			);
		}
	});
}
