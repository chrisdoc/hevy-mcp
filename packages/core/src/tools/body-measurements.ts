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
import { describeTool } from "../utils/tool-descriptions.js";
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
	recordExpected404,
} from "../utils/hevy-error-policy.js";

const getBodyMeasurementsSchema = {
	...paginationShape({ defaultPageSize: 10, maxPageSize: 10 }),
} as const;
type GetBodyMeasurementsResult = PaginatedToolResult<
	NonNullable<GetV1BodyMeasurements200["body_measurements"]>[number]
>;

const getBodyMeasurementSchema = {
	date: calendarDate.describe("The date of the body measurement (YYYY-MM-DD)"),
} as const;

const createBodyMeasurementSchema = {
	date: calendarDate.describe(
		"The date of the body measurement (YYYY-MM-DD). Must be unique — returns 409 if an entry already exists for this date.",
	),
	...bodyMeasurementFieldsSchema,
} as const;

const updateBodyMeasurementSchema = {
	date: calendarDate.describe(
		"The date of the body measurement to update (YYYY-MM-DD). Must already exist — returns 404 otherwise.",
	),
	...bodyMeasurementFieldsSchema,
} as const;

const getBodyMeasurementsDefinition: ToolDefinition<
	typeof getBodyMeasurementsSchema,
	GetBodyMeasurementsResult
> = {
	name: "get-body-measurements",
	feature: "measurements",
	operation: "list",
	description: describeTool({
		summary: "Read-only. Lists dated body measurements for the account.",
		aliases: ["body stats history", "list weigh-ins", "measurement log"],
		useCase:
			"Use to browse measurement history; use get-body-measurement for one exact date.",
		importantNotes:
			"Results are paginated; page starts at 1 and pageSize is limited to 10.",
	}),
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
				recordExpected404("end_of_list");
				return { items: [], page };
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
	description: describeTool({
		summary: "Read-only. Retrieves the body measurement entry for one date.",
		aliases: ["get weigh-in", "show body stats", "measurement by date"],
		useCase:
			"Use when the exact measurement date is known; use get-body-measurements to browse dates.",
		importantNotes:
			"date must use YYYY-MM-DD; at most one entry exists per date.",
	}),
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
				recordExpected404("not_found");
				return { bodyMeasurement: null, date };
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
	description: describeTool({
		summary: "Writes to the Hevy account by creating a dated body measurement.",
		aliases: ["log weigh-in", "add body stats", "record measurements"],
		useCase:
			"Use for a date without an entry; use update-body-measurement when that date already exists.",
		importantNotes:
			"date must use YYYY-MM-DD and be unique. Null fields are omitted and cannot clear values; an existing date returns 409.",
	}),
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
	description: describeTool({
		summary:
			"Mutates the Hevy account by updating a body measurement for a date.",
		aliases: ["edit weigh-in", "correct body stats", "change measurements"],
		useCase:
			"Use to change fields on an existing date; use create-body-measurement for a new date.",
		importantNotes:
			"date must use YYYY-MM-DD and already exist. Provide at least one numeric field; nulls are omitted and cannot clear stored values.",
	}),
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
