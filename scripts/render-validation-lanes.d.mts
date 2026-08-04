export interface ValidationLaneForDocs {
	id: string;
	alias?: string;
	external?: boolean;
	integration?: string;
	nxTarget: string | null;
	mappingStatus: string;
	selector: {
		kind: string;
		include?: string[];
		exclude?: string[];
		config?: string;
		workspace?: string;
		project?: string;
		check?: string;
	};
	gate: string;
	runtimes: string[];
	credentials: string[];
	artifacts: string[];
}

export interface ValidationAggregateForDocs {
	lanes: string[];
	alias?: string;
	nxTarget?: string | null;
	mappingStatus?: string;
}

export interface ValidationLanesForDocs {
	version?: number;
	lanes: ValidationLaneForDocs[];
	aggregates: Record<string, ValidationAggregateForDocs>;
}

export const validationLaneTableStart: string;
export const validationLaneTableEnd: string;
export const validationAggregateTableStart: string;
export const validationAggregateTableEnd: string;
export function renderValidationLaneTable(
	manifest?: ValidationLanesForDocs,
): string;
export function renderValidationAggregateTable(
	manifest?: ValidationLanesForDocs,
): string;
export function replaceValidationLaneTable(
	contents: string,
	table: string,
): string;
export function replaceValidationAggregateTable(
	contents: string,
	table: string,
): string;
export function checkRenderedValidationLaneTables(
	rootDir?: string,
): Promise<void>;
export function renderValidationLaneTables(rootDir?: string): Promise<void>;
export function isDirectInvocation(argvPath?: string): boolean;
