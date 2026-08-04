export const HISTORICAL_REGISTRY_REVISION: string;

export function historicalSource(
	revision: string,
	path: string,
	cwd?: string,
): string;

export function validateHistoricalRegistryFragments(
	fragments: Array<{
		id: string;
		path: string;
		symbol: string;
		sourceRevision: string;
		line: number;
	}>,
	options?: {
		expectedRevision?: string;
		sourceReader?: (revision: string, path: string) => string;
	},
): number;
