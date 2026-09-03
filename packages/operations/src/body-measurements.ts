import { Effect } from "effect";
import type {
	HevyExecutionOptions,
	HevyOperationSafety,
} from "@hevy-mcp/hevy-client";
import type {
	HevyRequestEffectClient,
	HevyRequestEffectError,
} from "@hevy-mcp/hevy-client/internal";
import type {
	BodyMeasurement,
	GetV1BodyMeasurements200,
	PutBodyMeasurement,
} from "@hevy-mcp/hevy-client/types";
import {
	isExpectedReadEndOfList,
	isExpectedReadNotFound,
	EmptyMeasurementUpdateError,
	PaginationMismatchError,
} from "./operation-errors.js";
import {
	buildMeasurementPayload,
	type MeasurementFields,
	type MeasurementPayload,
} from "./mutation-semantics.js";

export interface BodyMeasurementsListInput {
	readonly page: number;
	readonly pageSize: number;
}

export interface BodyMeasurementsListOutput {
	readonly items: BodyMeasurement[];
	readonly page: number;
	readonly pageCount?: number;
	readonly expected404Outcome?: "end_of_list";
}

export type BodyMeasurementsListAdapter = Pick<
	HevyRequestEffectClient,
	"getBodyMeasurements"
>;

export interface BodyMeasurementsListDescriptor {
	readonly id: "bodyMeasurements.list";
	readonly safety: Extract<HevyOperationSafety, "read">;
}

export const bodyMeasurementsListDescriptor: BodyMeasurementsListDescriptor = {
	id: "bodyMeasurements.list",
	safety: "read",
};

