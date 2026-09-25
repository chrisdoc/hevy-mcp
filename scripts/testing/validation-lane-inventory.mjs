import { isAbsolute, relative, sep } from "node:path";
import { flattenAggregateLanes } from "../control-plane-validation.mjs";

export function parseVitestList(output, rootDirectory, { json = true } = {}) {
	if (!json) {
		return output.split(/\r?\n/).flatMap((line) => {
			const separator = line.indexOf(" > ");
			if (separator < 0) return [];
			const listedFile = line.slice(0, separator);
			const file = isAbsolute(listedFile)
				? relative(rootDirectory, listedFile)
				: listedFile;
			const fullName = line.slice(separator + 3).trim();
			if (file.length === 0 || fullName.length === 0) return [];
			return [{ file: file.split(sep).join("/"), fullName }];
		});
	}
	const entries = JSON.parse(output);
	if (!Array.isArray(entries)) {
		throw new Error("Vitest test listing must be a JSON array");
	}
	return entries.map((entry) => ({
		file: relative(rootDirectory, entry.file).split(sep).join("/"),
		fullName: entry.name,
	}));
}

export function selectVitestCases(selector, cases) {
	const matchesPath = (pattern, file) => {
		if (pattern.endsWith("/**")) return file.startsWith(pattern.slice(0, -2));
		if (pattern.includes("*")) {
			throw new Error(`Unsupported inventory path pattern ${pattern}`);
		}
		return file === pattern;
	};
	return cases.filter((testCase) => {
		const included =
			!selector.include?.length ||
			selector.include.some((pattern) => matchesPath(pattern, testCase.file));
		const excluded =
			selector.exclude?.some((pattern) =>
				matchesPath(pattern, testCase.file),
			) ?? false;
		return included && !excluded;
	});
}

export function aggregateLaneRuns(aggregates, laneId, laneIds) {
	return Object.entries(aggregates).flatMap(([aggregateId, aggregate]) => {
		if (
			!flattenAggregateLanes(aggregates, laneIds, aggregateId).includes(laneId)
		) {
			return [];
		}
		const workflowRuntimes =
			aggregate.workflowRuntimes?.[laneId] ??
			(aggregate.workflowRuntimes && !Array.isArray(aggregate.workflowRuntimes)
				? undefined
				: aggregate.workflowRuntimes);
		return [
			{
				aggregate: aggregateId,
				workflowRuntimes,
				workflowEnvironment: aggregate.workflowEnvironment?.[laneId] ?? {},
			},
		];
	});
}

export function findMissingVitestCases(expected, actual) {
	const availableOccurrences = new Map();
	for (const testCase of actual) {
		const identity = `${testCase.file}\u0000${testCase.fullName}`;
		availableOccurrences.set(
			identity,
			(availableOccurrences.get(identity) ?? 0) + 1,
		);
	}

	const missing = [];
	for (const testCase of expected) {
		const identity = `${testCase.file}\u0000${testCase.fullName}`;
		const remaining = availableOccurrences.get(identity) ?? 0;
		if (remaining === 0) {
			missing.push(testCase);
			continue;
		}
		availableOccurrences.set(identity, remaining - 1);
	}
	return missing;
}

export function summarizeLaneOverlaps(lanes) {
	const casesByIdentity = new Map();
	for (const lane of lanes) {
		if (lane.discovery?.status !== "enumerated") continue;
		for (const testCase of lane.discovery.cases) {
			const identity = `${testCase.file} > ${testCase.fullName}`;
			const matching = casesByIdentity.get(identity) ?? new Map();
			matching.set(lane.id, (matching.get(lane.id) ?? 0) + 1);
			casesByIdentity.set(identity, matching);
		}
	}

	const overlaps = [...casesByIdentity]
		.filter(([, laneOccurrences]) => laneOccurrences.size > 1)
		.map(([identity, laneOccurrences]) => ({
			identity,
			lanes: [...laneOccurrences.keys()].toSorted((left, right) =>
				left.localeCompare(right),
			),
			occurrences: Object.fromEntries(
				[...laneOccurrences].toSorted(([left], [right]) =>
					left.localeCompare(right),
				),
			),
		}));
	const counts = new Map();
	for (const overlap of overlaps) {
		for (let left = 0; left < overlap.lanes.length; left += 1) {
			for (let right = left + 1; right < overlap.lanes.length; right += 1) {
				const key = `${overlap.lanes[left]}\u0000${overlap.lanes[right]}`;
				counts.set(key, (counts.get(key) ?? 0) + 1);
			}
		}
	}

	return {
		cases: overlaps,
		pairs: Array.from(counts, ([key, count]) => {
			const [left, right] = key.split("\u0000");
			return { lanes: [left, right], cases: count };
		}).toSorted(
			(left, right) =>
				right.cases - left.cases ||
				left.lanes.join("/").localeCompare(right.lanes.join("/")),
		),
	};
}
