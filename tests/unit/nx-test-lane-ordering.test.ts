import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const nxProjectSchema = z.object({
	targets: z.record(
		z.string(),
		z.object({
			dependsOn: z.array(z.string()).optional(),
			parallelism: z.boolean().optional(),
		}),
	),
});

describe("PR test lane ordering", () => {
	it("builds the Node artifact before mocked tests consume it", () => {
		const projectFile = resolve(
			dirname(fileURLToPath(import.meta.url)),
			"../../project.json",
		);
		const project = nxProjectSchema.parse(
			JSON.parse(readFileSync(projectFile, "utf8")),
		);

		expect(project.targets["test:mcp"]?.dependsOn).toContain("build");
		// Spawning test workers must not contend with build/Worker startup.
		expect(project.targets["test:unit"]?.parallelism).toBe(false);
		expect(project.targets["test:worker"]?.parallelism).toBe(false);
		expect(project.targets["test:worker-http"]?.parallelism).toBe(false);
	});
});
