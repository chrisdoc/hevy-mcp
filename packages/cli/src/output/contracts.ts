export interface PaginationEnvelope<T> {
	page: number;
	pageCount: number;
	[key: string]: number | T[];
}

export interface SearchResult<T> {
	query: string;
	matches: T[];
	pagesScanned: number;
	complete: boolean;
}

export interface SummaryResult {
	weeks: number;
	from: string;
	to: string;
	workoutCount: number;
	totalDurationSeconds: number;
	exerciseCount: number;
	setCount: number;
	totalVolumeKg: number;
	pagesScanned: number;
	complete: boolean;
}
