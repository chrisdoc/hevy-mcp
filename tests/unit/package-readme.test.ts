import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const packageRoot = resolve(repositoryRoot, "packages/node");

describe("published Node package documentation", () => {
	it("documents the package identity, CLI, environment, and named API", () => {
		const readme = readFileSync(resolve(packageRoot, "README.md"), "utf8");
		const packageJson = JSON.parse(
			readFileSync(resolve(packageRoot, "package.json"), "utf8"),
		);

		expect(packageJson.name).toBe("hevy-mcp");
		expect(packageJson.bin?.["hevy-mcp"]).toBe("dist/cli.mjs");
		expect(packageJson.scripts?.prepack).toContain("npm run build");
		expect(readme).toContain("npx -y hevy-mcp");
		expect(readme).toContain("HEVY_API_KEY");
		expect(readme).toContain("createNodeMcpServer");
		expect(readme).toContain("runStdioServer");
		expect(readme).not.toMatch(/\b(createServer|runServer|configSchema)\b/);
	});
});
