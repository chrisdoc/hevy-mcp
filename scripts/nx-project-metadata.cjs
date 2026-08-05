const fs = require("node:fs");
const path = require("node:path");

/** Derive the runtime family from manifest dependencies and runtime metadata. */
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

/** Derive the package role after the runtime family has been classified. */
function roleTag(packageJson, runtime) {
	if (packageJson.mcpName) return "role:server";
	if (packageJson.bin) return "role:cli";
	if (runtime === "runtime:workerd") return "role:adapter";
	if (packageJson.dependencies?.["@hevy-mcp/hevy-client"])
		return "role:runtime";
	return "role:client";
}

/** Return the stable Nx tags projected from one workspace manifest. */
function projectTags(packageJson) {
	const runtime = runtimeTag(packageJson);
	return [
		runtime,
		`publishability:${packageJson.private === true ? "private" : "public"}`,
		roleTag(packageJson, runtime),
	];
}

/** Return the emitted dist output for manifests that publish a dist subtree. */
function buildOutputs(packageJson) {
	const files = Array.isArray(packageJson.files) ? packageJson.files : [];
	const publishesDist = files.some((entry) => {
		if (typeof entry !== "string") return false;
		const normalized = entry.replace(/^\.\//, "");
		return normalized === "dist" || normalized.startsWith("dist/");
	});
	return publishesDist ? ["{projectRoot}/dist"] : [];
}

/**
 * Keep package build targets explicit so Nx never falls back to its broad
 * implicit project-root glob. The Node bundle embeds environment-
 * dependent telemetry configuration and therefore must not be cached.
 */
function buildTarget(packageJson) {
	const name = packageJson.name;
	if (name === "hevy-mcp") {
		return {
			cache: false,
			inputs: ["nodeBuildInputs"],
			outputs: buildOutputs(packageJson),
		};
	}
	if (name === "@chrisdoc/hevy-cli") {
		return {
			cache: true,
			inputs: ["cliBuildInputs"],
			outputs: buildOutputs(packageJson),
		};
	}
	return {
		cache: true,
		inputs: ["packageBuildInputs"],
		outputs: buildOutputs(packageJson),
	};
}

module.exports = {
	name: "hevy-mcp-project-metadata",
	runtimeTag,
	roleTag,
	projectTags,
	buildOutputs,
	buildTarget,
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
								targets: {
									build: buildTarget(packageJson),
								},
							},
						},
					},
				];
			}),
	],
};
