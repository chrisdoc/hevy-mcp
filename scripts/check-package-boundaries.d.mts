export interface BoundaryRule {
	allowed: Map<string, Set<string>>;
	forbidden: string[];
	rejectBuiltins: boolean;
	rejectDynamicImports: boolean;
}

export interface ImportEdge {
	specifier: string;
	kind: string;
}

export function inspectSource(
	source: string,
	fileName?: string,
): { edges: ImportEdge[]; nonLiteralCalls: string[] };

export function inspectFileWithCompiler(file: string): {
	edges: ImportEdge[];
	nonLiteralCalls: string[];
	usedCompilerApi: true;
};

export function findImportViolations(options: {
	source: string;
	file: string;
	fileName?: string;
	relativePackage: string;
	packageRoot: string;
	rule: BoundaryRule;
	inspection?: {
		edges: ImportEdge[];
		nonLiteralCalls: string[];
	};
}): string[];

export const packageRules: Map<string, BoundaryRule>;
export function findRetiredRootSourceFiles(
	files: string[],
	projectRoot: string,
): string[];
export function checkBoundaries(projectRoot?: string): Promise<string[]>;
