function globToRegExp(pattern) {
	let expression = pattern
		.replaceAll("\\", "/")
		.replaceAll("**/", "\u0001")
		.replaceAll("/**", "\u0002")
		.replaceAll("**", "\u0003");
	const regexCharacters = new Set([
		".",
		"+",
		"?",
		"^",
		"$",
		"(",
		")",
		"[",
		"]",
		"{",
		"}",
		"|",
	]);
	expression = [...expression]
		.map((character) =>
			regexCharacters.has(character) ? `\\${character}` : character,
		)
		.join("");
	expression = expression
		.replaceAll("*", "[^/]*")
		.replaceAll("\u0001", "(?:.*/)?")
		.replaceAll("\u0002", "(?:/.*)?")
		.replaceAll("\u0003", ".*");
	return new RegExp(`^${expression}$`);
}

export function normalizeChangedFiles(changes) {
	const files = new Set();
	for (const change of changes ?? []) {
		if (typeof change === "string") {
			files.add(change);
			continue;
		}
		if (!change || typeof change !== "object") continue;
		for (const path of [
			change.path,
			change.oldPath,
			change.newPath,
			change.filename,
			change.previous_filename,
		])
			if (typeof path === "string" && path.length > 0)
				files.add(path.replaceAll("\\", "/"));
	}
	return [...files];
}

export function resolveImpactedLanes(lanes, changes) {
	const files = normalizeChangedFiles(changes);
	const routes = (lanes.changeImpactRouting ?? []).map((route) => ({
		...route,
		matcher: globToRegExp(route.pattern),
	}));
	const impacted = new Set();
	for (const file of files) {
		for (const route of routes) {
			if (!route.matcher.test(file)) continue;
			for (const lane of route.lanes) impacted.add(lane);
		}
	}
	return [...impacted];
}
