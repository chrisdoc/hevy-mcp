import type { HevyExecutionOptions } from "@hevy-mcp/hevy-client";
import type { HevyOperations } from "@hevy-mcp/operations";
import { Effect } from "effect";
import { z } from "zod";
import { UsageError, type CliArgs } from "../arguments.js";
import { ApiResponseError } from "../errors.js";
import type { DataSourceReader } from "../input.js";
import { pageEnvelope, type ApiObject } from "../output/contracts.js";

export type CommandContext = {
	args: CliArgs;
	now: () => Date;
	readDataSource: DataSourceReader;
	operations: HevyOperations;
	execution?: HevyExecutionOptions;
};

export type CommandResult = Promise<unknown>;

type InputOperation<TInput, TOutput> = {
	readonly effect: (
		input: TInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<TOutput, unknown>;
};

type OptionsOperation<TOutput> = {
	readonly effect: (
		options?: HevyExecutionOptions,
	) => Effect.Effect<TOutput, unknown>;
};

export function requireOperation<T>(operation: T | undefined, id: string): T {
	if (operation === undefined)
		throw new ApiResponseError(`Operation ${id} is not configured`);
	return operation;
}

export function collapse<T>(effect: Effect.Effect<T, unknown>): Promise<T> {
	return Effect.runPromise(effect);
}

export function runOperation<TInput, TOutput>(
	operation: InputOperation<TInput, TOutput> | undefined,
	id: string,
	input: TInput,
	execution: HevyExecutionOptions | undefined,
): Promise<TOutput> {
	const resolved = requireOperation(operation, id);
	return collapse(resolved.effect(input, execution));
}

export function runOperationWithoutInput<TOutput>(
	operation: OptionsOperation<TOutput> | undefined,
	id: string,
	execution: HevyExecutionOptions | undefined,
): Promise<TOutput> {
	const resolved = requireOperation(operation, id);
	return collapse(resolved.effect(execution));
}

export function list(
	data: ApiObject,
	source: string,
	output: string,
	page: number,
): ApiObject {
	const count = z.number().safeParse(data.page_count).data;
	const items = Array.isArray(data[source]) ? data[source] : [];
	if (
		count === undefined ||
		!Number.isSafeInteger(count) ||
		count < 0 ||
		(count === 0 && items.length > 0) ||
		(data.page !== undefined && data.page !== page)
	)
		throw new ApiResponseError("The API returned invalid pagination metadata");
	if (count > 0 && page > count)
		throw new UsageError("Requested page exceeds the API page count");
	return pageEnvelope(data, output, items);
}

export function mutationData(args: CliArgs): string {
	const parsed = z.string().safeParse(args.options.data);
	if (!parsed.success) throw new UsageError("--data is required");
	return parsed.data;
}
