import { readFile } from "node:fs/promises";
import { z } from "zod";
import { UsageError } from "./arguments.js";

const jsonValueSchema = z.json();
const stringifiedJsonSchema = z.string().transform((value) => {
	try {
		return jsonValueSchema.parse(JSON.parse(value));
	} catch {
		// Preserve invalid values so the owning schema reports the field path.
		return value;
	}
});
const exercisesInputSchema = z.union([stringifiedJsonSchema, z.unknown()]);
const workoutExercisesInputSchema = z
	.object({
		workout: z.object({ exercises: exercisesInputSchema }).passthrough(),
	})
	.passthrough();
const routineExercisesInputSchema = z
	.object({
		routine: z.object({ exercises: exercisesInputSchema }).passthrough(),
	})
	.passthrough();
const mutationInputBoundarySchema = z.union([
	workoutExercisesInputSchema,
	routineExercisesInputSchema,
	z.unknown(),
]);

export type DataSourceReader = (source: string) => Promise<string>;

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
	}
	return Buffer.concat(chunks).toString("utf8");
}

export const readDataSource: DataSourceReader = (source) =>
	source === "-" ? readStdin() : readFile(source, "utf8");

function schemaDiagnostic(error: z.ZodError): string {
	const issue = error.issues[0];
	const path = issue?.path.join(".");
	return path
		? `--data.${path} ${issue.message}`
		: `--data ${issue?.message ?? "is invalid"}`;
}

export async function loadMutationInput<T>(
	value: string,
	schema: z.ZodType<T>,
	reader: DataSourceReader = readDataSource,
): Promise<T> {
	let sourceValue = value;
	if (value.startsWith("@")) {
		const source = value.slice(1);
		if (source.length === 0)
			throw new UsageError("--data source is required after @");
		try {
			sourceValue = await reader(source);
		} catch {
			throw new UsageError(`Unable to read --data source "${source}"`);
		}
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(sourceValue);
	} catch {
		throw new UsageError("--data must contain valid JSON");
	}

	try {
		// Keep the CLI's existing --data input contract at this adapter boundary;
		// Operations schemas remain transport-neutral and require real arrays.
		return schema.parse(mutationInputBoundarySchema.parse(parsed));
	} catch (error) {
		if (error instanceof z.ZodError)
			throw new UsageError(schemaDiagnostic(error));
		throw error;
	}
}
