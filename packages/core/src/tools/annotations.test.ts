import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
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
	"update-routine",
	"update-body-measurement",
] as const;

const DESTRUCTIVE_TOOLS = [] as const;

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

	it("every tool has concise selection guidance", () => {
		for (const name of [...READ_ONLY_TOOLS, ...CREATE_TOOLS, ...UPDATE_TOOLS]) {
			const description = getDescription(spies, name);
			const words = description.trim().split(/\s+/);

			expect(description, `${name} aliases`).toMatch(/Aliases: [^<]+, [^<]+\./);
			expect(description, `${name} use case`).toMatch(
				/<use_case>.+<\/use_case>/,
			);
			expect(description, `${name} important notes`).toMatch(
				/<important_notes>.+<\/important_notes>/,
			);
			expect(words.length, `${name} word budget`).toBeLessThanOrEqual(120);
		}
	});

	it.each(READ_ONLY_TOOLS)("%s description says it is read-only", (name) => {
		expect(getDescription(spies, name)).toMatch(/^Read-only(?:\.| for)/);
	});

	it.each(CREATE_TOOLS)("%s description says it writes", (name) => {
		expect(getDescription(spies, name)).toMatch(/^Writes to the Hevy account/);
	});

	it.each(UPDATE_TOOLS)("%s description says it mutates", (name) => {
		expect(getDescription(spies, name)).toMatch(/^Mutates the Hevy account/);
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
