import { human } from "./human.js";

export interface Streams {
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}
export function writeResult(
	value: unknown,
	json: boolean,
	streams: Streams,
): void {
	streams.stdout(`${json ? JSON.stringify(value) : human(value)}\n`);
}
