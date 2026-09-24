export interface ChangesetCoverageResult {
	changedPackageCount: number;
}

export function resolveChangesetBaseRef(options?: {
	changesetBaseRef?: string;
	githubBaseRef?: string;
}): string;

export function packageChangesetCoverage(options: {
	root: string;
	changedFiles: string[];
	readManifestFromBase: (
		packagePath: string,
	) => string | undefined | Promise<string | undefined>;
	changesetDiffLines: string[];
}): Promise<ChangesetCoverageResult>;
