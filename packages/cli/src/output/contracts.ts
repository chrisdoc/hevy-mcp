export interface PaginationEnvelope<T> {
	page: number;
	page_count: number;
	[key: string]: number | T[];
}

export interface SearchResult<T> {
	query: string;
	matches: T[];
	pages_scanned: number;
	complete: boolean;
}

export interface SummaryResult {
	weeks: number;
	start_date: string;
	end_date: string;
	workout_count: number;
	total_duration_seconds: number;
	exercise_count: number;
	set_count: number;
	total_volume_kg: number;
	pages_scanned: number;
	complete: boolean;
}

export function pageEnvelope(
	data: Record<string, unknown>,
	key: string,
	items: unknown[],
): Record<string, unknown> {
	return {
		page: data.page ?? 1,
		page_count: data.page_count ?? 0,
		[key]: items,
	};
}
