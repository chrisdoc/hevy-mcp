import { Cache, Effect, Option } from "effect";
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
	/**
	 * Effect-first catalog access for MCP resource and tool handlers.
	 *
	 * The server owns the cache passed to this catalog. Keeping this program
	 * Effect-valued lets the request handler decide where the one Promise
	 * collapse belongs.
	 */
	effect(
		options?: ExerciseTemplateCatalogOptions,
	): Effect.Effect<ExerciseTemplate[], TemplateListAllError>;
	/**
	 * Promise compatibility for callers that have not moved to the handler
	 * Effect boundary yet.
	 */
	get(options?: ExerciseTemplateCatalogOptions): Promise<ExerciseTemplate[]>;
	reset(): void;
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
		// Cache observation is best-effort and cannot affect cache behavior.
	}
}

function notifyRefreshed(
	options: ExerciseTemplateCatalogOptions,
	catalog: ExerciseTemplate[],
	reason: ExerciseTemplateCatalogRefreshReason,
): void {
	try {
		options.onRefreshed?.(catalog, reason);
	} catch {
		// Cache callbacks are best-effort and cannot affect catalog behavior.
	}
}

function catalogPageCount(catalog: readonly ExerciseTemplate[]): number {
	const pages = (
		catalog as ExerciseTemplate[] & {
			readonly pageCount?: number;
		}
	).pageCount;
	if (pages !== undefined) return pages;
	return Math.max(
		1,
		Math.ceil(catalog.length / EXERCISE_TEMPLATE_CATALOG_PAGE_SIZE),
	);
}

/**
 * Build the catalog facade around one server-owned Effect Cache.
 *
 * `cache` is deliberately supplied by the server rather than constructed
 * here. This keeps cache lifetime at server/process scope instead of making it
 * request-local in `createToolRuntime` or `forExecution`.
 */
export function createExerciseTemplateCatalog(
	operations: CatalogOperations,
	cache: ExerciseTemplateCatalogCache,
	cacheObserver?: CacheObserver,
): ExerciseTemplateCatalog {
	const listAll = operations.templates?.listAll;
	if (!listAll) {
		throw new Error("Exercise template list operation is unavailable.");
	}
	let hasLoadedValue = false;
	let requestGeneration = 0;

	const getCacheState = Effect.fn("core.exerciseTemplateCatalog.cacheState")(
		function* () {
			const successful = yield* Cache.getSuccess(
				cache,
				EXERCISE_TEMPLATE_CATALOG_CACHE_KEY,
			);
			if (Option.isSome(successful)) {
				return "hit" as const;
			}
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

	const effect = Effect.fn("core.exerciseTemplateCatalog.get")(function* (
		options: ExerciseTemplateCatalogOptions = {},
	) {
		const refresh = options.refresh === true;
		const execution = options.execution;
		const observedState = refresh ? "refresh" : yield* getCacheState();
		const state =
			execution !== undefined && observedState === "inflight_wait"
				? "miss"
				: observedState;
		const observationScope = startObservation(cacheObserver, state);
		const reason: ExerciseTemplateCatalogRefreshReason =
			state === "refresh"
				? "explicit-refresh"
				: state === "expired"
					? "ttl-expired"
					: "initial-load";
		const sharedCacheLoad = state === "hit" || state === "inflight_wait";
		const bypassCache = refresh || (execution !== undefined && state !== "hit");
		const replaceSharedCacheLoad =
			observedState === "inflight_wait" && (refresh || execution !== undefined);
		const generation = sharedCacheLoad
			? requestGeneration
			: ++requestGeneration;
		const load = bypassCache
			? replaceSharedCacheLoad
				? Cache.invalidate(cache, EXERCISE_TEMPLATE_CATALOG_CACHE_KEY).pipe(
						Effect.flatMap(() =>
							execution === undefined
								? listAll.effect()
								: listAll.effect(execution),
						),
					)
				: execution === undefined
					? listAll.effect()
					: listAll.effect(execution)
			: Cache.get(cache, EXERCISE_TEMPLATE_CATALOG_CACHE_KEY);
		const shouldNotify = !sharedCacheLoad;
		let observationMetadata: CacheObservationMetadata | undefined;

		const observedLoad = load.pipe(
			Effect.tap((catalog) =>
				Effect.gen(function* () {
					if (!sharedCacheLoad && generation === requestGeneration) {
						hasLoadedValue = true;
					}
					if (bypassCache && generation === requestGeneration) {
						yield* Cache.set(
							cache,
							EXERCISE_TEMPLATE_CATALOG_CACHE_KEY,
							catalog,
						);
					}
					if (!sharedCacheLoad) {
						observationMetadata = {
							refreshReason: reason,
							pageCountBucket: bucketCount(catalogPageCount(catalog)),
							itemCountBucket: bucketCount(catalog.length),
						};
					}
					if (shouldNotify) {
						notifyRefreshed(options, catalog, reason);
					}
				}),
			),
			Effect.catch((error) =>
				Effect.flatMap(
					generation === requestGeneration
						? Cache.invalidate(cache, EXERCISE_TEMPLATE_CATALOG_CACHE_KEY)
						: Effect.void,
					() => Effect.fail(error),
				),
			),
		);

		const controlledLoad = execution
			? checkExecution(execution).pipe(Effect.flatMap(() => observedLoad))
			: observedLoad;

		return yield* Effect.ensuring(
			controlledLoad,
			Effect.sync(() => {
				finishObservation(observationScope, observationMetadata);
			}),
		);
	});

	return {
		effect,
		get(options) {
			return Effect.runPromise(effect(options));
		},
		reset() {
			hasLoadedValue = false;
			requestGeneration += 1;
			Effect.runSync(
				Cache.invalidate(cache, EXERCISE_TEMPLATE_CATALOG_CACHE_KEY),
			);
		},
	};
}

function checkExecution(execution: HevyRequestOptions) {
	return Effect.sync(() => {
		if (execution.signal?.aborted) {
			throw (
				execution.signal.reason ??
				new DOMException("Operation canceled", "AbortError")
			);
		}
		if (execution.deadline !== undefined && Date.now() >= execution.deadline) {
			throw new DOMException("Operation deadline exceeded", "TimeoutError");
		}
	});
}
