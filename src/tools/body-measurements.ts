import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
	BodyMeasurement,
	GetV1BodyMeasurements200,
	GetV1BodyMeasurementsDate200,
} from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import { formatBodyMeasurement } from "../utils/formatters.js";
import {
	createEmptyResponse,
	createJsonResponse,
	createTextResponse,
} from "../utils/response-formatter.js";
import type { InferToolParams } from "../utils/tool-helpers.js";

type HevyClient = ReturnType<
	typeof import("../utils/hevyClientKubb.js").createClient
>;

const zNullableNumber = z.coerce.number().nullable().optional();

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

function buildMeasurementPayload(args: {
	weightKg?: number | null;
	leanMassKg?: number | null;
	fatPercent?: number | null;
	neckCm?: number | null;
	shoulderCm?: number | null;
	chestCm?: number | null;
	leftBicepCm?: number | null;
	rightBicepCm?: number | null;
	leftForearmCm?: number | null;
	rightForearmCm?: number | null;
	abdomen?: number | null;
	waist?: number | null;
	hips?: number | null;
	leftThigh?: number | null;
	rightThigh?: number | null;
	leftCalf?: number | null;
	rightCalf?: number | null;
}) {
	return {
		weight_kg: args.weightKg ?? null,
		lean_mass_kg: args.leanMassKg ?? null,
		fat_percent: args.fatPercent ?? null,
		neck_cm: args.neckCm ?? null,
		shoulder_cm: args.shoulderCm ?? null,
		chest_cm: args.chestCm ?? null,
		left_bicep_cm: args.leftBicepCm ?? null,
		right_bicep_cm: args.rightBicepCm ?? null,
		left_forearm_cm: args.leftForearmCm ?? null,
		right_forearm_cm: args.rightForearmCm ?? null,
		abdomen: args.abdomen ?? null,
		waist: args.waist ?? null,
		hips: args.hips ?? null,
		left_thigh: args.leftThigh ?? null,
		right_thigh: args.rightThigh ?? null,
		left_calf: args.leftCalf ?? null,
		right_calf: args.rightCalf ?? null,
	};
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

	server.tool(
		"get-body-measurements",
		"Get a paginated list of body measurements for the authenticated user. Returns measurements including weight, body fat, and various circumference measurements.",
		getBodyMeasurementsSchema,
		withErrorHandling(async (args: GetBodyMeasurementsParams) => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
			const { page, pageSize } = args;
			const data: GetV1BodyMeasurements200 =
				await hevyClient.getBodyMeasurements({
					page,
					pageSize,
				});

			const measurements =
				data?.body_measurements?.map((measurement: BodyMeasurement) =>
					formatBodyMeasurement(measurement),
				) || [];

			if (measurements.length === 0) {
				return createEmptyResponse(
					"No body measurements found for the specified parameters",
				);
			}

			return createJsonResponse(measurements);
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

	server.tool(
		"get-body-measurement",
		"Get a single body measurement by date. Returns all measurement fields for the specified date.",
		getBodyMeasurementSchema,
		withErrorHandling(async (args: GetBodyMeasurementParams) => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
			const { date } = args;
			const data: GetV1BodyMeasurementsDate200 =
				await hevyClient.getBodyMeasurement(date);

			if (!data) {
				return createEmptyResponse(
					`No body measurement found for date ${date}`,
				);
			}

			return createJsonResponse(formatBodyMeasurement(data));
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
		"Create a body measurement entry for a given date. All measurement fields are optional. Returns 409 if an entry already exists for that date — use update-body-measurement instead.",
		createBodyMeasurementSchema,
		withErrorHandling(async (args: CreateBodyMeasurementParams) => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
			const { date, ...fields } = args;
			await hevyClient.createBodyMeasurement({
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
		"Update an existing body measurement entry for a given date. All fields are overwritten — omitted fields are set to null. Returns 404 if no entry exists for the date.",
		updateBodyMeasurementSchema,
		withErrorHandling(async (args: UpdateBodyMeasurementParams) => {
			if (!hevyClient) {
				throw new Error(
					"API client not initialized. Please provide HEVY_API_KEY.",
				);
			}
			const { date, ...fields } = args;
			await hevyClient.updateBodyMeasurement(
				date,
				buildMeasurementPayload(fields),
			);

			return createTextResponse(
				`Body measurement for ${date} updated successfully.`,
			);
		}, "update-body-measurement"),
	);
}
