import { execFileSync } from "node:child_process";

export const HISTORICAL_REGISTRY_REVISION =
	"f2e7af0ee3a02b6a0c6fa7820895db3882b7be4c";

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function assertUnique(values, label) {
	const duplicates = values.filter(
		(value, index) => values.indexOf(value) !== index,
	);
	assert(
		duplicates.length === 0,
		`${label} contains duplicates: ${[...new Set(duplicates)].join(", ")}`,
	);
}

function declarationMatches(line, symbol) {
	if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(symbol)) return false;
	const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(
		`(?:^|\\b)(?:export\\s+)?(?:const|let|var|function|class)\\s+${escaped}\\b`,
	).test(line);
}

export function historicalSource(revision, path, cwd = process.cwd()) {
	try {
		return execFileSync("git", ["show", `${revision}:${path}`], {
			cwd,
			encoding: "utf8",
		});
	} catch (error) {
		throw new Error(
			`Historical baseline source ${revision}:${path} is unavailable: ${error.message}`,
		);
	}
}

/**
 * Verify that every retained pre-migration registry fragment points to the
 * exact immutable source line where its legacy registry symbol lived.
 *
 * The source reader is injectable for focused invariant tests; production
 * checks use `git show` through historicalSource above.
 */
export function validateHistoricalRegistryFragments(
	fragments,
	{
		expectedRevision = HISTORICAL_REGISTRY_REVISION,
		sourceReader = historicalSource,
	} = {},
) {
	assert(
		Array.isArray(fragments),
		"Historical registry fragments are required",
	);
	assert(
		/^[0-9a-f]{40}$/.test(expectedRevision),
		"Historical registry evidence needs a full immutable source revision",
	);
	assertUnique(
		fragments.map((fragment) => fragment?.id),
		"Historical registry fragment ids",
	);
	assertUnique(
		fragments.map(
			(fragment) =>
				`${fragment?.sourceRevision}\0${fragment?.path}\0${fragment?.line}\0${fragment?.symbol}`,
		),
		"Historical registry fragment coordinates",
	);
	for (const fragment of fragments) {
		assert(
			fragment &&
				typeof fragment.id === "string" &&
				typeof fragment.path === "string" &&
				typeof fragment.symbol === "string" &&
				Number.isInteger(fragment.line) &&
				fragment.line > 0 &&
				fragment.sourceRevision === expectedRevision,
			`Historical registry fragment ${
				fragment?.id ?? "?"
			} needs an immutable source revision, path, symbol, and line`,
		);
		let source;
		try {
			source = sourceReader(fragment.sourceRevision, fragment.path);
		} catch (error) {
			throw new Error(
				`Historical registry fragment ${fragment.id} source is unavailable: ${error.message}`,
			);
		}
		const lines = String(source).split("\n");
		assert(
			fragment.line <= lines.length &&
				declarationMatches(lines[fragment.line - 1], fragment.symbol),
			`Historical registry fragment ${fragment.id} does not match a declaration of ${fragment.symbol} at ${fragment.sourceRevision}:${fragment.path}:${fragment.line}`,
		);
	}
	return fragments.length;
}