export interface BodyMeasurementsListOperation {
	readonly descriptor: BodyMeasurementsListDescriptor;
	readonly effect: (
		input: BodyMeasurementsListInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<
		BodyMeasurementsListOutput,
		HevyRequestEffectError | PaginationMismatchError
	>;
	execute(
		input: BodyMeasurementsListInput,
		options?: HevyExecutionOptions,
	): Promise<BodyMeasurementsListOutput>;
}

export interface BodyMeasurementsGetInput {
	readonly date: string;
}

export interface BodyMeasurementsGetOutput {
	readonly bodyMeasurement: BodyMeasurement | null;
	readonly date: string;
	readonly expected404Outcome?: "not_found";
}

export type BodyMeasurementsGetAdapter = Pick<
	HevyRequestEffectClient,
	"getBodyMeasurement"
>;

export interface BodyMeasurementsGetDescriptor {
	readonly id: "bodyMeasurements.get";
	readonly safety: Extract<HevyOperationSafety, "read">;
}

export const bodyMeasurementsGetDescriptor: BodyMeasurementsGetDescriptor = {
	id: "bodyMeasurements.get",
	safety: "read",
};

export interface BodyMeasurementsGetOperation {
	readonly descriptor: BodyMeasurementsGetDescriptor;
	readonly effect: (
		input: BodyMeasurementsGetInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<BodyMeasurementsGetOutput, HevyRequestEffectError>;
	execute(
		input: BodyMeasurementsGetInput,
		options?: HevyExecutionOptions,
	): Promise<BodyMeasurementsGetOutput>;
}

export type BodyMeasurementsCreateInput = {
	readonly date: string;
} & MeasurementFields;

export type BodyMeasurementsCreateAdapter = Pick<
	HevyRequestEffectClient,
	"createBodyMeasurement"
>;

export interface BodyMeasurementsCreateDescriptor {
	readonly id: "bodyMeasurements.create";
	readonly safety: Extract<HevyOperationSafety, "non-idempotent-write">;
}

export const bodyMeasurementsCreateDescriptor: BodyMeasurementsCreateDescriptor =
	{
		id: "bodyMeasurements.create",
		safety: "non-idempotent-write",
	};

export interface BodyMeasurementsCreateOperation {
	readonly descriptor: BodyMeasurementsCreateDescriptor;
	readonly effect: (
		input: BodyMeasurementsCreateInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<string, HevyRequestEffectError>;
	execute(
		input: BodyMeasurementsCreateInput,
		options?: HevyExecutionOptions,
	): Promise<string>;
}

export type BodyMeasurementsUpdateInput = {
	readonly date: string;
} & MeasurementFields;

export type BodyMeasurementsUpdateAdapter = Pick<
	HevyRequestEffectClient,
	"updateBodyMeasurement"
>;

export interface BodyMeasurementsUpdateDescriptor {
	readonly id: "bodyMeasurements.update";
	readonly safety: Extract<HevyOperationSafety, "idempotent-write">;
}

export const bodyMeasurementsUpdateDescriptor: BodyMeasurementsUpdateDescriptor =
	{
		id: "bodyMeasurements.update",
		safety: "idempotent-write",
	};

export interface BodyMeasurementsUpdateOperation {
	readonly descriptor: BodyMeasurementsUpdateDescriptor;
	readonly effect: (
		input: BodyMeasurementsUpdateInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<
		string,
		HevyRequestEffectError | EmptyMeasurementUpdateError
	>;
	execute(
		input: BodyMeasurementsUpdateInput,
		options?: HevyExecutionOptions,
	): Promise<string>;
}

export function createBodyMeasurementsListOperation(
	adapter: BodyMeasurementsListAdapter,
): BodyMeasurementsListOperation {
	const effect = Effect.fn("operations.bodyMeasurements.list")(function* (
		input: BodyMeasurementsListInput,
		options?: HevyExecutionOptions,
	) {
		const params = { page: input.page, pageSize: input.pageSize };
		const request =
			options === undefined
				? adapter.getBodyMeasurements(params)
				: adapter.getBodyMeasurements(params, options);
		return yield* request.pipe(
			Effect.flatMap((response: GetV1BodyMeasurements200) => {
				if (response?.page !== undefined && response.page !== input.page) {
					return Effect.fail(
						new PaginationMismatchError({
							requested: input.page,
							received: response.page,
							collection: "bodyMeasurements",
							message: `Body measurements page mismatch: requested page ${input.page} but received page ${response.page}`,
						}),
					);
				}
				return Effect.succeed({
					items: response?.body_measurements ?? [],
					page: response?.page ?? input.page,
					pageCount: response?.page_count,
				});
			}),
			Effect.catchIf(
				(error) =>
					isExpectedReadEndOfList(error, "/v1/body_measurements", input.page),
				() =>
					Effect.succeed({
						items: [],
						page: input.page,
						pageCount: undefined,
						expected404Outcome: "end_of_list" as const,
					}),
			),
		);
	});

	const operation: BodyMeasurementsListOperation = {
		descriptor: bodyMeasurementsListDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}

export function createBodyMeasurementsGetOperation(
	adapter: BodyMeasurementsGetAdapter,
): BodyMeasurementsGetOperation {
	const effect = Effect.fn("operations.bodyMeasurements.get")(function* (
		input: BodyMeasurementsGetInput,
		options?: HevyExecutionOptions,
	) {
		const request =
			options === undefined
				? adapter.getBodyMeasurement(input.date)
				: adapter.getBodyMeasurement(input.date, options);
		return yield* request.pipe(
			Effect.map((bodyMeasurement) => ({
				bodyMeasurement: isEmptyResponse(bodyMeasurement)
					? null
					: (bodyMeasurement ?? null),
				date: input.date,
			})),
			Effect.catchIf(
				(error) => isExpectedReadNotFound(error, "/v1/body_measurements"),
				() =>
					Effect.succeed({
						bodyMeasurement: null,
						date: input.date,
						expected404Outcome: "not_found" as const,
					}),
			),
		);
	});

	const operation: BodyMeasurementsGetOperation = {
		descriptor: bodyMeasurementsGetDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}

function isEmptyResponse<T extends object>(
	response: T | null | undefined,
): response is T & Record<never, Record<string, never>> {
	return (
		response !== null &&
		response !== undefined &&
		Object.keys(response).length === 0
	);
}

export function createBodyMeasurementsCreateOperation(
	adapter: BodyMeasurementsCreateAdapter,
): BodyMeasurementsCreateOperation {
	const effect = Effect.fn("operations.bodyMeasurements.create")(function* (
		input: BodyMeasurementsCreateInput,
		options?: HevyExecutionOptions,
	) {
		const payload: MeasurementPayload = buildMeasurementPayload(input);
		const data: BodyMeasurement = {
			date: input.date,
			...payload,
		};
		const request =
			options === undefined
				? adapter.createBodyMeasurement(data)
				: adapter.createBodyMeasurement(data, options);
		yield* request;
		return input.date;
	});

	const operation: BodyMeasurementsCreateOperation = {
		descriptor: bodyMeasurementsCreateDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}

export function createBodyMeasurementsUpdateOperation(
	adapter: BodyMeasurementsUpdateAdapter,
): BodyMeasurementsUpdateOperation {
	const effect = Effect.fn("operations.bodyMeasurements.update")(function* (
		input: BodyMeasurementsUpdateInput,
		options?: HevyExecutionOptions,
	) {
		const payload: PutBodyMeasurement = buildMeasurementPayload(input);
		if (Object.keys(payload).length === 0) {
			return yield* new EmptyMeasurementUpdateError({
				message:
					"No measurement fields provided. Include at least one numeric measurement field (e.g. weight_kg) to update.",
			});
		}
		const request =
			options === undefined
				? adapter.updateBodyMeasurement(input.date, payload)
				: adapter.updateBodyMeasurement(input.date, payload, options);
		yield* request;
		return input.date;
	});

	const operation: BodyMeasurementsUpdateOperation = {
		descriptor: bodyMeasurementsUpdateDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}
