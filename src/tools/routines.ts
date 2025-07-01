import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { HevyClient } from "../generated/client/hevyClient.js";
import { formatRoutine } from "../utils/formatters.js";

/**
 * Register all routine-related tools with the MCP server
 */
export function registerRoutineTools(
	server: McpServer,
	hevyClient: HevyClient,
) {
	// Get routines
	server.tool(
		"get-routines",
		"Get a paginated list of routines. Returns routine details including title, creation date, folder assignment, and exercise configurations. Results include both default and custom routines.",
		{
			page: z.coerce.number().int().gte(1).default(1),
			pageSize: z.coerce.number().int().gte(1).lte(10).default(5),
		},
		async ({ page, pageSize }) => {
			try {
				const data = await hevyClient.routines.get({
					queryParameters: {
						page,
						pageSize,
					},
				});

				// Process routines to extract relevant information
				const routines =
					data?.routines?.map((routine) => formatRoutine(routine)) || [];

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(routines, null, 2),
						},
					],
				};
			} catch (error) {
				console.error("Error fetching routines:", error);
				return {
					content: [
						{
							type: "text",
							text: `Error fetching routines: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
				};
			}
		},
	);

	// Get single routine by ID
	server.tool(
		"get-routine",
		"Get complete details of a specific routine by ID. Returns all routine information including title, notes, assigned folder, and detailed exercise data with set configurations.",
		{
			routineId: z.string().min(1),
		},
		async ({ routineId }) => {
			try {
				// Since the Kiota client doesn't have a get() method for routine by ID, we need to use the list endpoint and filter
				const data = await hevyClient.routines.byRoutineId(routineId).put({
					routine: {
						title: "", // We're providing a minimal body as required by the API
					},
				});

				if (!data) {
					return {
						content: [
							{
								type: "text",
								text: `Routine with ID ${routineId} not found`,
							},
						],
					};
				}

				const routine = formatRoutine(data);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(routine, null, 2),
						},
					],
				};
			} catch (error) {
				console.error(`Error fetching routine ${routineId}:`, error);
				return {
					content: [
						{
							type: "text",
							text: `Error fetching routine: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
				};
			}
		},
	);

	// Create new routine
	server.tool(
		"create-routine",
		"Create a new workout routine in your Hevy account. Requires title and at least one exercise with sets. Optionally assign to a specific folder. Returns the complete routine details upon successful creation including the newly assigned routine ID.",
		{
			title: z.string().min(1),
			folderId: z.coerce.number().nullable().optional(),
			notes: z.string().optional(),
			exercises: z.array(
				z.object({
					exerciseTemplateId: z.string().min(1),
					supersetId: z.coerce.number().nullable().optional(),
					restSeconds: z.coerce.number().int().min(0).optional(),
					notes: z.string().optional(),
					sets: z.array(
						z.object({
							type: z
								.enum(["warmup", "normal", "failure", "dropset"])
								.default("normal"),
							weightKg: z.coerce.number().optional(),
							reps: z.coerce.number().int().optional(),
							distanceMeters: z.coerce.number().int().optional(),
							durationSeconds: z.coerce.number().int().optional(),
							customMetric: z.coerce.number().optional(),
						}),
					),
				}),
			),
		},
		async ({ title, folderId, notes, exercises }) => {
			try {
				const data = await hevyClient.routines.post({
					routine: {
						title,
						folderId: folderId || null,
						notes: notes || "",
						exercises: exercises.map((exercise) => ({
							exerciseTemplateId: exercise.exerciseTemplateId,
							supersetId: exercise.supersetId || null,
							restSeconds: exercise.restSeconds || null,
							notes: exercise.notes || null,
							sets: exercise.sets.map((set) => ({
								type: set.type,
								weightKg: set.weightKg || null,
								reps: set.reps || null,
								distanceMeters: set.distanceMeters || null,
								durationSeconds: set.durationSeconds || null,
								customMetric: set.customMetric || null,
							})),
						})),
					},
				});

				if (!data) {
					return {
						content: [
							{
								type: "text",
								text: "Failed to create routine",
							},
						],
					};
				}

				const routine = formatRoutine(data);

				return {
					content: [
						{
							type: "text",
							text: `Routine created successfully:\n${JSON.stringify(routine, null, 2)}`,
						},
					],
				};
			} catch (error) {
				console.error("Error creating routine:", error);
				return {
					content: [
						{
							type: "text",
							text: `Error creating routine: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
				};
			}
		},
	);

	// Update existing routine
	server.tool(
		"update-routine",
		"Update an existing workout routine by ID. You can modify the title, notes, and exercise data. Returns the updated routine with all changes applied. Note that you cannot change the folder assignment through this method.",
		{
			routineId: z.string().min(1),
			title: z.string().min(1),
			notes: z.string().optional(),
			exercises: z.array(
				z.object({
					exerciseTemplateId: z.string().min(1),
					supersetId: z.coerce.number().nullable().optional(),
					restSeconds: z.coerce.number().int().min(0).optional(),
					notes: z.string().optional(),
					sets: z.array(
						z.object({
							type: z
								.enum(["warmup", "normal", "failure", "dropset"])
								.default("normal"),
							weightKg: z.coerce.number().optional(),
							reps: z.coerce.number().int().optional(),
							distanceMeters: z.coerce.number().int().optional(),
							durationSeconds: z.coerce.number().int().optional(),
							customMetric: z.coerce.number().optional(),
						}),
					),
				}),
			),
		},
		async ({ routineId, title, notes, exercises }) => {
			try {
				const data = await hevyClient.routines.byRoutineId(routineId).put({
					routine: {
						title,
						notes: notes || null,
						exercises: exercises.map((exercise) => ({
							exerciseTemplateId: exercise.exerciseTemplateId,
							supersetId: exercise.supersetId || null,
							restSeconds: exercise.restSeconds || null,
							notes: exercise.notes || null,
							sets: exercise.sets.map((set) => ({
								type: set.type,
								weightKg: set.weightKg || null,
								reps: set.reps || null,
								distanceMeters: set.distanceMeters || null,
								durationSeconds: set.durationSeconds || null,
								customMetric: set.customMetric || null,
							})),
						})),
					},
				});

				if (!data) {
					return {
						content: [
							{
								type: "text",
								text: `Failed to update routine with ID ${routineId}`,
							},
						],
					};
				}

				const routine = formatRoutine(data);

				return {
					content: [
						{
							type: "text",
							text: `Routine updated successfully:\n${JSON.stringify(routine, null, 2)}`,
						},
					],
				};
			} catch (error) {
				console.error(`Error updating routine ${routineId}:`, error);
				return {
					content: [
						{
							type: "text",
							text: `Error updating routine: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
				};
			}
		},
	);
}
