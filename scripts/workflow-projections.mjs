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
	assert(
		options && typeof options === "object",
		"actions/setup-node must declare with.node-version or node-version-file",
	);
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
		assert(
			version,
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

function walkJobSteps(value, visit, path = []) {
	if (Array.isArray(value)) {
		for (const [index, item] of value.entries())
			walkJobSteps(item, visit, [...path, index]);
		return;
	}
	if (!value || typeof value !== "object") return;
	if (typeof value.run === "string" || typeof value.uses === "string") {
		visit(value, path);
		return;
	}
	for (const [key, child] of Object.entries(value))
		walkJobSteps(child, visit, [...path, key]);
}

function optionValue(tokens, longName, shortName) {
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token.startsWith(`${longName}=`))
			return token.slice(longName.length + 1);
		if (token === longName || token === shortName)
			return tokens[index + 1] ?? "";
	}
	return null;
}

function parseNxRunCommands(line) {
	const normalized = line.trim().replace(/\s+/g, " ");
	const direct =
		/^npx nx run repository:([A-Za-z0-9][A-Za-z0-9:_-]*)(?: (.*?))?$/.exec(
			normalized,
		);
	if (direct) {
		const args = direct[2] ?? "";
		return [
			{
				target: direct[1],
				args,
				command: `npx nx run repository:${direct[1]}${args ? ` ${args}` : ""}`,
			},
		];
	}

	const aggregate = /^npx nx run-many(?: (.*?))?$/.exec(normalized);
	if (!aggregate) return [];
	const args = aggregate[1] ?? "";
	const tokens = args ? args.split(" ") : [];
	const targetList = optionValue(tokens, "--targets", "-t");
	if (targetList === null) return [];
	const projectList = optionValue(tokens, "--projects", "-p");
	assert(
		projectList === "repository",
		"Nx run-many must target only the repository project for workflow projection",
	);
	const targets = targetList.split(",").filter(Boolean);
	assert(targets.length > 0, "Nx run-many must declare at least one target");
	assert(
		new Set(targets).size === targets.length,
		"Nx run-many must not repeat targets",
	);
	return targets.map((target) => ({
		target,
		args,
		command: `npx nx run-many ${args}`,
	}));
}

function normalizeLaneTargets(laneTargets) {
	if (!laneTargets) return new Map();
	if (laneTargets instanceof Map) return new Map(laneTargets);
	const entries = Object.entries(laneTargets);
	return new Map(entries);
}

/**
 * Build the only target-to-lane mapping that workflow projection may use.
 * External and unresolved lanes are deliberately excluded and cannot invent
 * an Nx target.
 */
export function mappedLaneTargets(lanes) {
	assert(lanes && Array.isArray(lanes.lanes), "validation lanes are required");
	const targets = new Map();
	for (const lane of lanes.lanes) {
		assert(
			typeof lane.id === "string" && lane.id.length > 0,
			"validation lane id is required",
		);
		if (lane.mappingStatus === "mapped") {
			assert(
				typeof lane.nxTarget === "string" && lane.nxTarget.length > 0,
				`${lane.id} mapped lane requires nxTarget`,
			);
			assert(
				!targets.has(lane.nxTarget),
				`Nx target ${lane.nxTarget} is mapped more than once`,
			);
			targets.set(lane.nxTarget, lane.id);
			continue;
		}
		assert(
			lane.nxTarget === null,
			`${lane.id} ${lane.mappingStatus ?? "unknown"} lane must not invent an Nx target`,
		);
		assert(
			lane.mappingStatus === "external" || lane.mappingStatus === "unresolved",
			`${lane.id} has unknown mapping status ${lane.mappingStatus}`,
		);
	}
	return targets;
}

/**
 * Parse mapped `nx run` and repository-scoped `nx run-many` executions from a
 * workflow.
 * The returned entries retain the historical projection shape by default;
 * `includeCommands` adds the exact command identity for strict validation.
 */
