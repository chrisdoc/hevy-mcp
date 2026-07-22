export interface PageResult<T> {
	items: readonly T[];
	pageCount?: number;
}

export type PageLoader<T> = (
	page: number,
	pageSize: number,
) => PageResult<T> | PromiseLike<PageResult<T>>;

export async function fetchAllPages<T>(
	loader: PageLoader<T>,
	pageSize: number,
): Promise<T[]> {
	const items: T[] = [];
	let page = 1;

	while (true) {
		const result = await loader(page, pageSize);
		if (result.items.length === 0) {
			return items;
		}
		// The current page has already been appended before this boundary check.
		items.push(...result.items);
		const pageCount = result.pageCount;
		if (
			typeof pageCount !== "number" ||
			!Number.isSafeInteger(pageCount) ||
			pageCount <= page
		) {
			return items;
		}
		page += 1;
	}
}
