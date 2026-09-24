import {
	bodyMeasurementSchema,
	getV1BodyMeasurementsQueryParamsSchema,
} from "@hevy-mcp/hevy-client/schemas";
import {
	mergeMeasurementPayload,
	type HevyOperations,
} from "@hevy-mcp/operations";
import {
	createBodyMeasurementInputSchema,
	updateBodyMeasurementInputSchema,
} from "@hevy-mcp/operations/schemas";
import { Effect } from "effect";
import { z } from "zod";
import {
	parseMeasurementDate,
	parsePagination,
	requireMutationConfirmation,
	UsageError,
} from "../arguments.js";
import { ApiResponseError } from "../errors.js";
import { loadMutationInput } from "../input.js";
import {
	pageEnvelope,
	type ApiObject,
	type ApiValue,
} from "../output/contracts.js";
import {
	collapse,
	list,
	mutationData,
	requireOperation,
	runOperation,
	type CommandContext,
	type CommandResult,
} from "./context.js";

type Body = ApiObject;
type CliMeasurementUpdateInput = z.infer<
	typeof updateBodyMeasurementInputSchema
>;

const existingBodyMeasurementSchema = bodyMeasurementSchema.strict();
const createBodyMeasurementDataSchema = createBodyMeasurementInputSchema.refine(
	(fields) =>
		Object.entries(fields).some(
			([key, value]) => key !== "date" && z.number().safeParse(value).success,
		),
	"Include at least one numeric measurement field",
);
const updateBodyMeasurementDataSchema = updateBodyMeasurementInputSchema.refine(
	(fields) => Object.keys(fields).some((key) => key !== "date"),
	"Include at least one measurement field",
);

function body(value: ApiValue): Body {
	const parsed = z.object({}).passthrough().safeParse(value);
	if (!parsed.success) return {};
	const result: Body = {};
	for (const [key, item] of Object.entries(parsed.data)) {
		const parsedItem = z
			.union([
				z.string(),
				z.number(),
				z.boolean(),
				z.null(),
				z.array(z.unknown()),
			])
			.safeParse(item);
		if (parsedItem.success) result[key] = parsedItem.data as ApiValue;
	}
	return result;
}

function measurementResult(input: Body, date: string): Body {
	const result: Body = { date };
	for (const [key, value] of Object.entries(input)) {
		if (key !== "date" && value !== null && value !== undefined)
			result[key] = value;
	}
	return result;
}

function updateMeasurement(
	operations: HevyOperations,
	date: string,
	input: CliMeasurementUpdateInput,
	execution: CommandContext["execution"],
) {
	const getOperation = requireOperation(
		operations.bodyMeasurements?.get,
		"bodyMeasurements.get",
	);
	const updateOperation = requireOperation(
		operations.bodyMeasurements?.update,
		"bodyMeasurements.update",
	);
	const effect = Effect.fn("cli.measurements.update")(function* () {
		const existing = yield* getOperation.effect({ date }, execution);
		const parsed = existingBodyMeasurementSchema.safeParse(
			existing.bodyMeasurement,
		);
		if (!parsed.success || parsed.data.date !== date) {
			return yield* Effect.fail(
				new ApiResponseError("The API returned an invalid body measurement"),
			);
		}
		const { measurement } = mergeMeasurementPayload(parsed.data, input);
		yield* updateOperation.effect(measurement, execution);
		return measurement;
	});
	return collapse(effect());
}

async function executeMeasurementList({
	args,
	operations,
	execution,
}: CommandContext): Promise<unknown> {
	const { page, pageSize } = parsePagination(
		args,
		getV1BodyMeasurementsQueryParamsSchema,
	);
	const result = await runOperation(
		operations.bodyMeasurements?.list,
		"bodyMeasurements.list",
		{ page, pageSize },
		execution,
	);
	if (result.expected404Outcome === "end_of_list")
		return pageEnvelope(
			{ page: result.page, page_count: result.pageCount ?? 0 },
			"body_measurements",
			result.items,
		);
	if (result.pageCount === undefined)
		throw new ApiResponseError("The API returned invalid pagination metadata");
	return list(
		{
			page: result.page,
			page_count: result.pageCount,
			body_measurements: result.items,
		},
		"body_measurements",
		"body_measurements",
		page,
	);
}

async function executeMeasurementGet({
	args,
	operations,
	execution,
}: CommandContext) {
	const date = parseMeasurementDate(args.positionals[0]);
	const result = await runOperation(
		operations.bodyMeasurements?.get,
		"bodyMeasurements.get",
		{ date },
		execution,
	);
	return { body_measurement: result.bodyMeasurement };
}

async function executeMeasurementCreate({
	args,
	operations,
	readDataSource,
	execution,
}: CommandContext) {
	requireMutationConfirmation(args);
	const input = await loadMutationInput(
		mutationData(args),
		createBodyMeasurementDataSchema,
		readDataSource,
	);
	const date = parseMeasurementDate(args.positionals[0] ?? input.date);
	if (input.date !== date)
		throw new UsageError("Measurement date does not match --data.date");
	const createdDate = await runOperation(
		operations.bodyMeasurements?.create,
		"bodyMeasurements.create",
		input,
		execution,
	);
	return { body_measurement: measurementResult(body(input), createdDate) };
}

async function executeMeasurementUpdate({
	args,
	operations,
	readDataSource,
	execution,
}: CommandContext) {
	requireMutationConfirmation(args);
	const input = await loadMutationInput(
		mutationData(args),
		updateBodyMeasurementDataSchema,
		readDataSource,
	);
	const date = parseMeasurementDate(args.positionals[0] ?? input.date);
	if (input.date !== date)
		throw new UsageError("Measurement date does not match --data.date");
	return {
		body_measurement: await updateMeasurement(
			operations,
			date,
			input,
			execution,
		),
	};
}

export function executeMeasurements(context: CommandContext): CommandResult {
	switch (context.args.subcommand) {
		case "list":
			return executeMeasurementList(context);
		case "get":
			return executeMeasurementGet(context);
		case "create":
			return executeMeasurementCreate(context);
		case "update":
			return executeMeasurementUpdate(context);
		default:
			throw new UsageError("Unknown command; run hevy --help");
	}
}
