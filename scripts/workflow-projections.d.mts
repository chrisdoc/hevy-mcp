export interface ValidationLane {
	id: string;
	nxTarget: string | null;
	mappingStatus: "mapped" | "external" | "unresolved";
	runtimes: string[];
	workflowRuntimes?: string[];
	hostRuntimes?: string[];
}

export interface ValidationAggregate {
	lanes: string[];
	workflowRuntimes?: Record<string, string[]>;
}

export interface ValidationLanes {
	lanes: ValidationLane[];
	aggregates: Record<string, ValidationAggregate>;
}

export interface WorkflowExecution {
	lane: string;
	job: string;
	runtimes: string[];
	condition: string | null;
	jobCondition: string | null;
	stepCondition: string | null;
	target?: string;
	args?: string;
	command?: string;
	step?: string | null;
}

export interface WorkflowParseOptions {
	rootDir?: string;
	laneTargets?: Map<string, string> | Record<string, string>;
	includeCommands?: boolean;
	jobIds?: string[];
}

export interface WorkflowAggregateOptions {
	lanes: ValidationLanes;
	aggregate?: ValidationAggregate | string;
	aggregateId?: string;
	rootDir?: string;
	label?: string;
	expectedJobs?: string | Record<string, string>;
	job?: string | Record<string, string>;
	jobIds?: string[];
}

export interface WorkflowAggregateResult {
	aggregate: ValidationAggregate;
	executions: WorkflowExecution[];
}

export function mappedLaneTargets(lanes: ValidationLanes): Map<string, string>;
export function parseWorkflowLaneExecutions(
	source: string,
	options?: WorkflowParseOptions,
): WorkflowExecution[];
export function validateWorkflowAggregate(
	source: string,
	options: WorkflowAggregateOptions,
): WorkflowAggregateResult;
