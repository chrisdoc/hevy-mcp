import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Docker artifacts", () => {
	it("communicates deprecation in Dockerfile", () => {
		const dockerfilePath = path.join(process.cwd(), "Dockerfile");
		const dockerfile = readFileSync(dockerfilePath, "utf-8");
		expect(dockerfile).toContain("Docker support was retired");
		expect(dockerfile).toContain("Install locally instead: npx hevy-mcp");
	});

	it("communicates deprecation in .dockerignore", () => {
		const dockerignorePath = path.join(process.cwd(), ".dockerignore");
		const dockerignore = readFileSync(dockerignorePath, "utf-8");
		expect(dockerignore).toContain("no longer publishes Docker images");
	});
});
