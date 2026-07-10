import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { registerBodyMeasurementTools } from "./body-measurements.js";
import { registerFolderTools } from "./folders.js";
import { registerRoutineTools } from "./routines.js";
import { registerTemplateTools } from "./templates.js";
import { registerUserTools } from "./user.js";
import { registerWorkoutTools } from "./workouts.js";

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
	"update-routine",
	"update-body-measurement",
] as const;

const DESTRUCTIVE_TOOLS = [] as const;

function registerAllTools() {
	const registerTool = vi.fn();
	const server = { registerTool } as unknown as McpServer;
	registerWorkoutTools(server, null);
	registerRoutineTools(server, null);
	registerTemplateTools(server, null);
	registerFolderTools(server, null);
	registerBodyMeasurementTools(server, null);
	registerUserTools(server, null);
	return registerTool;
}

function getAnnotations(
	toolSpy: ReturnType<typeof vi.fn>,
	name: string,
): ToolAnnotations {
	const match = toolSpy.mock.calls.find(([toolName]) => toolName === name);
	if (!match) {
		throw new Error(`Tool ${name} was not registered`);
	}
	const config = match[1] as { annotations: ToolAnnotations };
	return config.annotations;
}

describe("tool annotations", () => {
	const registerTool = registerAllTools();

	it("registers all known tools", () => {
		const byName = (a: string, b: string) => a.localeCompare(b);
		const registered = (
			registerTool.mock.calls.map(([name]) => name) as string[]
		).sort(byName);
		const expected = [
			...READ_ONLY_TOOLS,
			...CREATE_TOOLS,
			...UPDATE_TOOLS,
			...DESTRUCTIVE_TOOLS,
		].sort(byName);
		expect(registered).toEqual(expected);
	});

	it("every tool has a title and closed-world hint", () => {
		for (const [name] of registerTool.mock.calls) {
			const annotations = getAnnotations(registerTool, name as string);
			expect(annotations.title, `${name} title`).toBeTruthy();
			expect(annotations.openWorldHint, `${name} openWorldHint`).toBe(false);
		}
	});

	it.each(READ_ONLY_TOOLS)("%s is read-only", (name) => {
		const annotations = getAnnotations(registerTool, name);
		expect(annotations.readOnlyHint).toBe(true);
	});

	it.each(CREATE_TOOLS)(
		"%s is a non-destructive, non-idempotent write",
		(name) => {
			const annotations = getAnnotations(registerTool, name);
			expect(annotations.readOnlyHint).toBe(false);
			expect(annotations.destructiveHint).toBe(false);
			expect(annotations.idempotentHint).toBe(false);
		},
	);

	it.each([...UPDATE_TOOLS, ...DESTRUCTIVE_TOOLS])(
		"%s is a destructive, idempotent write",
		(name) => {
			const annotations = getAnnotations(registerTool, name);
			expect(annotations.readOnlyHint).toBe(false);
			expect(annotations.destructiveHint).toBe(true);
			expect(annotations.idempotentHint).toBe(true);
		},
	);
});
