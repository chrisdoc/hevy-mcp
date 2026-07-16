import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
	BodyMeasurement,
	GetV1BodyMeasurements200,
	GetV1BodyMeasurementsDate200,
} from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import type { HevyClient } from "../utils/hevyClient.js";
import {
	bodyMeasurementResponse,
	bodyMeasurementsResponse,
	createBodyMeasurementResponse,
	respond,
	updateBodyMeasurementResponse,
} from "../utils/response-formatter.js";
import {
	createAnnotations,
	describeTool,
	readOnlyAnnotations,
	updateAnnotations,
} from "../utils/tool-definition.js";
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

	server.registerTool(
		"get-body-measurements",
		{
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
		},
		wrapHandler(async (args: GetBodyMeasurementsParams) => {
			const client = requireClient(hevyClient);
			const { page, pageSize } = args;
			const data: GetV1BodyMeasurements200 = await client.getBodyMeasurements({
				page,
				pageSize,
			});

			return respond(bodyMeasurementsResponse, data?.body_measurements);
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
			description: describeTool({
				summary:
					"Read-only. Retrieves the body measurement entry for one date.",
				aliases: ["get weigh-in", "show body stats", "measurement by date"],
				useCase:
					"Use when the exact measurement date is known; use get-body-measurements to browse dates.",
				importantNotes:
					"date must use YYYY-MM-DD; at most one entry exists per date.",
			}),
			inputSchema: getBodyMeasurementSchema,
			outputSchema: bodyMeasurementResponse.outputSchema,
			annotations: readOnlyAnnotations("Get Body Measurement"),
		},
		wrapHandler(async (args: GetBodyMeasurementParams) => {
			const client = requireClient(hevyClient);
			const { date } = args;
			const data: GetV1BodyMeasurementsDate200 =
				await client.getBodyMeasurement(date);

			return respond(bodyMeasurementResponse, {
				bodyMeasurement: data,
				date,
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
		describeTool({
			summary:
				"Writes to the Hevy account by creating a dated body measurement.",
			aliases: ["log weigh-in", "add body stats", "record measurements"],
			useCase:
				"Use for a date without an entry; use update-body-measurement when that date already exists.",
			importantNotes:
				"date must use YYYY-MM-DD and be unique. Null fields are omitted and cannot clear values; an existing date returns 409.",
		}),
		createBodyMeasurementSchema,
		createAnnotations("Create Body Measurement"),
		wrapHandler(async (args: CreateBodyMeasurementParams) => {
			const client = requireClient(hevyClient);
			const { date, ...fields } = args;
			await client.createBodyMeasurement({
				date,
				...buildMeasurementPayload(fields),
			});

			return respond(createBodyMeasurementResponse, date);
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
		describeTool({
			summary:
				"Mutates the Hevy account by updating a body measurement for a date.",
			aliases: ["edit weigh-in", "correct body stats", "change measurements"],
			useCase:
				"Use to change fields on an existing date; use create-body-measurement for a new date.",
			importantNotes:
				"date must use YYYY-MM-DD and already exist. Provide at least one numeric field; nulls are omitted and cannot clear stored values.",
		}),
		updateBodyMeasurementSchema,
		updateAnnotations("Update Body Measurement"),
		wrapHandler(async (args: UpdateBodyMeasurementParams) => {
			const client = requireClient(hevyClient);
			const { date, ...fields } = args;
			const payload = buildMeasurementPayload(fields);
			if (Object.keys(payload).length === 0) {
				throw new Error(
					"No measurement fields provided. Include at least one numeric measurement field (e.g. weightKg) to update.",
				);
			}
			await client.updateBodyMeasurement(date, payload);

			return respond(updateBodyMeasurementResponse, date);
		}, "update-body-measurement"),
	);
}
