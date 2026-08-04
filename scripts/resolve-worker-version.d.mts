export const MAX_WORKER_PREVIEW_TAG_LENGTH: number;

export function resolveWorkerVersion(manifest: string): string;

export function resolveWorkerPreviewTag(options: {
	manifest: string;
	pullRequestNumber: number | string;
	headSha: string;
}): string;
