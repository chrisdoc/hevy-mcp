import type {
	ExerciseTemplate,
	GetV1ExerciseTemplates200,
} from "../generated/client/types/index.js";
import type { HevyClient } from "./hevyClient.js";
import { AsyncTtlCache } from "./cache.js";
import { fetchAllPages } from "./pagination.js";

const EXERCISE_TEMPLATE_CATALOG_CACHE_KEY = "exercise-template-catalog";
const EXERCISE_TEMPLATE_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
const EXERCISE_TEMPLATE_CATALOG_CACHE_MAX_SIZE = 1;

export type ExerciseTemplateCatalogRefreshReason =
	| "explicit-refresh"
	| "initial-load"
	| "ttl-expired";

export interface ExerciseTemplateCatalogOptions {
	refresh?: boolean;
	onRefreshed?: (
		catalog: ExerciseTemplate[],
		reason: ExerciseTemplateCatalogRefreshReason,
	) => void;
}

export interface ExerciseTemplateCatalog {
	get(options?: ExerciseTemplateCatalogOptions): Promise<ExerciseTemplate[]>;
	reset(): void;
}

/** Create a cache owned by one MCP server/request lifecycle. */
export function createExerciseTemplateCatalog(
	hevyClient: HevyClient,
): ExerciseTemplateCatalog {
	const cache = new AsyncTtlCache<string, ExerciseTemplate[]>({
		ttlMs: EXERCISE_TEMPLATE_CATALOG_CACHE_TTL_MS,
		maxSize: EXERCISE_TEMPLATE_CATALOG_CACHE_MAX_SIZE,
	});

	return {
		get(options = {}) {
			const reason = options.refresh
				? "explicit-refresh"
				: cache.size === 0
					? "initial-load"
					: "ttl-expired";
			return cache.getOrFetch(
				EXERCISE_TEMPLATE_CATALOG_CACHE_KEY,
				async () => {
					const catalog = await fetchAllPages<ExerciseTemplate>(
						async (page, pageSize) => {
							const data: GetV1ExerciseTemplates200 =
								await hevyClient.getExerciseTemplates({
									page,
									pageSize,
								});
							return {
								items: data?.exercise_templates ?? [],
								pageCount: data?.page_count,
							};
						},
						100,
					);
					options.onRefreshed?.(catalog, reason);
					return catalog;
				},
				options,
			);
		},
		reset() {
			cache.clear();
		},
	};
}