export function parseWorkflowLaneExecutions(
	source,
	{
		rootDir = process.cwd(),
		laneTargets,
		includeCommands = false,
		jobIds,
		rejectContinueOnError = false,
	} = {},
) {
	const workflow = parseYaml(source);
	assert(
		workflow && typeof workflow === "object",
		"workflow must contain a YAML object",
	);
	const mappedTargets = normalizeLaneTargets(laneTargets);
	const selectedJobs = jobIds === undefined ? null : new Set(jobIds);
	if (selectedJobs) {
		assert(
			selectedJobs.size > 0 &&
				[...selectedJobs].every((id) => typeof id === "string"),
			"workflow jobIds must be a non-empty string array",
		);
	}
	const executions = [];
	for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
		if (selectedJobs && !selectedJobs.has(jobId)) continue;
		const versions = matrixValues(job);
		const jobCondition = normalizeCondition(job.if);
		const steps = job.steps ?? [];
		let hasMappedCommand = false;
		walkJobSteps(steps, (step) => {
			if (typeof step.run !== "string") return;
			for (const line of step.run.split(/\r?\n/)) {
				for (const command of parseNxRunCommands(line)) {
					if (mappedTargets.has(command.target)) hasMappedCommand = true;
				}
			}
		});
		if (!hasMappedCommand) continue;
		if (rejectContinueOnError) {
			const continueOnError = job["continue-on-error"];
			assert(
				continueOnError === undefined ||
					continueOnError === false ||
					continueOnError === "false",
				`Workflow job ${jobId} must not use continue-on-error for release lanes`,
			);
		}

		const runtimeState = {
			byMatrixValue: null,
			setupNodeSeen: false,
		};
		walkJobSteps(steps, (step) => {
			if (
				typeof step.uses === "string" &&
				step.uses.startsWith("actions/setup-node@")
			) {
				assert(
					!runtimeState.setupNodeSeen,
					`Workflow job ${jobId} has multiple setup-node steps`,
				);
				runtimeState.byMatrixValue = setupNodeRuntimeByMatrix(
					step,
					rootDir,
					versions,
				);
				runtimeState.setupNodeSeen = true;
				return;
			}
			if (typeof step.run !== "string") return;
			for (const line of step.run.split(/\r?\n/)) {
				for (const command of parseNxRunCommands(line)) {
					if (!mappedTargets.has(command.target)) continue;
					if (rejectContinueOnError) {
						const continueOnError = step["continue-on-error"];
						assert(
							continueOnError === undefined ||
								continueOnError === false ||
								continueOnError === "false",
							`Workflow lane ${mappedTargets.get(command.target)} must not use continue-on-error`,
						);
					}
					assert(
						runtimeState.byMatrixValue,
						`Workflow lane ${mappedTargets.get(command.target)} must follow an unconditional setup-node step in job ${jobId}`,
					);
					const rawStepCondition = step.if ?? null;
					const stepCondition = normalizeCondition(rawStepCondition);
					const selectedByJob = matrixValuesForCondition(
						jobCondition,
						versions,
					);
					const selectedByStep = matrixValuesForCondition(
						stepCondition,
						versions,
					);
					const selectedValues = versions.length
						? versions.filter(
								(value) =>
									selectedByJob.includes(value) &&
									selectedByStep.includes(value),
							)
						: [undefined];
					const runtimes = [
						...new Set(
							selectedValues.map((value) =>
								runtimeState.byMatrixValue.get(value),
							),
						),
					];
					assert(
						runtimes.length > 0 && runtimes.every(Boolean),
						`Workflow lane ${mappedTargets.get(command.target)} has no runtime projection`,
					);
					const entry = {
						lane: mappedTargets.get(command.target),
						job: jobId,
						runtimes,
						condition: effectiveCondition(jobCondition, stepCondition),
						jobCondition,
						stepCondition,
					};
					if (includeCommands) {
						entry.target = command.target;
						entry.args = command.args;
						entry.command = command.command;
						entry.step = step.name ?? null;
					}
					executions.push(entry);
				}
			}
		});
	}
	return executions;
}

