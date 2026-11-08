import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isAxiosError } from "axios";
import { z } from "zod";
import type {
	BodyMeasurement,
	GetV1BodyMeasurements200,
	PutBodyMeasurement,
} from "../generated/client/types/index.js";
import { withErrorHandling } from "../utils/error-handler.js";
import {
	BODY_MEASUREMENT_FIELDS,
	type BodyMeasurementField,
	formatBodyMeasurement,
} from "../utils/formatters.js";
import type { HevyClient } from "../utils/hevyClient.js";
import {
	createEmptyResponse,
	createJsonResponse,
	createTextResponse,
} from "../utils/response-formatter.js";
import type { InferToolParams } from "../utils/tool-helpers.js";

const dateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
	.describe("The measurement date (YYYY-MM-DD)");

const fieldDescriptions: Record<BodyMeasurementField, string> = {
	weightKg: "Body weight in kg",
	leanMassKg: "Lean body mass in kg",
	fatPercent: "Body fat percentage",
	neckCm: "Neck circumference in cm",
	shoulderCm: "Shoulder circumference in cm",
	chestCm: "Chest circumference in cm",
	leftBicepCm: "Left bicep circumference in cm",
	rightBicepCm: "Right bicep circumference in cm",
	leftForearmCm: "Left forearm circumference in cm",
	rightForearmCm: "Right forearm circumference in cm",
	abdomenCm: "Abdomen circumference in cm",
	waistCm: "Waist circumference in cm",
	hipsCm: "Hips circumference in cm",
	leftThighCm: "Left thigh circumference in cm",
	rightThighCm: "Right thigh circumference in cm",
	leftCalfCm: "Left calf circumference in cm",
	rightCalfCm: "Right calf circumference in cm",
};

// Each value may be a number, null (clear the value) or omitted.
const measurementFieldsSchema = Object.fromEntries(
	Object.entries(fieldDescriptions).map(([field, description]) => [
		field,
		z.coerce.number().nonnegative().nullable().optional().describe(description),
	]),
) as Record<BodyMeasurementField, z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;

type MeasurementValues = Partial<Record<BodyMeasurementField, number | null>>;

/**
 * Convert tool-level camelCase fields to API snake_case fields, skipping
 * fields that were not provided.
 */
function toApiFields(values: MeasurementValues): PutBodyMeasurement {
	const body: PutBodyMeasurement = {};
	for (const [field, apiField] of Object.entries(BODY_MEASUREMENT_FIELDS)) {
		const value = values[field as BodyMeasurementField];
		if (value !== undefined) {
			body[apiField] = value;
		}
	}
	return body;
}

function pickApiFields(measurement: BodyMeasurement): PutBodyMeasurement {
	const body: PutBodyMeasurement = {};
	for (const apiField of Object.values(BODY_MEASUREMENT_FIELDS)) {
		body[apiField] = measurement[apiField] ?? null;
	}
	return body;
}

function hasStatus(error: unknown, status: number): boolean {
	return isAxiosError(error) && error.response?.status === status;
}

/**
 * Register all body measurement tools with the MCP server
 */
