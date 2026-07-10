export interface RunServerManifestOptions {
	mode: "check" | "sync";
	rootDir?: string;
}

export interface RunServerManifestResult {
	changed: boolean;
	drift: string[];
}

export function runServerManifest(
	options: RunServerManifestOptions,
): Promise<RunServerManifestResult>;
