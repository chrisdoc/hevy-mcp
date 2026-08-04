export interface WorkspaceTopology {
	id: string;
	path: string;
	name: string;
	private: boolean;
	publishable: boolean;
	runtime: string;
	exports: string[];
	dependencies: string[];
	boundary: Record<string, unknown>;
	artifacts: string[];
}
export interface ValidationLane {
	id: string;
	alias?: string;
	command?: ValidationLaneCommand;
	gate: string;
	artifacts: string[];
	credentials: string[];
	runtimes: string[];
	external?: boolean;
	integration?: string;
	selector: {
		kind: string;
		include?: string[];
		exclude?: string[];
		config?: string;
		workspace?: string;
		check?: string;
		project?: string;
		[section: string]: unknown;
	};
	[section: string]: unknown;
}
export interface ValidationLaneCommand {
	kind: "argv" | "sequence";
	executable?: string;
	args?: string[];
	commands?: Array<{ executable: string; args: string[] }>;
}
export interface ValidationLanes {
	version: number;
	lanes: ValidationLane[];
	aggregates: Record<string, { lanes: string[]; [section: string]: unknown }>;
	changeImpactRouting: Array<{ pattern: string; lanes: string[] }>;
	workflowProjections: Record<
		string,
		Array<{
			lane: string;
			job: string;
			runtimes: string[];
			condition: string | null;
			jobCondition: string | null;
			stepCondition: string | null;
		}>
	>;
	[section: string]: unknown;
}

export function loadTopology(rootDir?: string): {
	version: number;
	workspaceGlob: string;
	workspaces: WorkspaceTopology[];
	[section: string]: unknown;
};
export function loadArtifactProvenance(
	rootDir?: string,
): Record<string, unknown>;
export function loadValidationLanes(rootDir?: string): ValidationLanes;
export function loadControlPlane(rootDir?: string): {
	rootDir: string;
	topology: ReturnType<typeof loadTopology>;
	provenance: Record<string, unknown>;
	lanes: ValidationLanes;
};
export function validateControlPlane(
	rootDir?: string,
): ReturnType<typeof loadControlPlane>;
export function validateAggregateAcyclicity(
	aggregates: Record<string, { lanes?: string[] }>,
): void;
export function validateValidationLaneDispatcher(packageJson: {
	scripts?: Record<string, string>;
}): void;
export function validateGeneratorCommands(
	provenance: { generators?: Array<{ id: string; command?: string }> },
	packageJson: { scripts?: Record<string, string> },
): void;
export function workspaceById(
	topology: ReturnType<typeof loadTopology>,
	id: string,
): WorkspaceTopology;
export function workspaceByName(
	topology: ReturnType<typeof loadTopology>,
	name: string,
): WorkspaceTopology;
export function releaseConsumers(
	topology: ReturnType<typeof loadTopology>,
	workspaceId: string,
): string[];
export function normalizeChangedFiles(changes: unknown[]): string[];
export function resolveImpactedLanes(
	lanes: Record<string, unknown>,
	changes: unknown[],
): string[];
export function relativePath(rootDir: string, path: string): string;
export const repositoryRoot: string;
export const controlPlaneRoot: string;