export function registerMeasurementTools(
	server: McpServer,
	hevyClient: HevyClient | null,
) {
	const requireClient = () => {
		if (!hevyClient) {
			throw new Error(
				"API client not initialized. Please provide HEVY_API_KEY.",
			);
		}
		return hevyClient;
	};

	// Get paginated body measurements
	const getBodyMeasurementsSchema = {
		page: z.coerce.number().int().gte(1).default(1),
		pageSize: z.coerce.number().int().gte(1).lte(10).default(10),
	} as const;
	type GetBodyMeasurementsParams = InferToolParams<
		typeof getBodyMeasurementsSchema
	>;

	server.tool(
		"get-body-measurements",
		"Get a paginated list of the user's body measurement entries (weight in kg, lean mass in kg, body fat %, and body circumferences in cm). Each entry is keyed by date.",
		getBodyMeasurementsSchema,
		withErrorHandling(async (args: GetBodyMeasurementsParams) => {
			const client = requireClient();
			const { page, pageSize } = args;
			const data: GetV1BodyMeasurements200 = await client.getBodyMeasurements({
				page,
				pageSize,
			});

			const measurements =
				data?.body_measurements?.map(formatBodyMeasurement) ?? [];
			if (measurements.length === 0) {
				return createEmptyResponse(
					"No body measurements found for the specified parameters",
				);
			}

			return createJsonResponse({
				page: data.page,
				pageCount: data.page_count,
				bodyMeasurements: measurements,
			});
		}, "get-body-measurements"),
	);

	// Get a single body measurement by date
	const getBodyMeasurementSchema = { date: dateSchema } as const;
	type GetBodyMeasurementParams = InferToolParams<
		typeof getBodyMeasurementSchema
	>;

	server.tool(
		"get-body-measurement",
		"Get the user's body measurement entry for a specific date (YYYY-MM-DD). Weights are in kg and circumferences in cm.",
		getBodyMeasurementSchema,
		withErrorHandling(async (args: GetBodyMeasurementParams) => {
			const client = requireClient();
			try {
				const data = await client.getBodyMeasurement(args.date);
				if (!data) {
					return createEmptyResponse(
						`No body measurement found for ${args.date}`,
					);
				}
				return createJsonResponse(formatBodyMeasurement(data), {
					pretty: true,
					indent: 2,
				});
			} catch (error) {
				if (hasStatus(error, 404)) {
					return createEmptyResponse(
						`No body measurement found for ${args.date}`,
					);
				}
				throw error;
			}
		}, "get-body-measurement"),
	);

	// Create a body measurement
	const createBodyMeasurementSchema = {
		date: dateSchema,
		...measurementFieldsSchema,
	} as const;
	type CreateBodyMeasurementParams = InferToolParams<
		typeof createBodyMeasurementSchema
	>;

	server.tool(
		"create-body-measurement",
		"Create a body measurement entry for a date (YYYY-MM-DD). Provide any of the measurement fields; weights must be in kg and circumferences in cm. Only one entry is allowed per date - if one already exists, use update-body-measurement instead.",
		createBodyMeasurementSchema,
		withErrorHandling(async (args: CreateBodyMeasurementParams) => {
			const client = requireClient();
			const { date, ...values } = args;
			const fields = toApiFields(values);
			if (Object.keys(fields).length === 0) {
				throw new Error("Provide at least one measurement value.");
			}

			try {
				await client.createBodyMeasurement({ date, ...fields });
			} catch (error) {
				if (hasStatus(error, 409)) {
					return createTextResponse(
						`A body measurement for ${date} already exists. Use update-body-measurement to change it.`,
					);
				}
				throw error;
			}

			return createJsonResponse(
				{
					message: `Body measurement created for ${date}`,
					bodyMeasurement: formatBodyMeasurement({ date, ...fields }),
				},
				{ pretty: true, indent: 2 },
			);
		}, "create-body-measurement"),
	);

	// Update a body measurement
	const updateBodyMeasurementSchema = {
		date: dateSchema,
		...measurementFieldsSchema,
	} as const;
	type UpdateBodyMeasurementParams = InferToolParams<
		typeof updateBodyMeasurementSchema
	>;

	server.tool(
		"update-body-measurement",
		"Update the body measurement entry for a date (YYYY-MM-DD). Only the fields you provide are changed; other existing values are kept. Pass null for a field to clear it. Weights must be in kg and circumferences in cm. The entry must already exist - use create-body-measurement otherwise.",
		updateBodyMeasurementSchema,
		withErrorHandling(async (args: UpdateBodyMeasurementParams) => {
			const client = requireClient();
			const { date, ...values } = args;
			const changes = toApiFields(values);
			if (Object.keys(changes).length === 0) {
				throw new Error("Provide at least one measurement value to update.");
			}

			// The API overwrites every field (omitted fields become null), so
			// merge the changes into the existing entry first.
			let existing: BodyMeasurement;
			try {
				existing = await client.getBodyMeasurement(date);
			} catch (error) {
				if (hasStatus(error, 404)) {
					return createTextResponse(
						`No body measurement exists for ${date}. Use create-body-measurement to add one.`,
					);
				}
				throw error;
			}

			const merged: PutBodyMeasurement = {
				...pickApiFields(existing),
				...changes,
			};
			await client.updateBodyMeasurement(date, merged);

			return createJsonResponse(
				{
					message: `Body measurement updated for ${date}`,
					bodyMeasurement: formatBodyMeasurement({ date, ...merged }),
				},
				{ pretty: true, indent: 2 },
			);
		}, "update-body-measurement"),
	);
}
