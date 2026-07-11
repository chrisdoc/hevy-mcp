import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const buildWorkflow = readFileSync(
	new URL("../../.github/workflows/build-and-test.yml", import.meta.url),
	"utf8",
);

const githubActionsSecretExpression =
	/\$\{\{\s*secrets\s*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]\r\n]+\])/;

describe("deterministic build workflow credential isolation", () => {
	it("does not reference the GitHub Actions secrets context", () => {
		expect(buildWorkflow).not.toMatch(githubActionsSecretExpression);
	});

	it.each([
		["dot syntax", "${{ secrets.NEW_SECRET }}"],
		["bracket syntax", "${{ secrets['NEW_SECRET'] }}"],
	])("detects secret context access using %s", (_syntax, expression) => {
		expect(expression).toMatch(githubActionsSecretExpression);
	});

	it.each([
		"HEVY_API_KEY",
		"SENTRY_AUTH_TOKEN",
		"SENTRY_ORG",
		"SENTRY_PROJECT",
		"OTEL_COLLECTOR_TOKEN",
		"CODECOV_TOKEN",
	])("does not reference %s", (credentialName) => {
		expect(buildWorkflow).not.toContain(credentialName);
	});
});
