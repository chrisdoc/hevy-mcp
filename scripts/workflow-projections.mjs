import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load as parseYaml } from "js-yaml";

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function normalizeCondition(condition) {
	if (condition === undefined || condition === null) return null;
	return String(condition).replace(/\s+/g, " ").trim();
}

function matrixValues(job) {
	const values = job?.strategy?.matrix?.["node-version"];
	return Array.isArray(values) ? values.map(String) : [];
}

function runtimeForMatrixValue(value) {
	const match = /^([0-9]+)(?:\.x)?$/.exec(value);
	if (!match) throw new Error(`Unsupported Node matrix value ${value}`);
	return `node-${match[1]}`;
}

function runtimeForVersionSpec(value, source) {
	const normalized = String(value).trim().replace(/^v/, "");
	const match = /^(\d+)(?:\.\d+){0,2}(?:\.x)?$/.exec(normalized);
	if (!match)
		throw new Error(`Unsupported Node version ${normalized} in ${source}`);
	return `node-${match[1]}`;
}

function setupNodeRuntimeByMatrix(step, rootDir, versions) {
	assert(
		normalizeCondition(step.if) === null,
		"actions/setup-node must be unconditional before validation lanes",
	);
	const options = step.with;
	if (!options || typeof options !== "object")
		throw new Error("actions/setup-node must declare with.node-version");
	const nodeVersion = options["node-version"];
	const nodeVersionFile = options["node-version-file"];
	assert(
		!(nodeVersion !== undefined && nodeVersionFile !== undefined),
		"actions/setup-node must not declare both node-version and node-version-file",
	);
	let configuration;
	if (typeof nodeVersion === "string" || typeof nodeVersion === "number") {
		const value = String(nodeVersion).trim();
		if (value.includes("matrix.node-version")) {
			assert(
				versions.length > 0,
				"actions/setup-node matrix node-version requires a job matrix",
			);
			configuration = { kind: "matrix" };
		} else {
			configuration = {
				kind: "fixed",
				runtime: runtimeForVersionSpec(value, "setup-node node-version"),
			};
		}
	}
	if (typeof nodeVersionFile === "string") {
		const path = resolve(rootDir, nodeVersionFile);
		let version;
		try {
			version = readFileSync(path, "utf8")
				.split(/\r?\n/)
				.map((line) => line.trim())
				.find(Boolean);
		} catch (error) {
			throw new Error(
				`actions/setup-node node-version-file ${nodeVersionFile} is unavailable: ${error.message}`,
			);
		}
		if (!version)
			throw new Error(
				`actions/setup-node node-version-file ${nodeVersionFile} is empty`,
			);
		configuration = {
			kind: "fixed",
			runtime: runtimeForVersionSpec(
				version,
				`setup-node node-version-file ${nodeVersionFile}`,
			),
		};
	}
	assert(
		configuration,
		"actions/setup-node must declare node-version or node-version-file",
	);
	if (configuration.kind === "matrix")
		return new Map(
			versions.map((value) => [value, runtimeForMatrixValue(value)]),
		);
	if (versions.length === 0)
		return new Map([[undefined, configuration.runtime]]);
	return new Map(versions.map((value) => [value, configuration.runtime]));
}

function matrixValuesForCondition(condition, versions) {
	if (versions.length === 0) {
		assert(
			!condition?.includes("matrix.node-version"),
			`Workflow condition references a Node matrix for a non-matrix job: ${condition}`,
		);
		return [undefined];
	}
	if (!condition || !condition.includes("matrix.node-version")) return versions;
	if (/matrix\.node-version\s*!==?/.test(condition))
		throw new Error(
			`Workflow condition must use exact Node equality: ${condition}`,
		);
	const matches = [
		...condition.matchAll(/matrix\.node-version\s*==\s*['"]([^'"]+)['"]/g),
	];
	assert(
		matches.length === 1,
		`Workflow condition must select exactly one Node matrix value: ${condition}`,
	);
	const value = matches[0][1];
	assert(
		versions.includes(value),
		`Workflow condition selects an unknown Node matrix value ${value}`,
	);
	return [value];
}

function effectiveCondition(jobCondition, stepCondition) {
	if (jobCondition && stepCondition)
		return `${jobCondition} && (${stepCondition})`;
	return jobCondition ?? stepCondition;
}

function walkJobSteps(value, visit) {
	if (Array.isArray(value)) {
		for (const item of value) walkJobSteps(item, visit);
		return;
	}
	if (!value || typeof value !== "object") return;
	if (typeof value.run === "string" || typeof value.uses === "string") {
		visit(value);
		return;
	}
	for (const child of Object.values(value)) walkJobSteps(child, visit);
}

function validationLaneId(line) {
	return /^\s*npm\s+run\s+validate:lane\s+--\s+([a-z0-9-]+)(?:\s|$)/.exec(
		line,
	)?.[1];
}

export function parseWorkflowLaneExecutions(
	source,
	{ rootDir = process.cwd() } = {},
) {
	const workflow = parseYaml(source);
	const executions = [];
	for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
		let containsValidationLane = false;
		walkJobSteps(job.steps ?? [], (step) => {
			if (typeof step.run !== "string") return;
			if (step.run.split(/\r?\n/).some((line) => validationLaneId(line)))
				containsValidationLane = true;
		});
		if (!containsValidationLane) continue;
		const versions = matrixValues(job);
		const jobCondition = normalizeCondition(job.if);
		let runtimeByMatrixValue;
		let setupNodeSeen = false;
		walkJobSteps(job.steps ?? [], (step) => {
			if (
				typeof step.uses === "string" &&
				step.uses.startsWith("actions/setup-node@")
			) {
				assert(
					!setupNodeSeen,
					`Workflow job ${jobId} has multiple setup-node steps`,
				);
				assert(
					!runtimeByMatrixValue,
					`Workflow job ${jobId} setup-node must precede all validation lanes`,
				);
				runtimeByMatrixValue = setupNodeRuntimeByMatrix(
					step,
					rootDir,
					versions,
				);
				setupNodeSeen = true;
				return;
			}
			if (typeof step.run !== "string") return;
			const rawStepCondition = step.if ?? null;
			const stepCondition = normalizeCondition(rawStepCondition);
			const selectedByJob = matrixValuesForCondition(jobCondition, versions);
			const selectedByStep = matrixValuesForCondition(stepCondition, versions);
			const selectedValues = versions.length
				? versions.filter(
						(value) =>
							selectedByJob.includes(value) && selectedByStep.includes(value),
					)
				: [undefined];
			for (const line of step.run.split(/\r?\n/)) {
				const lane = validationLaneId(line);
				if (!lane) continue;
				assert(
					runtimeByMatrixValue,
					`Workflow lane ${lane} must follow an unconditional setup-node step in job ${jobId}`,
				);
				const runtimes = [
					...new Set(
						selectedValues.map((value) => runtimeByMatrixValue.get(value)),
					),
				];
				assert(
					runtimes.length > 0,
					`Workflow lane ${lane} has no runtime projection`,
				);
				executions.push({
					lane,
					job: jobId,
					runtimes,
					condition: effectiveCondition(jobCondition, stepCondition),
					jobCondition,
					stepCondition,
				});
			}
		});
	}
	return executions;
}

export function assertWorkflowProjection(actual, expected, label) {
	const actualJson = JSON.stringify(actual);
	const expectedJson = JSON.stringify(expected);
	assert(
		actualJson === expectedJson,
		`${label} drifted: expected ${expectedJson}, found ${actualJson}`,
	);
}
