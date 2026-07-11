import type {
	ExerciseTemplate,
	GetV1ExerciseTemplates200,
} from "../generated/client/types/index.js";
import { AsyncTtlCache } from "./cache.js";

type HevyClient = ReturnType<typeof import("./hevyClientKubb.js").createClient>;

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

function getSafePageCount(
	data: GetV1ExerciseTemplates200,
	currentPage: number,
) {
	const pageCount = data?.page_count;
	if (
		typeof pageCount !== "number" ||
		!Number.isSafeInteger(pageCount) ||
		pageCount < currentPage
	) {
		return currentPage;
	}

	return pageCount;
}

async function fetchExerciseTemplateCatalog(
	hevyClient: HevyClient,
): Promise<ExerciseTemplate[]> {
	const allTemplates: ExerciseTemplate[] = [];
	let page = 1;
	let pageCount = 1;

	do {
		const data: GetV1ExerciseTemplates200 =
			await hevyClient.getExerciseTemplates({
				page,
				pageSize: 100,
			});

		allTemplates.push(...(data?.exercise_templates ?? []));
		pageCount = getSafePageCount(data, page);
		page++;
	} while (page <= pageCount);

	return allTemplates;
}

export interface ExerciseTemplateCatalog {
	get(
		hevyClient: HevyClient,
		options?: ExerciseTemplateCatalogOptions,
	): Promise<ExerciseTemplate[]>;
	reset(): void;
}

/** Create a cache owned by one MCP server/request lifecycle. */
export function createExerciseTemplateCatalog(): ExerciseTemplateCatalog {
	const cache = new AsyncTtlCache<string, ExerciseTemplate[]>({
		ttlMs: EXERCISE_TEMPLATE_CATALOG_CACHE_TTL_MS,
		maxSize: EXERCISE_TEMPLATE_CATALOG_CACHE_MAX_SIZE,
	});

	return {
		get(hevyClient, options = {}) {
			const reason = options.refresh
				? "explicit-refresh"
				: cache.size === 0
					? "initial-load"
					: "ttl-expired";
			return cache.getOrFetch(
				EXERCISE_TEMPLATE_CATALOG_CACHE_KEY,
				async () => {
					const catalog = await fetchExerciseTemplateCatalog(hevyClient);
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
