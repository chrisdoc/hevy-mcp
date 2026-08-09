export interface ReleaseCandidateManifest {
	name: string;
	version: string;
	[key: string]: unknown;
}

export interface ReleaseCandidateArtifact {
	name: string;
	version: string;
	manifest: ReleaseCandidateManifest;
	filename: string;
	path: string;
	size: number;
}

export const repositoryRoot: string;

export function candidateTarballFilename(
	manifest: ReleaseCandidateManifest,
): string;

export function releaseCandidateArtifact(
	packageDirectory: string,
	options?: { repositoryRoot?: string },
): Promise<ReleaseCandidateArtifact>;
