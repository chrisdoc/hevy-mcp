import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const handoff = await readFile(
	resolve(
		import.meta.dirname,
		"../docs/cloudflare-worker-version-attribution.md",
	),
	"utf8",
);
const clickstackMetrics = await readFile(
	resolve(import.meta.dirname, "../docs/clickstack-metrics.md"),
	"utf8",
);

type ResourceAttributes = Record<string, string | undefined>;

function simulateDocumentedTransform(
	attributes: ResourceAttributes,
): ResourceAttributes {
	const transformed = { ...attributes };
	const isWorker =
		transformed["cloud.provider"] === "cloudflare" &&
		transformed["service.name"] === "hevy-mcp";
	if (
		isWorker &&
		!transformed["service.version"] &&
		transformed["faas.version"]
	) {
		transformed["service.version"] = transformed["faas.version"];
	}
	if (isWorker) transformed["service.name"] = "hevy-worker";
	return transformed;
}

const transformCases: Array<{
	expected: ResourceAttributes;
	input: ResourceAttributes;
	label: string;
}> = [
	{
		label: "Cloudflare Worker",
		input: {
			"cloud.provider": "cloudflare",
			"service.name": "hevy-mcp",
			"faas.version": "0.0.1",
			"cloudflare.script_version.id": "deployment-uuid",
		},
		expected: {
			"service.name": "hevy-worker",
			"service.version": "0.0.1",
		},
	},
	{
		label: "Node service",
		input: {
			"service.name": "hevy-mcp",
			"service.version": "5.0.5",
		},
		expected: {
			"service.name": "hevy-mcp",
			"service.version": "5.0.5",
		},
	},
	{
		label: "unrelated Cloudflare service",
		input: {
			"cloud.provider": "cloudflare",
			"service.name": "another-worker",
			"faas.version": "1.2.3",
		},
		expected: {
			"service.name": "another-worker",
			"service.version": undefined,
		},
	},
];

describe("Cloudflare collector handoff", () => {
	it("places the Worker-only trace transform after noise filtering", () => {
		const pipeline = handoff.slice(handoff.indexOf("service:\n"));
		expect(pipeline).toMatch(
			/filter\/hevy_mcp_noise[\s\S]*transform\/cloudflare_worker_resource[\s\S]*batch/,
		);
		expect(handoff).toContain(
			'set(resource.attributes["service.version"], resource.attributes["faas.version"]) where resource.attributes["cloud.provider"] == "cloudflare" and resource.attributes["service.name"] == "hevy-mcp"',
		);
		expect(handoff).toContain(
			'set(resource.attributes["service.name"], "hevy-worker") where resource.attributes["cloud.provider"] == "cloudflare" and resource.attributes["service.name"] == "hevy-mcp"',
		);
		expect(handoff).not.toContain("log_statements:");
		expect(handoff).not.toContain("metric_statements:");
	});

	it.each(transformCases)(
		"documents the expected $label transform",
		({ input, expected }) => {
			const transformed = simulateDocumentedTransform(input);

			expect(transformed["service.name"]).toBe(expected["service.name"]);
			expect(transformed["service.version"]).toBe(expected["service.version"]);
			if (input["cloudflare.script_version.id"]) {
				expect(transformed["cloudflare.script_version.id"]).toBe(
					input["cloudflare.script_version.id"],
				);
			}
		},
	);

	it("uses split and combined ClickStack service filters", () => {
		expect(handoff).toContain("ServiceName = 'hevy-worker'");
		expect(handoff).toContain("ServiceName IN ('hevy-mcp', 'hevy-worker')");
		expect(clickstackMetrics).toContain(
			"Cloudflare Worker version attribution",
		);
		expect(clickstackMetrics).not.toContain(
			"ResourceAttributes['service.name'] IN ('hevy-mcp', 'hevy-worker')",
		);
	});
});
