import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadValidationLanes } from "./repository-control-plane.mjs";

const lanes = loadValidationLanes();
const laneById = new Map(lanes.lanes.map((lane) => [lane.id, lane]));
const aggregateById = new Map(Object.entries(lanes.aggregates ?? {}));

export function requiredCredentials(lane, environment = process.env) {
	return lane.credentials.filter((name) => {
		const value = environment[name];
		return typeof value !== "string" || value.length === 0;
	});
}

export function laneCommand(lane, extraArgs = []) {
	if (lane.external)
		throw new Error(
			`${lane.id} is an external validation hook${lane.integration ? ` (${lane.integration})` : ""}; run the owning workflow or integration hook`,
		);
	const command = lane.command;
	if (!command || !["argv", "sequence"].includes(command.kind))
		throw new Error(`${lane.id} has no executable manifest command`);
	if (command.kind === "argv")
		return [
			{
				command: command.executable,
				args: [...command.args, ...extraArgs],
			},
		];
	const commands = command.commands.map(({ executable, args }) => ({
		command: executable,
		args: [...args],
	}));
	if (extraArgs.length > 0) commands.at(-1).args.push(...extraArgs);
	return commands;
}

function usage() {
	const ids = [...laneById.keys(), ...aggregateById.keys()].join(", ");
	throw new Error(
		`Usage: run-validation-lane.mjs [--execute] <lane-or-aggregate> [command args]; available: ${ids}`,
	);
}

function runCommand(lane, args, environment = process.env) {
	const missing = requiredCredentials(lane, environment);
	if (missing.length > 0)
		throw new Error(
			`${lane.id} requires credential/environment ${missing.join(", ")}`,
		);
	const invocations = laneCommand(lane, args);
	return (async () => {
		for (const invocation of invocations)
			await new Promise((resolve, reject) => {
				const child = spawn(invocation.command, invocation.args, {
					cwd: process.cwd(),
					stdio: "inherit",
					env: environment,
				});
				child.on("error", reject);
				child.on("exit", (code, signal) => {
					if (signal) reject(new Error(`${lane.id} terminated by ${signal}`));
					else if (code === 0) resolve();
					else reject(new Error(`${lane.id} failed with exit code ${code}`));
				});
			});
	})();
}

export async function runMember(
	id,
	args,
	stack = [],
	environment = process.env,
) {
	if (stack.includes(id))
		throw new Error(
			`Validation aggregate cycle: ${[...stack, id].join(" -> ")}`,
		);
	const lane = laneById.get(id);
	if (lane) return runCommand(lane, args, environment);
	const aggregate = aggregateById.get(id);
	if (!aggregate) throw new Error(`Unknown validation lane or aggregate ${id}`);
	for (const member of aggregate.lanes)
		await runMember(member, args, [...stack, id], environment);
}

export async function main(
	argv = process.argv.slice(2),
	environment = process.env,
) {
	const [requested, ...requestedArgs] = argv;
	const execute = requested === "--execute";
	const [id, ...args] = execute ? requestedArgs : argv;
	if (!id) usage();
	await runMember(id, args, [], environment);
}

export function isDirectInvocation(argvPath = process.argv[1]) {
	return Boolean(
		argvPath && resolve(argvPath) === fileURLToPath(import.meta.url),
	);
}

if (isDirectInvocation()) {
	try {
		await main();
	} catch (error) {
		const [, requested] = process.argv[2]?.startsWith("--execute")
			? process.argv.slice(2)
			: [undefined, process.argv[2]];
		console.error(`validation lane ${requested ?? "?"}: ${error.message}`);
		process.exitCode = 1;
	}
}
