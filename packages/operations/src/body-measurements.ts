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
} from "@hevy-mcp/hevy-client/types";
import {
	isExpectedReadEndOfList,
	PaginationMismatchError,
} from "./operation-errors.js";

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
