export interface PublishedPackage {
	name: string;
	version?: string;
}

export interface ReleaseOutputs {
	version: string;
	released: boolean;
	node_released: boolean;
	worker_version: string;
	worker_released: boolean;
}

export function calculateReleaseOutputs(options: {
	afterWorkerManifest: string;
	beforeWorkerManifest: string;
	published: boolean | string | undefined;
	publishedPackages: PublishedPackage[];
	nodePackageName?: string;
}): ReleaseOutputs;
