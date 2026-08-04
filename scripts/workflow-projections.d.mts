export interface WorkflowProjection {
	lane: string;
	job: string;
	runtimes: string[];
	condition: string | null;
	jobCondition: string | null;
	stepCondition: string | null;
}

export function parseWorkflowLaneExecutions(
	source: string,
	options?: {
		rootDir?: string;
	},
): WorkflowProjection[];
export function assertWorkflowProjection(
	actual: WorkflowProjection[],
	expected: WorkflowProjection[],
	label: string,
): void;
