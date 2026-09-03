import { NotFoundError } from "@hevy-mcp/hevy-client";
import type { GetV1BodyMeasurements200 } from "@hevy-mcp/hevy-client/types";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
	createBodyMeasurementsListOperation,
	type BodyMeasurementsListAdapter,
} from "./body-measurements.js";

function notFound(endpoint = "/v1/body_measurements") {
	return new NotFoundError({
		status: 404,
		method: "GET",
		endpoint,
		expected: true,
	});
}

function createAdapter(
	responses: readonly (GetV1BodyMeasurements200 | Error)[],
) {
	let responseIndex = 0;
	const requests: Array<{
		readonly params: Parameters<
			BodyMeasurementsListAdapter["getBodyMeasurements"]
		>[0];
		readonly options: Parameters<
			BodyMeasurementsListAdapter["getBodyMeasurements"]
		>[1];
	}> = [];
	const argumentCounts: number[] = [];
	const adapter: BodyMeasurementsListAdapter = {
		getBodyMeasurements(params, options) {
			argumentCounts.push(arguments.length);
			requests.push({ params, options });
			const response = responses[responseIndex++] ?? {
				body_measurements: [],
			};
			return response instanceof Error
				? Effect.fail(response)
				: Effect.succeed(response);
		},
	};
	return { adapter, requests, argumentCounts };
}

describe("bodyMeasurements.list operation", () => {
	it("normalizes the response envelope without changing empty 200 responses", async () => {
		const { adapter, requests } = createAdapter([
			{
				page: 2,
				page_count: 4,
				body_measurements: [],
			},
		]);
		const operation = createBodyMeasurementsListOperation(adapter);
		const options = { timeoutMs: 1_000 };

		await expect(
			Effect.runPromise(operation.effect({ page: 2, pageSize: 10 }, options)),
		).resolves.toEqual({
			items: [],
			page: 2,
			pageCount: 4,
		});
		expect(requests).toEqual([{ params: { page: 2, pageSize: 10 }, options }]);
	});

	it("defaults omitted page and body_measurements fields", async () => {
		const { adapter } = createAdapter([{}]);
		const operation = createBodyMeasurementsListOperation(adapter);

		await expect(
			Effect.runPromise(operation.effect({ page: 3, pageSize: 10 })),
		).resolves.toEqual({
			items: [],
			page: 3,
			pageCount: undefined,
		});
	});

	it("recovers only a later-page tagged collection 404", async () => {
		const operation = createBodyMeasurementsListOperation(
			createAdapter([notFound()]).adapter,
		);

		await expect(
			Effect.runPromise(operation.effect({ page: 2, pageSize: 10 })),
		).resolves.toEqual({
			items: [],
			page: 2,
			pageCount: undefined,
			expected404Outcome: "end_of_list",
		});

		const firstPageOperation = createBodyMeasurementsListOperation(
			createAdapter([notFound()]).adapter,
		);
		await expect(
			Effect.runPromise(firstPageOperation.effect({ page: 1, pageSize: 10 })),
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it("fails page mismatches as a tagged domain error", async () => {
		const operation = createBodyMeasurementsListOperation(
			createAdapter([
				{
					page: 3,
					page_count: 4,
					body_measurements: [],
				},
			]).adapter,
		);

		await expect(
			Effect.runPromise(operation.effect({ page: 2, pageSize: 10 })),
		).rejects.toMatchObject({
			_tag: "PaginationMismatchError",
			requested: 2,
			received: 3,
			collection: "bodyMeasurements",
		});
	});
});
