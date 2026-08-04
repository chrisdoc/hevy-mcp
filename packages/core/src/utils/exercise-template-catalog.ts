import type {
	ExerciseTemplate,
	GetV1ExerciseTemplates200,
} from "@hevy-mcp/hevy-client/types";
import type { HevyClient, HevyRequestOptions } from "@hevy-mcp/hevy-client";
import { AsyncTtlCache } from "./cache.js";
import type { CacheObservationMetadata, CacheObserver } from "./cache.js";
import { fetchAllPages } from "./pagination.js";
import { bucketCount } from "./result-telemetry.js";

const EXERCISE_TEMPLATE_CATALOG_CACHE_KEY = "exercise-template-catalog";
const EXERCISE_TEMPLATE_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
const EXERCISE_TEMPLATE_CATALOG_CACHE_MAX_SIZE = 1;

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

export interface ExerciseTemplateCatalog {
	get(options?: ExerciseTemplateCatalogOptions): Promise<ExerciseTemplate[]>;
	reset(): void;
}

export function createExerciseTemplateCatalog(
	hevyClient: Pick<HevyClient, "getExerciseTemplates">,
	cacheObserver?: CacheObserver,
): ExerciseTemplateCatalog {
	const cache = new AsyncTtlCache<string, ExerciseTemplate[]>({
		ttlMs: EXERCISE_TEMPLATE_CATALOG_CACHE_TTL_MS,
		maxSize: EXERCISE_TEMPLATE_CATALOG_CACHE_MAX_SIZE,
		observer: cacheObserver,
	});

	return {
		get(options = {}) {
			const reason = options.refresh
				? "explicit-refresh"
				: cache.size === 0
					? "initial-load"
					: "ttl-expired";
			let observationMetadata: CacheObservationMetadata | undefined;
			let pagesLoaded = 0;
			return cache.getOrFetch(
				EXERCISE_TEMPLATE_CATALOG_CACHE_KEY,
				async () => {
					const catalog = await fetchAllPages<ExerciseTemplate>(
						async (page, pageSize) => {
							pagesLoaded = page;
							const data: GetV1ExerciseTemplates200 =
								await hevyClient.getExerciseTemplates(
									{
										page,
										pageSize,
									},
									options.execution,
								);
							return {
								items: data?.exercise_templates ?? [],
								pageCount: data?.page_count,
							};
						},
						100,
					);
					observationMetadata = {
						refreshReason: reason,
						pageCountBucket: bucketCount(pagesLoaded),
						itemCountBucket: bucketCount(catalog.length),
					};
					options.onRefreshed?.(catalog, reason);
					return catalog;
				},
				{
					refresh: options.refresh,
					shareInFlight: options.execution === undefined,
					signal: options.execution?.signal,
					deadline: options.execution?.deadline,
					getObservationMetadata: () => observationMetadata,
				},
			);
		},
		reset() {
			cache.clear();
		},
	};
}
