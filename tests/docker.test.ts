import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Docker Configuration", () => {
	it("should have a valid Dockerfile", () => {
		const dockerfilePath = path.join(process.cwd(), "Dockerfile");
		const dockerfile = readFileSync(dockerfilePath, "utf-8");

		// Check that it's a multi-stage build
		expect(dockerfile).toContain("FROM node:24-alpine3.22 AS builder");
		expect(dockerfile).toContain("FROM node:24-alpine3.22 AS production");

		// Check security measures
		expect(dockerfile).toContain("addgroup -g 1001 -S nodejs");
		expect(dockerfile).toContain("USER nodejs");

		// Check proper build steps
		expect(dockerfile).toContain("pnpm install --prod");
		expect(dockerfile).toContain("pnpm run build");
		expect(dockerfile).toContain("COPY --from=builder");
	});

	it("should have a .dockerignore file", () => {
		const dockerignorePath = path.join(process.cwd(), ".dockerignore");
		const dockerignore = readFileSync(dockerignorePath, "utf-8");

		// Check that unnecessary files are excluded
		expect(dockerignore).toContain("node_modules/");
		expect(dockerignore).toContain(".git/");
		expect(dockerignore).toContain("tests/");
		expect(dockerignore).toContain("*.test.ts");
		expect(dockerignore).toContain(".env");
	});
});
