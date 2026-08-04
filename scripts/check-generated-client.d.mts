export function compareDirectoryTrees(
	expectedRoot: string,
	actualRoot: string,
): Promise<string[]>;

export function findForbiddenRootSourceFiles(root: string): Promise<string[]>;

export function findCuratedBarrelDrift(packageRoot: string): Promise<string[]>;

export function isNodeModulesPath(path: string): boolean;

export function resolvePackageExecutable(
	packageName: string,
	binName: string,
): Promise<{ command: string; args: string[] }>;

export function runCommand(
	command: string,
	args: string[],
	cwd: string,
	options?: {
		timeout?: number;
		killSignal?: NodeJS.Signals | number;
	},
): Promise<void>;

export function checkGeneratedClient(): Promise<{ generatedFiles: number }>;
