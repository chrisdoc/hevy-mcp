import { NotFoundError } from "@hevy-mcp/hevy-client";
import type { HevyRequestEffectError } from "@hevy-mcp/hevy-client/internal";
import type {
	BodyMeasurement,
	GetV1BodyMeasurements200,
	PutBodyMeasurement,
} from "@hevy-mcp/hevy-client/types";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import {
	createBodyMeasurementsCreateOperation,
	createBodyMeasurementsGetOperation,
	createBodyMeasurementsListOperation,
	createBodyMeasurementsUpdateOperation,
	type BodyMeasurementsListAdapter,
} from "./body-measurements.js";
import { EmptyMeasurementUpdateError } from "./operation-errors.js";

function notFound(endpoint = "/v1/body_measurements") {
	return new NotFoundError({
		status: 404,
		method: "GET",
		endpoint,
		expected: true,
	});
}

function createAdapter(
	responses: readonly (GetV1BodyMeasurements200 | HevyRequestEffectError)[],
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
			return "_tag" in response
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

describe("bodyMeasurements.get operation", () => {
	it("returns the measurement and date with a read descriptor", async () => {
		const bodyMeasurement: BodyMeasurement = {
			date: "2025-01-01",
			weight_kg: 80,
		};
		const getBodyMeasurement = vi.fn(() => Effect.succeed(bodyMeasurement));
		const operation = createBodyMeasurementsGetOperation({
			getBodyMeasurement,
		});
		const options = { timeoutMs: 1_000 };

		await expect(
			Effect.runPromise(operation.effect({ date: "2025-01-01" }, options)),
		).resolves.toEqual({
			bodyMeasurement,
			date: "2025-01-01",
		});
		expect(operation.descriptor).toEqual({
			id: "bodyMeasurements.get",
			safety: "read",
		});
		expect(getBodyMeasurement).toHaveBeenCalledWith("2025-01-01", options);
	});

	it("recovers only a member 404 as not_found", async () => {
		const date = "2025-01-01";
		const memberError = notFound(`/v1/body_measurements/${date}`);
		const memberOperation = createBodyMeasurementsGetOperation({
			getBodyMeasurement: vi.fn(() => Effect.fail(memberError)),
		});

		await expect(
			Effect.runPromise(memberOperation.effect({ date })),
		).resolves.toEqual({
			bodyMeasurement: null,
			date,
			expected404Outcome: "not_found",
		});

		const collectionError = notFound("/v1/body_measurements");
		const collectionOperation = createBodyMeasurementsGetOperation({
			getBodyMeasurement: vi.fn(() => Effect.fail(collectionError)),
		});
		await expect(
			Effect.runPromise(collectionOperation.effect({ date })),
		).rejects.toBe(collectionError);
	});
});

describe("bodyMeasurements.create operation", () => {
	it("omits nullish fields before calling the Effect adapter", async () => {
		const createBodyMeasurement = vi.fn(
			(data: BodyMeasurement, _options?: { timeoutMs?: number }) =>
				Effect.succeed(data),
		);
		const operation = createBodyMeasurementsCreateOperation({
			createBodyMeasurement,
		});
		const options = { timeoutMs: 1_000 };

		await expect(
			Effect.runPromise(
				operation.effect(
					{
						date: "2025-01-01",
						weight_kg: 80,
						lean_mass_kg: null,
						fat_percent: undefined,
					},
					options,
				),
			),
		).resolves.toBe("2025-01-01");
		expect(createBodyMeasurement).toHaveBeenCalledWith(
			{ date: "2025-01-01", weight_kg: 80 },
			options,
		);
	});
});

describe("bodyMeasurements.update operation", () => {
	function updateAdapter(
		existing: Effect.Effect<BodyMeasurement, HevyRequestEffectError>,
	) {
		const getBodyMeasurement = vi.fn(
			(_date: string, _options?: { timeoutMs?: number }) => existing,
		);
		const updateBodyMeasurement = vi.fn(
			(
				_date: string,
				data: PutBodyMeasurement,
				_options?: { timeoutMs?: number },
			) => Effect.succeed(data),
		);
		return { getBodyMeasurement, updateBodyMeasurement };
	}

	// OpenAPI PUT /v1/body_measurements/{date}: "All fields are overwritten;
	// omitted fields are set to null." The update-body-measurement MCP tool
	// promises "Omitted fields remain unchanged", so stored values are re-sent.
	it("preserves stored fields the caller omitted on the full-overwrite PUT", async () => {
		const adapter = updateAdapter(
			Effect.succeed({
				date: "2025-01-01",
				weight_kg: 80,
				waist: 82,
				fat_percent: 18,
			}),
		);
		const operation = createBodyMeasurementsUpdateOperation(adapter);
		const options = { timeoutMs: 1_000 };

		await expect(
			Effect.runPromise(
				operation.effect(
					{ date: "2025-01-01", weight_kg: 81, hips: null },
					options,
				),
			),
		).resolves.toBe("2025-01-01");
		expect(adapter.getBodyMeasurement).toHaveBeenCalledWith(
			"2025-01-01",
			options,
		);
		expect(adapter.updateBodyMeasurement).toHaveBeenCalledWith(
			"2025-01-01",
			{ weight_kg: 81, waist: 82, fat_percent: 18 },
			options,
		);
	});

	it("fails with a not-found error instead of creating a missing measurement", async () => {
		const adapter = updateAdapter(
			Effect.fail(notFound("/v1/body_measurements/:date")),
		);
		const operation = createBodyMeasurementsUpdateOperation(adapter);

		const error = await Effect.runPromise(
			Effect.flip(operation.effect({ date: "2025-01-01", weight_kg: 81 })),
		);

		expect(error).toBeInstanceOf(NotFoundError);
		expect(error).toMatchObject({ _tag: "NotFoundError", expected: false });
		expect(adapter.updateBodyMeasurement).not.toHaveBeenCalled();
	});

	it("treats an empty GET response as not found", async () => {
		const adapter = updateAdapter(Effect.succeed({} as BodyMeasurement));
		const operation = createBodyMeasurementsUpdateOperation(adapter);

		const error = await Effect.runPromise(
			Effect.flip(operation.effect({ date: "2025-01-01", weight_kg: 81 })),
		);

		expect(error).toBeInstanceOf(NotFoundError);
		expect(adapter.updateBodyMeasurement).not.toHaveBeenCalled();
	});

	it("fails an empty numeric payload through a tagged domain error", async () => {
		const adapter = updateAdapter(Effect.succeed({ date: "2025-01-01" }));
		const operation = createBodyMeasurementsUpdateOperation(adapter);

		const error = await Effect.runPromise(
			Effect.flip(
				operation.effect({
					date: "2025-01-01",
					weight_kg: null,
					fat_percent: undefined,
				}),
			),
		);

		expect(error).toBeInstanceOf(EmptyMeasurementUpdateError);
		expect(error).toMatchObject({
			_tag: "EmptyMeasurementUpdateError",
			message: expect.stringContaining("No measurement fields provided"),
		});
		expect(adapter.updateBodyMeasurement).not.toHaveBeenCalled();
	});
});
