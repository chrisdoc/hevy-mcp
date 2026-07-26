function camel(key: string): string {
	return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function normalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(normalize);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [camel(key), normalize(item)]),
		);
	}
	return value;
}

export function pageEnvelope(
	data: Record<string, unknown>,
	key: string,
	items: unknown[],
): Record<string, unknown> {
	return {
		page: data.page ?? 1,
		pageCount: data.page_count ?? 0,
		[key]: normalize(items),
	};
}