function aggregateLaneIds(lanes, aggregate) {
	assert(
		aggregate && Array.isArray(aggregate.lanes),
		"workflow aggregate lanes are required",
	);
	const laneIds = [];
	const laneById = new Map((lanes.lanes ?? []).map((lane) => [lane.id, lane]));
	const aggregates = lanes.aggregates ?? {};
	const visit = (id, stack) => {
		if (laneById.has(id)) {
			laneIds.push(id);
			return;
		}
		const nested = aggregates[id];
		assert(
			nested,
			`workflow aggregate references unknown lane or aggregate ${id}`,
		);
		assert(
			!stack.includes(id),
			`workflow aggregate cycle: ${[...stack, id].join(" -> ")}`,
		);
		assertArray(nested.lanes, `workflow aggregate ${id}.lanes`);
		for (const member of nested.lanes) visit(member, [...stack, id]);
	};
	for (const id of aggregate.lanes) visit(id, []);
	assert(
		new Set(laneIds).size === laneIds.length,
		"workflow aggregate contains duplicate lane membership",
	);
	return laneIds;
}

function assertArray(value, label) {
	assert(Array.isArray(value), `${label} must be an array`);
}

function sorted(values) {
	return [...values].sort((left, right) => left.localeCompare(right));
}

/**
 * Validate workflow executions against aggregate membership and each lane's
 * declared runtime set. Conditions remain observable in parsed output, but
 * are intentionally not copied into the canonical model.
 */
export function validateWorkflowAggregate(
	source,
	{
		lanes,
		aggregate,
		aggregateId,
		rootDir = process.cwd(),
		label = "workflow aggregate",
		expectedJobs,
		job,
		jobIds,
		rejectContinueOnError = false,
	} = {},
) {
	assert(
		lanes && Array.isArray(lanes.lanes),
		"canonical lane model is required",
	);
	const selectedAggregate =
		typeof aggregate === "string"
			? lanes.aggregates?.[aggregate]
			: (aggregate ?? lanes.aggregates?.[aggregateId]);
	assert(
		selectedAggregate && typeof selectedAggregate === "object",
		`${label} definition is required`,
	);
	const memberIds = aggregateLaneIds(lanes, selectedAggregate);
	const aggregateWorkflowRuntimes = selectedAggregate.workflowRuntimes;
	if (aggregateWorkflowRuntimes !== undefined) {
		assert(
			aggregateWorkflowRuntimes &&
				typeof aggregateWorkflowRuntimes === "object" &&
				!Array.isArray(aggregateWorkflowRuntimes),
			`${label}.workflowRuntimes must be an object`,
		);
		for (const [laneId, runtimes] of Object.entries(
			aggregateWorkflowRuntimes,
		)) {
			assert(
				memberIds.includes(laneId),
				`${label}.workflowRuntimes references a lane outside the aggregate: ${laneId}`,
			);
			assertArray(runtimes, `${label}.workflowRuntimes.${laneId}`);
			assert(
				runtimes.length > 0 &&
					runtimes.every(
						(runtime) => typeof runtime === "string" && runtime.length > 0,
					),
				`${label}.workflowRuntimes.${laneId} must contain runtime ids`,
			);
		}
	}
	const laneById = new Map((lanes.lanes ?? []).map((lane) => [lane.id, lane]));
	const targets = mappedLaneTargets(lanes);
	for (const laneId of memberIds) {
		const lane = laneById.get(laneId);
		assert(lane, `${label} references unknown lane ${laneId}`);
		assert(
			lane.mappingStatus === "mapped" && targets.has(lane.nxTarget),
			`${label} member ${laneId} is not mapped to Nx`,
		);
		assertArray(lane.runtimes, `${laneId}.runtimes`);
	}

	const actual = parseWorkflowLaneExecutions(source, {
		rootDir,
		laneTargets: targets,
		includeCommands: true,
		jobIds,
		rejectContinueOnError,
	});
	const expectedMembers = new Set(memberIds);
	const actualRuntimes = new Map();
	const executionIdentities = new Set();
	const expectedJobSelection = expectedJobs ?? job;
	for (const execution of actual) {
		if (expectedJobSelection !== undefined) {
			const expectedJob =
				typeof expectedJobSelection === "string"
					? expectedJobSelection
					: expectedJobSelection?.[execution.lane];
			assert(
				typeof expectedJob === "string" && expectedJob.length > 0,
				`${label} expected job is required for lane ${execution.lane}`,
			);
			assert(
				execution.job === expectedJob,
				`${label} job identity drifted for lane ${execution.lane}: expected ${expectedJob}, found ${execution.job}`,
			);
		}
		const identityPrefix = `${execution.lane}|${execution.target}|${execution.job}`;
		for (const runtime of execution.runtimes) {
			const identity = `${identityPrefix}|${runtime}`;
			assert(
				!executionIdentities.has(identity),
				`${label} contains duplicate mapped command identity ${identity}`,
			);
			executionIdentities.add(identity);
			const runtimes = actualRuntimes.get(execution.lane) ?? new Set();
			runtimes.add(runtime);
			actualRuntimes.set(execution.lane, runtimes);
		}
	}

	const actualMembers = new Set(actualRuntimes.keys());
	assert(
		JSON.stringify(sorted(actualMembers)) ===
			JSON.stringify(sorted(expectedMembers)),
		`${label} lane membership drifted: expected ${JSON.stringify(sorted(expectedMembers))}, found ${JSON.stringify(sorted(actualMembers))}`,
	);
	for (const laneId of memberIds) {
		const lane = laneById.get(laneId);
		const workflowRuntimes =
			aggregateWorkflowRuntimes?.[laneId] ??
			lane.workflowRuntimes ??
			lane.hostRuntimes ??
			lane.runtimes;
		assertArray(lane.runtimes, `${laneId}.runtimes`);
		assertArray(workflowRuntimes, `${laneId}.workflowRuntimes`);
		const expectedRuntimes = sorted(new Set(workflowRuntimes));
		const foundRuntimes = sorted(actualRuntimes.get(laneId) ?? []);
		assert(
			JSON.stringify(foundRuntimes) === JSON.stringify(expectedRuntimes),
			`${label} runtimes drifted for ${laneId}: expected ${JSON.stringify(expectedRuntimes)}, found ${JSON.stringify(foundRuntimes)}`,
		);
	}
	return { aggregate: selectedAggregate, executions: actual };
}

