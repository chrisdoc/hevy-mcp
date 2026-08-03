export function compareDirectoryTrees(
	expectedRoot: string,
	actualRoot: string,
): Promise<string[]>;

export function findForbiddenRootSourceFiles(root: string): Promise<string[]>;

export function findCuratedBarrelDrift(packageRoot: string): Promise<string[]>;

export function checkGeneratedClient(): Promise<{ generatedFiles: number }>;
