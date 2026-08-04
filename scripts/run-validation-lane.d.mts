export interface ValidationLaneCommand {
	kind: "argv" | "sequence";
	executable?: string;
	args?: string[];
	commands?: Array<{ executable: string; args: string[] }>;
}

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
): Promise<void>;
export function main(argv?: string[]): Promise<void>;
