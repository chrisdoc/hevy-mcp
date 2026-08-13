import { human } from "./human.js";

export interface Streams {
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}
export function writeResult<T>(
	value: T,
	json: boolean,
	streams: Streams,
): void {
	streams.stdout(`${json ? JSON.stringify(value) : human(value)}\n`);
}
