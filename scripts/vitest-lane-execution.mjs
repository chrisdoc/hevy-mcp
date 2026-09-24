const vitestSelectorKinds = new Set(["vitest", "vitest-worker-config"]);

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
		args.push(path.endsWith("/**") ? path.slice(0, -3) : path);
	}
	for (const path of selector.exclude ?? []) args.push("--exclude", path);

	return args;
}

function commandInvokesLane(command, laneId) {
	if (typeof command !== "string") return false;
	const tokens = command.trim().split(/\s+/);
	const runnerIndex = tokens.indexOf("scripts/run-vitest-lane.mjs");
	return runnerIndex >= 0 && tokens[runnerIndex + 1] === laneId;
}

export function hasVitestLaneRunner(lane, commands) {
	return (
		isVitestSelector(lane?.selector) &&
		Array.isArray(commands) &&
		commands.some((command) => commandInvokesLane(command, lane.id))
	);
}
