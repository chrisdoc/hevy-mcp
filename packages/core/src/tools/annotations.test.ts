import type { McpServer, ToolAnnotations } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";
import type { ExerciseTemplateCatalog } from "../utils/exercise-template-catalog.js";
import { createToolRuntime } from "./tool-runtime.js";
import { registerHevyTools } from "./register.js";

const READ_ONLY_TOOLS = [
	"get-workouts",
	"get-workout",
	"get-workout-count",
	"get-workout-events",
	"get-routines",
	"get-routine",
	"get-exercise-templates",
	"get-exercise-template",
	"get-exercise-history",
	"search-exercise-templates",
	"get-routine-folders",
	"get-routine-folder",
	"get-body-measurements",
	"get-body-measurement",
	"get-user-info",
	"get-training-summary",
	"search-routines",
] as const;

const CREATE_TOOLS = [
	"create-workout",
	"create-routine",
	"create-exercise-template",
	"create-routine-folder",
	"create-body-measurement",
] as const;

const UPDATE_TOOLS = [
	"update-workout",
	"replace-workout-exercises",
	"update-routine",
	"update-body-measurement",
] as const;

const DESTRUCTIVE_TOOLS = [] as const;
const EXPECTED_DESCRIPTIONS = {
	"get-workouts":
		"Read-only. Lists compact workout summaries newest first. Use get-workout for exercises and sets; results are paginated.",
	"get-workout":
		"Read-only. Gets one workout with exercises and sets by workout_id. Use get-workouts to discover IDs.",
	"get-workout-count":
		"Read-only. Returns the total workout count; it does not return records or accept date filters.",
	"get-workout-events":
		"Read-only. Lists workout update and deletion events since a timestamp for incremental sync; results are paginated.",
	"create-workout":
		"Writes a completed workout. Requires exercise-template IDs and UTC times. Retries can create duplicates.",
	"update-workout":
		"Mutates workout metadata by ID. Omitted fields and all exercises remain unchanged.",
	"replace-workout-exercises":
		"Mutates a workout by replacing all exercises and sets. Workout metadata remains unchanged.",
	"get-routines":
		"Read-only. Lists compact routine summaries. Use get-routine for exercises and sets; results are paginated.",
	"get-routine":
		"Read-only. Gets one routine with exercises and sets by routine_id. Use search-routines to discover IDs.",
	"create-routine":
		"Writes a reusable routine; use create-workout for completed sessions. Retries can create duplicates.",
	"update-routine":
		"Mutates a routine by replacing its title and exercises. Omitted exercises are removed.",
	"get-exercise-templates":
		"Read-only. Pages through exercise templates. Use search-exercise-templates when a title is known.",
	"get-exercise-template":
		"Read-only. Gets one exercise template by exercise_template_id. Use search-exercise-templates to discover IDs.",
	"get-exercise-history":
		"Read-only. Returns performed sets for one exercise-template ID, optionally bounded by ISO 8601 timestamps.",
	"create-exercise-template":
		"Writes a custom exercise template. Search first; retries or reused titles can create duplicates.",
	"search-exercise-templates":
		"Read-only. Searches template titles case-insensitively and returns IDs. refresh reloads the five-minute catalog cache.",
	"get-routine-folders":
		"Read-only. Lists routine folders and IDs; results are paginated.",
	"get-routine-folder":
		"Read-only. Gets one routine folder by folder_id. Use get-routine-folders to discover IDs.",
	"create-routine-folder":
		"Writes a routine folder. Retries or reused titles can create duplicates.",
	"get-body-measurements":
		"Read-only. Lists dated body measurements; results are paginated. Use get-body-measurement for one date.",
	"get-body-measurement":
		"Read-only. Gets the body measurement for one YYYY-MM-DD date. Use get-body-measurements to browse dates.",
	"create-body-measurement":
		"Writes a body measurement for a new YYYY-MM-DD date. Existing dates conflict; retries are not idempotent.",
	"update-body-measurement":
		"Mutates numeric fields on an existing YYYY-MM-DD measurement. Omitted fields remain unchanged; values cannot be cleared.",
	"get-user-info":
		"Read-only. Returns the authenticated Hevy user ID, display name, and public profile URL.",
	"get-training-summary":
		"Read-only. Summarizes workouts and body-measurement trends for the last 1–12 weeks, including compact session and scan evidence.",
	"search-routines":
		"Read-only. Searches routine titles and returns compact IDs and counts. Use get-routine for full exercises and sets.",
} as const;

function registerAllTools() {
	const tool = vi.fn();
	const registerTool = vi.fn();
	const server = { tool, registerTool } as unknown as McpServer;
	const runtime = createToolRuntime({
		client: null,
		catalog: {} as ExerciseTemplateCatalog,
	});
	registerHevyTools(server, runtime);
	return { tool, registerTool };
}

