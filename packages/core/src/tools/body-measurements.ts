import { Effect } from "effect";
import type { BodyMeasurement } from "@hevy-mcp/hevy-client/types";
import {
	bodyMeasurementResponse,
	bodyMeasurementsResponse,
	createBodyMeasurementResponse,
	updateBodyMeasurementResponse,
	type PaginatedToolResult,
} from "../utils/response-contracts.js";
import {
	readOnlyAnnotations,
	createAnnotations,
	updateAnnotations,
} from "../utils/tool-annotations.js";
import type { ToolDefinition } from "./define-tool.js";
import type { ToolRuntime } from "./tool-runtime.js";
import {
	calendarDate,
	createBodyMeasurementInputFields,
	paginationFields,
	updateBodyMeasurementInputFields,
} from "./input-schemas.js";
import { HevyOperationsService } from "../effect-services.js";
import { operationEffect, requireOperation } from "./operation-helpers.js";

const getBodyMeasurementsSchema = {
	...paginationFields({ defaultPageSize: 10, maxPageSize: 10 }),
} as const;
type GetBodyMeasurementsResult = PaginatedToolResult<BodyMeasurement>;

const getBodyMeasurementSchema = {
	date: calendarDate,
} as const;

const createBodyMeasurementSchema = createBodyMeasurementInputFields;
const updateBodyMeasurementSchema = updateBodyMeasurementInputFields;

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
	execute: (runtime: ToolRuntime, args) => {
		const { page, page_size } = args;
		return operationEffect(
			requireOperation(
				runtime.service(HevyOperationsService).bodyMeasurements?.list,
				"bodyMeasurements.list",
			),
			{ page, pageSize: page_size },
			runtime.execution,
		);
	},
};

const getBodyMeasurementDefinition: ToolDefinition<
	typeof getBodyMeasurementSchema,
	{
		body_measurement: BodyMeasurement | null | undefined;
		date: string;
		expected404Outcome?: "not_found";
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
	execute: (runtime: ToolRuntime, args) => {
		const { date } = args;
		return operationEffect(
			requireOperation(
				runtime.service(HevyOperationsService).bodyMeasurements?.get,
				"bodyMeasurements.get",
			),
			{ date },
			runtime.execution,
		).pipe(
			Effect.map(
				({ bodyMeasurement, date: resultDate, expected404Outcome }) => ({
					body_measurement: bodyMeasurement,
					date: resultDate,
					expected404Outcome,
				}),
			),
		);
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
	execute: (runtime, args) =>
		operationEffect(
			requireOperation(
				runtime.service(HevyOperationsService).bodyMeasurements?.create,
				"bodyMeasurements.create",
			),
			args,
			runtime.execution,
		),
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
	execute: (runtime, args) =>
		operationEffect(
			requireOperation(
				runtime.service(HevyOperationsService).bodyMeasurements?.update,
				"bodyMeasurements.update",
			),
			args,
			runtime.execution,
		),
};

export const bodyMeasurementToolDefinitions = [
	getBodyMeasurementsDefinition,
	getBodyMeasurementDefinition,
	createBodyMeasurementDefinition,
	updateBodyMeasurementDefinition,
] as const;
