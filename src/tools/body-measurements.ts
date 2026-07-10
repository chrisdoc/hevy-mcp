import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
	BodyMeasurement,
	GetV1BodyMeasurements200,
	GetV1BodyMeasurementsDate200,
} from "../generated/client/types/index.js";
import { withObservability } from "../utils/observability-wrapper.js";
import { formatBodyMeasurement } from "../utils/formatters.js";
import type { HevyClient } from "../utils/hevyClient.js";
import {
	bodyMeasurementOutputSchema,
	bodyMeasurementsOutputSchema,
} from "../utils/output-schemas.js";
import {
	createStructuredEmptyResponse,
	createStructuredJsonResponse,
	createTextResponse,
} from "../utils/response-formatter.js";
import {
	createAnnotations,
	readOnlyAnnotations,
	updateAnnotations,
} from "../utils/tool-annotations.js";
import { requireClient, type InferToolParams } from "../utils/tool-helpers.js";
import { zNullableNumber } from "../utils/schemas.js";

const bodyMeasurementFieldsSchema = {
	weightKg: zNullableNumber.describe("Body weight in kilograms"),
	leanMassKg: zNullableNumber.describe("Lean body mass in kilograms"),
	fatPercent: zNullableNumber.describe("Body fat percentage"),
	neckCm: zNullableNumber.describe("Neck circumference in centimeters"),
	shoulderCm: zNullableNumber.describe("Shoulder circumference in centimeters"),
	chestCm: zNullableNumber.describe("Chest circumference in centimeters"),
	leftBicepCm: zNullableNumber.describe(
		"Left bicep circumference in centimeters",
	),
	rightBicepCm: zNullableNumber.describe(
		"Right bicep circumference in centimeters",
	),
	leftForearmCm: zNullableNumber.describe(
		"Left forearm circumference in centimeters",
	),
	rightForearmCm: zNullableNumber.describe(
		"Right forearm circumference in centimeters",
	),
	abdomen: zNullableNumber.describe("Abdomen circumference in centimeters"),
	waist: zNullableNumber.describe("Waist circumference in centimeters"),
	hips: zNullableNumber.describe("Hips circumference in centimeters"),
	leftThigh: zNullableNumber.describe(
		"Left thigh circumference in centimeters",
	),
	rightThigh: zNullableNumber.describe(
		"Right thigh circumference in centimeters",
	),
	leftCalf: zNullableNumber.describe("Left calf circumference in centimeters"),
	rightCalf: zNullableNumber.describe(
		"Right calf circumference in centimeters",
	),
} as const;

const MEASUREMENT_FIELD_TO_API_KEY = {
	weightKg: "weight_kg",
	leanMassKg: "lean_mass_kg",
	fatPercent: "fat_percent",
	neckCm: "neck_cm",
	shoulderCm: "shoulder_cm",
	chestCm: "chest_cm",
	leftBicepCm: "left_bicep_cm",
	rightBicepCm: "right_bicep_cm",
	leftForearmCm: "left_forearm_cm",
	rightForearmCm: "right_forearm_cm",
	abdomen: "abdomen",
	waist: "waist",
	hips: "hips",
	leftThigh: "left_thigh",
	rightThigh: "right_thigh",
	leftCalf: "left_calf",
	rightCalf: "right_calf",
} as const satisfies Record<
	keyof typeof bodyMeasurementFieldsSchema,
	keyof Omit<BodyMeasurement, "date">
>;

type MeasurementFieldArgs = Partial<
	Record<keyof typeof MEASUREMENT_FIELD_TO_API_KEY, number | null>
>;

// The Hevy API rejects null for omitted fields, so only fields with actual
// values are included in the payload (#341).
function buildMeasurementPayload(
	args: MeasurementFieldArgs,
): Omit<BodyMeasurement, "date"> {
	const payload: Omit<BodyMeasurement, "date"> = {};
	for (const [camelKey, apiKey] of Object.entries(
		MEASUREMENT_FIELD_TO_API_KEY,
	) as [keyof MeasurementFieldArgs, keyof Omit<BodyMeasurement, "date">][]) {
		const value = args[camelKey];
		if (value != null) {
			payload[apiKey] = value;
		}
	}
	return payload;
}

