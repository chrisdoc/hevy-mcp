const fs = require("node:fs");
const path = require("node:path");

function runtimeTag(packageJson) {
	if (packageJson.dependencies?.["@cloudflare/workers-oauth-provider"])
		return "runtime:workerd";
	if (
		packageJson.dependencies?.["@modelcontextprotocol/node"] ||
		packageJson.dependencies?.["@sentry/node"] ||
		packageJson.dependencies?.["@opentelemetry/sdk-trace-node"] ||
		packageJson.engines?.node ||
		packageJson.bin
	)
		return "runtime:node";
	return "runtime:neutral";
}

function roleTag(packageJson, runtime) {
	if (packageJson.mcpName) return "role:server";
	if (packageJson.bin) return "role:cli";
	if (runtime === "runtime:workerd") return "role:adapter";
	if (packageJson.dependencies?.["@hevy-mcp/hevy-client"])
		return "role:runtime";
	return "role:client";
}

function projectTags(packageJson) {
	const runtime = runtimeTag(packageJson);
	return [
		runtime,
		`publishability:${packageJson.private === true ? "private" : "public"}`,
		roleTag(packageJson, runtime),
	];
}

module.exports = {
	name: "hevy-mcp-project-metadata",
	runtimeTag,
	roleTag,
	projectTags,
	createNodes: [
		"packages/*/package.json",
		(configFiles, _options, context) =>
			configFiles.map((configFile) => {
				const packageJson = JSON.parse(
					fs.readFileSync(path.join(context.workspaceRoot, configFile), "utf8"),
				);
				return [
					configFile,
					{
						projects: {
							[path.posix.dirname(configFile)]: {
								tags: projectTags(packageJson),
							},
						},
					},
				];
			}),
	],
};
