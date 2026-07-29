import type {
	GetV1BodyMeasurements200,
	GetV1BodyMeasurementsDate200,
} from "@hevy-mcp/hevy-client/types";
import {
	bodyMeasurementResponse,
	bodyMeasurementsResponse,
	createBodyMeasurementResponse,
	updateBodyMeasurementResponse,
} from "../utils/response-formatter.js";
import {
	readOnlyAnnotations,
	createAnnotations,
	updateAnnotations,
} from "../utils/tool-annotations.js";

import type { ToolDefinition } from "./define-tool.js";
import type { ToolRuntime } from "./tool-runtime.js";
import {
	bodyMeasurementFieldsSchema,
	calendarDate,
	paginationShape,
} from "./input-schemas.js";
import { buildMeasurementPayload } from "./payload-mappers.js";
import type { PaginatedToolResult } from "../utils/response-formatter.js";
import {
	isExpectedListPageNotFound,
	isExpectedReadNotFound,
} from "../utils/hevy-error-policy.js";

const getBodyMeasurementsSchema = {
	...paginationShape({ defaultPageSize: 10, maxPageSize: 10 }),
} as const;
type GetBodyMeasurementsResult = PaginatedToolResult<
	NonNullable<GetV1BodyMeasurements200["body_measurements"]>[number]
>;

const getBodyMeasurementSchema = {
	date: calendarDate,
} as const;

const createBodyMeasurementSchema = {
	date: calendarDate,
	...bodyMeasurementFieldsSchema,
} as const;

const updateBodyMeasurementSchema = {
	date: calendarDate,
	...bodyMeasurementFieldsSchema,
} as const;

const getBodyMeasurementsDefinition: ToolDefinition<
	typeof getBodyMeasurementsSchema,
	GetBodyMeasurementsResult
> = {
	name: "get-body-measurements",
	feature: "measurements",
	operation: "list",
	description:
		"Read-only. Lists dated body measurements; results are paginated. Use get-body-measurement for one date.",
	inputSchema: getBodyMeasurementsSchema,
	outputSchema: bodyMeasurementsResponse.outputSchema,
	annotations: readOnlyAnnotations("Get Body Measurements"),
	kind: "read",
	responseContract: bodyMeasurementsResponse,
	execute: async (runtime: ToolRuntime, args) => {
		const { page, pageSize } = args;
		try {
			const data: GetV1BodyMeasurements200 = await runtime
				.getClient()
				.getBodyMeasurements({ page, pageSize });
			return {
				items: data?.body_measurements ?? [],
				page,
				pageCount: data?.page_count,
			};
		} catch (error) {
			if (isExpectedListPageNotFound(error, page)) {
				return { items: [], page, expected404Outcome: "end_of_list" };
			}
			throw error;
		}
	},
};

const getBodyMeasurementDefinition: ToolDefinition<
	typeof getBodyMeasurementSchema,
	{
		bodyMeasurement: GetV1BodyMeasurementsDate200 | null | undefined;
		date: string;
	}
> = {
	name: "get-body-measurement",
	feature: "measurements",
	operation: "get",
	description:
		"Read-only. Gets the body measurement for one YYYY-MM-DD date. Use get-body-measurements to browse dates.",
	inputSchema: getBodyMeasurementSchema,
	outputSchema: bodyMeasurementResponse.outputSchema,
	annotations: readOnlyAnnotations("Get Body Measurement"),
	kind: "read",
	responseContract: bodyMeasurementResponse,
	execute: async (runtime: ToolRuntime, args) => {
		const { date } = args;
		try {
			const data: GetV1BodyMeasurementsDate200 = await runtime
				.getClient()
				.getBodyMeasurement(date);
			return { bodyMeasurement: data, date };
		} catch (error) {
			if (isExpectedReadNotFound(error)) {
				return {
					bodyMeasurement: null,
					date,
					expected404Outcome: "not_found",
				};
			}
			throw error;
		}
	},
};

const createBodyMeasurementDefinition: ToolDefinition<
	typeof createBodyMeasurementSchema,
	string
> = {
	name: "create-body-measurement",
	feature: "measurements",
	operation: "create",
	description:
		"Writes a body measurement for a new YYYY-MM-DD date. Existing dates conflict; retries are not idempotent.",
	inputSchema: createBodyMeasurementSchema,
	annotations: createAnnotations("Create Body Measurement"),
	kind: "write",
	responseContract: createBodyMeasurementResponse,
	execute: async (runtime: ToolRuntime, args) => {
		const { date, ...fields } = args;
		await runtime.getClient().createBodyMeasurement({
			date,
			...buildMeasurementPayload(fields),
		});
		return date;
	},
};

const updateBodyMeasurementDefinition: ToolDefinition<
	typeof updateBodyMeasurementSchema,
	string
> = {
	name: "update-body-measurement",
	feature: "measurements",
	operation: "update",
	description:
		"Mutates numeric fields on an existing YYYY-MM-DD measurement. Omitted fields remain unchanged; values cannot be cleared.",
	inputSchema: updateBodyMeasurementSchema,
	annotations: updateAnnotations("Update Body Measurement"),
	kind: "write",
	responseContract: updateBodyMeasurementResponse,
	execute: async (runtime: ToolRuntime, args) => {
		const { date, ...fields } = args;
		const payload = buildMeasurementPayload(fields);
		if (Object.keys(payload).length === 0) {
			throw new Error(
				"No measurement fields provided. Include at least one numeric measurement field (e.g. weightKg) to update.",
			);
		}
		await runtime.getClient().updateBodyMeasurement(date, payload);
		return date;
	},
};

export const bodyMeasurementToolDefinitions = [
	getBodyMeasurementsDefinition,
	getBodyMeasurementDefinition,
	createBodyMeasurementDefinition,
	updateBodyMeasurementDefinition,
] as const;
