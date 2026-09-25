const vitestSelectorKinds = new Set(["vitest", "vitest-worker-config"]);
const packageManagers = new Set(["npm", "pnpm", "yarn"]);

export function isVitestSelector(selector) {
	return (
		selector !== null &&
		typeof selector === "object" &&
		vitestSelectorKinds.has(selector.kind)
	);
}

export function buildVitestArgs(selector) {
	if (!isVitestSelector(selector)) {
		throw new Error("Unsupported Vitest lane selector");
	}

	const args = ["run"];
	if (
		selector.kind === "vitest-worker-config" ||
		selector.config !== undefined
	) {
		if (typeof selector.config !== "string" || selector.config.length === 0) {
			throw new Error("Vitest config selector needs a config path");
		}
		args.push("--config", selector.config);
	}
	for (const path of selector.include ?? []) {
		args.push(path.endsWith("/**") ? path.slice(0, -2) : path);
	}
	for (const path of selector.exclude ?? []) args.push("--exclude", path);

	return args;
}

function commandInvokesLane(command, laneId) {
	if (typeof command !== "string") return false;
	const tokens = command
		.trim()
		.split(/\s+/)
		.map((token) =>
			token
				.replace(/^["']|["']$/g, "")
				.replaceAll("\\", "/")
				.replace(/^\.\//, ""),
		);
	const runnerIndex = tokens.findIndex((token) =>
		token.endsWith("scripts/testing/run-vitest-lane.mjs"),
	);
	return runnerIndex >= 0 && tokens[runnerIndex + 1] === laneId;
}

export function hasVitestLaneRunner(lane, commands) {
	return (
		isVitestSelector(lane?.selector) &&
		Array.isArray(commands) &&
		commands.length > 0 &&
		commands.every((command) => commandInvokesLane(command, lane.id))
	);
}

export function hasValidVitestLaneAlias(lane, command) {
	return (
		hasVitestLaneRunner(lane, [command]) ||
		commandInvokesNxTarget(command, lane.nxTarget)
	);
}

export function hasValidVitestLaneNxCommands(lane, commands, aliasUsesLane) {
	return (
		Array.isArray(commands) &&
		commands.length > 0 &&
		commands.every(
			(command) =>
				hasVitestLaneRunner(lane, [command]) ||
				(aliasUsesLane && commandInvokesPackageScript(command, lane.alias)),
		)
	);
}

export function commandInvokesPackageScript(command, scriptName) {
	if (typeof command !== "string") return false;
	const tokens = command.trim().split(/\s+/);
	for (let index = 0; index < tokens.length; index += 1) {
		const packageManager = tokens[index];
		if (!packageManagers.has(packageManager)) continue;
		const nextToken = tokens[index + 1];
		if (nextToken === "run" && tokens[index + 2] === scriptName) return true;
		if (packageManager !== "npm" && nextToken === scriptName) {
			return true;
		}
	}
	return false;
}

export function commandInvokesNxTarget(command, targetName) {
	if (typeof command !== "string") return false;
	const tokens = command.trim().split(/\s+/);
	for (let index = 0; index < tokens.length - 2; index += 1) {
		if (
			tokens[index] === "nx" &&
			tokens[index + 1] === "run" &&
			(tokens[index + 2] === targetName ||
				tokens[index + 2] === `repository:${targetName}`)
		) {
			return true;
		}
	}
	return false;
}