export function registerBodyMeasurementTools(
	server: McpServer,
	hevyClient: HevyClient | null,
) {
	// Get body measurements (paginated list)
	const getBodyMeasurementsSchema = {
		page: z.coerce.number().int().gte(1).default(1),
		pageSize: z.coerce.number().int().gte(1).lte(10).default(10),
	} as const;
	type GetBodyMeasurementsParams = InferToolParams<
		typeof getBodyMeasurementsSchema
	>;

	server.registerTool(
		"get-body-measurements",
		{
			description:
				"Get a paginated list of body measurements for the authenticated user. Returns measurements including weight, body fat, and various circumference measurements.",
			inputSchema: getBodyMeasurementsSchema,
			outputSchema: bodyMeasurementsOutputSchema,
			annotations: readOnlyAnnotations("Get Body Measurements"),
		},
		withObservability(async (args: GetBodyMeasurementsParams) => {
			const client = requireClient(hevyClient);
			const { page, pageSize } = args;
			const data: GetV1BodyMeasurements200 = await client.getBodyMeasurements({
				page,
				pageSize,
			});

			const measurements =
				data?.body_measurements?.map((measurement: BodyMeasurement) =>
					formatBodyMeasurement(measurement),
				) || [];

			if (measurements.length === 0) {
				return createStructuredEmptyResponse(
					"No body measurements found for the specified parameters",
					{ bodyMeasurements: [] },
				);
			}

			return createStructuredJsonResponse(measurements, {
				bodyMeasurements: measurements,
			});
		}, "get-body-measurements"),
	);

	// Get single body measurement by date
	const getBodyMeasurementSchema = {
		date: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
			.describe("The date of the body measurement (YYYY-MM-DD)"),
	} as const;
	type GetBodyMeasurementParams = InferToolParams<
		typeof getBodyMeasurementSchema
	>;

	server.registerTool(
		"get-body-measurement",
		{
			description:
				"Get a single body measurement by date. Returns all measurement fields for the specified date.",
			inputSchema: getBodyMeasurementSchema,
			outputSchema: bodyMeasurementOutputSchema,
			annotations: readOnlyAnnotations("Get Body Measurement"),
		},
		withObservability(async (args: GetBodyMeasurementParams) => {
			const client = requireClient(hevyClient);
			const { date } = args;
			const data: GetV1BodyMeasurementsDate200 =
				await client.getBodyMeasurement(date);

			if (!data) {
				return createStructuredEmptyResponse(
					`No body measurement found for date ${date}`,
					{ bodyMeasurement: null },
				);
			}

			const bodyMeasurement = formatBodyMeasurement(data);
			return createStructuredJsonResponse(bodyMeasurement, {
				bodyMeasurement,
			});
		}, "get-body-measurement"),
	);

	// Create body measurement
	const createBodyMeasurementSchema = {
		date: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
			.describe(
				"The date of the body measurement (YYYY-MM-DD). Must be unique — returns 409 if an entry already exists for this date.",
			),
		...bodyMeasurementFieldsSchema,
	} as const;
	type CreateBodyMeasurementParams = InferToolParams<
		typeof createBodyMeasurementSchema
	>;

	server.tool(
		"create-body-measurement",
		"Create a body measurement entry for a given date. All measurement fields are optional; null values are treated as omitted, since the Hevy API does not support clearing individual fields. Returns 409 if an entry already exists for that date — use update-body-measurement instead.",
		createBodyMeasurementSchema,
		createAnnotations("Create Body Measurement"),
		withObservability(async (args: CreateBodyMeasurementParams) => {
			const client = requireClient(hevyClient);
			const { date, ...fields } = args;
			await client.createBodyMeasurement({
				date,
				...buildMeasurementPayload(fields),
			});

			return createTextResponse(
				`Body measurement for ${date} created successfully.`,
			);
		}, "create-body-measurement"),
	);

	// Update body measurement
	const updateBodyMeasurementSchema = {
		date: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
			.describe(
				"The date of the body measurement to update (YYYY-MM-DD). Must already exist — returns 404 otherwise.",
			),
		...bodyMeasurementFieldsSchema,
	} as const;
	type UpdateBodyMeasurementParams = InferToolParams<
		typeof updateBodyMeasurementSchema
	>;

	server.tool(
		"update-body-measurement",
		"Update an existing body measurement entry for a given date. Only the fields you provide are sent and updated; null values are treated as omitted, since the Hevy API does not support clearing individual fields. Requires at least one measurement field. Returns 404 if no entry exists for the date.",
		updateBodyMeasurementSchema,
		updateAnnotations("Update Body Measurement"),
		withObservability(async (args: UpdateBodyMeasurementParams) => {
			const client = requireClient(hevyClient);
			const { date, ...fields } = args;
			const payload = buildMeasurementPayload(fields);
			if (Object.keys(payload).length === 0) {
				throw new Error(
					"No measurement fields provided. Include at least one numeric measurement field (e.g. weightKg) to update.",
				);
			}
			await client.updateBodyMeasurement(date, payload);

			return createTextResponse(
				`Body measurement for ${date} updated successfully.`,
			);
		}, "update-body-measurement"),
	);
}
