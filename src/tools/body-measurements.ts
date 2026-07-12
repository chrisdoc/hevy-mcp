import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
	BodyMeasurement,
	GetV1BodyMeasurements200,
	GetV1BodyMeasurementsDate200,
} from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
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
import { defineTool } from "./define-tool.js";

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
	wrapHandler: typeof withErrorHandling = withErrorHandling,
) {
	// Get body measurements (paginated list)
	const getBodyMeasurementsSchema = {
		page: z.coerce.number().int().gte(1).default(1),
		pageSize: z.coerce.number().int().gte(1).lte(10).default(10),
	} as const;
	type GetBodyMeasurementsParams = InferToolParams<
		typeof getBodyMeasurementsSchema
	>;

	defineTool(server, {
		name: "get-body-measurements",
		description: {
			summary: "Read-only. Lists dated body measurements for the account.",
			aliases: ["body stats history", "list weigh-ins", "measurement log"],
			useCase:
				"Use to browse measurement history; use get-body-measurement for one exact date.",
			importantNotes:
				"Results are paginated; page starts at 1 and pageSize is limited to 10.",
		},
		inputSchema: getBodyMeasurementsSchema,
		outputSchema: bodyMeasurementsOutputSchema,
		annotations: readOnlyAnnotations("Get Body Measurements"),
		wrapHandler,
		handler: async (args: GetBodyMeasurementsParams) => {
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
		},
	});

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

	defineTool(server, {
		name: "get-body-measurement",
		description: {
			summary: "Read-only. Retrieves the body measurement entry for one date.",
			aliases: ["get weigh-in", "show body stats", "measurement by date"],
			useCase:
				"Use when the exact measurement date is known; use get-body-measurements to browse dates.",
			importantNotes:
				"date must use YYYY-MM-DD; at most one entry exists per date.",
		},
		inputSchema: getBodyMeasurementSchema,
		outputSchema: bodyMeasurementOutputSchema,
		annotations: readOnlyAnnotations("Get Body Measurement"),
		wrapHandler,
		handler: async (args: GetBodyMeasurementParams) => {
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
		},
	});

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

	defineTool(server, {
		name: "create-body-measurement",
		description: {
			summary:
				"Writes to the Hevy account by creating a dated body measurement.",
			aliases: ["log weigh-in", "add body stats", "record measurements"],
			useCase:
				"Use for a date without an entry; use update-body-measurement when that date already exists.",
			importantNotes:
				"date must use YYYY-MM-DD and be unique. Null fields are omitted and cannot clear values; an existing date returns 409.",
		},
		inputSchema: createBodyMeasurementSchema,
		annotations: createAnnotations("Create Body Measurement"),
		wrapHandler,
		handler: async (args: CreateBodyMeasurementParams) => {
			const client = requireClient(hevyClient);
			const { date, ...fields } = args;
			await client.createBodyMeasurement({
				date,
				...buildMeasurementPayload(fields),
			});

			return createTextResponse(
				`Body measurement for ${date} created successfully.`,
			);
		},
	});

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

	defineTool(server, {
		name: "update-body-measurement",
		description: {
			summary:
				"Mutates the Hevy account by updating a body measurement for a date.",
			aliases: ["edit weigh-in", "correct body stats", "change measurements"],
			useCase:
				"Use to change fields on an existing date; use create-body-measurement for a new date.",
			importantNotes:
				"date must use YYYY-MM-DD and already exist. Provide at least one numeric field; nulls are omitted and cannot clear stored values.",
		},
		inputSchema: updateBodyMeasurementSchema,
		annotations: updateAnnotations("Update Body Measurement"),
		wrapHandler,
		handler: async (args: UpdateBodyMeasurementParams) => {
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
		},
	});
}
