const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const stringSchema = z.string();

/** Return the emitted dist output for manifests that publish a dist subtree. */
function buildOutputs(packageJson) {
	const files = Array.isArray(packageJson.files) ? packageJson.files : [];
	const publishesDist = files.some((entry) => {
		if (!stringSchema.safeParse(entry).success) return false;
		const normalized = entry.replace(/^\.\//, "");
		return normalized === "dist" || normalized.startsWith("dist/");
	});
	return publishesDist ? ["{projectRoot}/dist"] : [];
}

/** Keep package build inputs and cache policy explicit in the Nx graph. */
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
								targets: { build: buildTarget(packageJson) },
							},
						},
					},
				];
			}),
	],
};
