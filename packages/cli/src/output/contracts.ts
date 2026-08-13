import { z } from "zod";

const numberSchema = z.number();

export type ApiValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| object
	| ApiValue[];
export type ApiObject = { [key: string]: ApiValue };

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
	data: ApiObject,
	key: string,
	items: readonly ApiValue[],
): ApiObject {
	return {
		page: numberSchema.safeParse(data.page).success ? data.page : 1,
		page_count: numberSchema.safeParse(data.page_count).success
			? data.page_count
			: 0,
		[key]: items,
	};
}
