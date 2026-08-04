export type ValidationLaneCommand =
	| {
			kind: "argv";
			executable: string;
			args: string[];
	  }
	| {
			kind: "sequence";
			commands: Array<{ executable: string; args: string[] }>;
	  };

export function requiredCredentials(
	lane: { credentials: string[] },
	environment?: NodeJS.ProcessEnv,
): string[];
export function laneCommand(
	lane: {
		external?: boolean;
		integration?: string;
		id: string;
		command?: ValidationLaneCommand;
	},
	extraArgs?: string[],
): Array<{ command: string; args: string[] }>;
export function runMember(
	id: string,
	args: string[],
	stack?: string[],
	environment?: NodeJS.ProcessEnv,
): Promise<void>;
export function main(
	argv?: string[],
	environment?: NodeJS.ProcessEnv,
): Promise<void>;
export function isDirectInvocation(argvPath?: string): boolean;
