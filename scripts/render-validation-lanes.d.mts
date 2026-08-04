import type { ValidationLanes } from "./repository-control-plane.mjs";

export const validationLaneTableStart: string;
export const validationLaneTableEnd: string;
export function renderValidationLaneTable(manifest?: ValidationLanes): string;
export function replaceValidationLaneTable(
	contents: string,
	table: string,
): string;
export function checkRenderedValidationLaneTables(
	rootDir?: string,
): Promise<void>;
export function renderValidationLaneTables(rootDir?: string): Promise<void>;
export function isDirectInvocation(argvPath?: string): boolean;