function getAnnotations(
	spies: ReturnType<typeof registerAllTools>,
	name: string,
): ToolAnnotations {
	const registered = spies.registerTool.mock.calls.find(
		([toolName]) => toolName === name,
	);
	if (registered) {
		return (registered[1] as { annotations: ToolAnnotations }).annotations;
	}
	const match = spies.tool.mock.calls.find(([toolName]) => toolName === name);
	if (!match) {
		throw new Error(`Tool ${name} was not registered`);
	}
	// server.tool(name, description, schema, annotations, handler)
	return match[3] as ToolAnnotations;
}

function getDescription(
	spies: ReturnType<typeof registerAllTools>,
	name: string,
): string {
	const registered = spies.registerTool.mock.calls.find(
		([toolName]) => toolName === name,
	);
	if (registered) {
		return (registered[1] as { description: string }).description;
	}
	const match = spies.tool.mock.calls.find(([toolName]) => toolName === name);
	if (!match) {
		throw new Error(`Tool ${name} was not registered`);
	}
	// server.tool(name, description, schema, annotations, handler)
	return match[1] as string;
}

describe("tool annotations", () => {
	const spies = registerAllTools();

	it("registers all known tools", () => {
		const byName = (a: string, b: string) => a.localeCompare(b);
		const registered = [
			...spies.tool.mock.calls.map(([name]) => name as string),
			...spies.registerTool.mock.calls.map(([name]) => name as string),
		].sort(byName);
		const expected = [
			...READ_ONLY_TOOLS,
			...CREATE_TOOLS,
			...UPDATE_TOOLS,
			...DESTRUCTIVE_TOOLS,
		].sort(byName);
		expect(registered).toEqual(expected);
	});

	it("every tool has a title and closed-world hint", () => {
		for (const name of [...READ_ONLY_TOOLS, ...CREATE_TOOLS, ...UPDATE_TOOLS]) {
			const annotations = getAnnotations(spies, name);
			expect(annotations.title, `${name} title`).toBeTruthy();
			expect(annotations.openWorldHint, `${name} openWorldHint`).toBe(false);
		}
	});

	it("uses the exact compact descriptions", () => {
		const names = [...READ_ONLY_TOOLS, ...CREATE_TOOLS, ...UPDATE_TOOLS];
		const actual = Object.fromEntries(
			names.map((name) => [name, getDescription(spies, name)]),
		);

		expect(actual).toEqual(EXPECTED_DESCRIPTIONS);
		for (const name of names) {
			const description = getDescription(spies, name);
			expect(description, `${name} description`).not.toBe("");
			expect(description, `${name} safety prefix`).toMatch(
				/^(?:Read-only(?:\.| for)|Writes |Mutates )/,
			);
			expect(description, `${name} no verbose tags`).not.toMatch(
				/<(?:use_case|important_notes)>|Aliases:/,
			);
		}
	});

	it.each(READ_ONLY_TOOLS)("%s description says it is read-only", (name) => {
		expect(getDescription(spies, name)).toMatch(/^Read-only(?:\.| for)/);
	});

	it.each(CREATE_TOOLS)("%s description says it writes", (name) => {
		expect(getDescription(spies, name)).toMatch(/^Writes /);
	});

	it.each(UPDATE_TOOLS)("%s description says it mutates", (name) => {
		expect(getDescription(spies, name)).toMatch(/^Mutates /);
	});

	it.each(READ_ONLY_TOOLS)("%s is read-only", (name) => {
		const annotations = getAnnotations(spies, name);
		expect(annotations.readOnlyHint).toBe(true);
	});

	it.each(READ_ONLY_TOOLS)(
		"%s uses registerTool with an output schema",
		(name) => {
			const match = spies.registerTool.mock.calls.find(
				([toolName]) => toolName === name,
			);
			expect(match, `${name} registerTool call`).toBeTruthy();
			const config = match?.[1] as { outputSchema?: unknown } | undefined;
			expect(config?.outputSchema, `${name} outputSchema`).toBeTruthy();
		},
	);

	it.each(CREATE_TOOLS)(
		"%s is a non-destructive, non-idempotent write",
		(name) => {
			const annotations = getAnnotations(spies, name);
			expect(annotations.readOnlyHint).toBe(false);
			expect(annotations.destructiveHint).toBe(false);
			expect(annotations.idempotentHint).toBe(false);
		},
	);

	it.each([...UPDATE_TOOLS, ...DESTRUCTIVE_TOOLS])(
		"%s is a destructive, idempotent write",
		(name) => {
			const annotations = getAnnotations(spies, name);
			expect(annotations.readOnlyHint).toBe(false);
			expect(annotations.destructiveHint).toBe(true);
			expect(annotations.idempotentHint).toBe(true);
		},
	);
});