/**
 * File-backed convenience wrapper for the future control-plane checker.
 * The canonical model must explicitly provide the aggregate memberships used
 * by each workflow; missing aggregates fail closed instead of treating mapped
 * lanes as verified.
 */
export function validateWorkflowProjections(
	lanes,
	{
		rootDir = process.cwd(),
		workflows = {
			"pull-request-ci": ".github/workflows/build-and-test.yml",
			release: ".github/workflows/release.yml",
		},
		aggregates = {},
	} = {},
) {
	assert(lanes?.aggregates, "canonical lane model aggregates are required");
	const results = {};
	for (const [id, workflowConfig] of Object.entries(workflows)) {
		const config =
			typeof workflowConfig === "string"
				? { path: workflowConfig }
				: workflowConfig;
		assert(
			config && typeof config === "object",
			`${id} workflow projection configuration is required`,
		);
		const relativePath = config.path ?? config.file ?? config.workflow;
		assert(
			typeof relativePath === "string" && relativePath.length > 0,
			`${id} workflow projection path is required`,
		);
		const aggregateId = aggregates[id] ?? config.aggregate ?? id;
		const source = readFileSync(resolve(rootDir, relativePath), "utf8");
		results[id] = validateWorkflowAggregate(source, {
			lanes,
			aggregate: lanes.aggregates[aggregateId],
			aggregateId,
			rootDir,
			label: `${id} workflow aggregate`,
			expectedJobs:
				config.expectedJobs ??
				(Array.isArray(config.jobs) ? undefined : config.jobs),
			job: config.job,
			jobIds: Array.isArray(config.jobs) ? config.jobs : undefined,
			rejectContinueOnError: config.rejectContinueOnError ?? false,
		});
	}
	return results;
}
