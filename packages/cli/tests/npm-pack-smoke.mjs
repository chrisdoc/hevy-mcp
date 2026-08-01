import {
	access,
	cp,
	mkdtemp,
	mkdir,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const packageDist = fileURLToPath(new URL("../dist", import.meta.url));
const dir = await mkdtemp(join(tmpdir(), "hevy-cli-pack-"));
const backupDir = await mkdtemp(join(tmpdir(), "hevy-cli-dist-"));
const backupDist = join(backupDir, "dist");
let hadDist = false;

async function moveDirectory(source, destination) {
	await cp(source, destination, { recursive: true });
	await rm(source, { recursive: true, force: true });
}

function runWithInput(command, args, options, input) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			...options,
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => (stdout += chunk));
		child.stderr.on("data", (chunk) => (stderr += chunk));
		child.on("error", reject);
		child.on("close", (code) => resolve({ code, stdout, stderr }));
		child.stdin.end(input);
	});
}

try {
	try {
		await access(packageDist);
		hadDist = true;
		await moveDirectory(packageDist, backupDist);
	} catch {}

	await exec(
		"npm",
		["pack", "--workspace=@chrisdoc/hevy-cli", "--pack-destination", dir],
		{ cwd: repositoryRoot },
	);
	const names = await readdir(dir);
	if (names.length !== 1 || !names[0].endsWith(".tgz"))
		throw new Error("CLI tarball was not created");
	const tarball = join(dir, names[0]);
	const manifest = JSON.parse(
		(await exec("tar", ["-xOf", tarball, "package/package.json"])).stdout,
	);
	if (manifest.name !== "@chrisdoc/hevy-cli")
		throw new Error("CLI package metadata missing");
	if (manifest.repository?.url !== "https://github.com/chrisdoc/hevy-mcp")
		throw new Error("CLI package repository metadata missing");
	if (manifest.dependencies && Object.keys(manifest.dependencies).length)
		throw new Error("CLI has runtime dependencies");
	if (manifest.scripts?.prepack !== "npm run build")
		throw new Error("CLI package does not build before packing");

	await exec("tar", ["-xzf", tarball, "-C", dir]);
	const consumer = join(dir, "consumer");
	await mkdir(consumer);
	await exec(
		"npm",
		[
			"install",
			"--no-audit",
			"--no-fund",
			"--ignore-scripts",
			"--prefix",
			consumer,
			tarball,
		],
		{ cwd: repositoryRoot },
	);
	const binary = join(consumer, "node_modules/.bin/hevy");
	const key = "00000000-0000-0000-0000-000000000000";
	const fakeFetch = join(dir, "fake-fetch.mjs");
	const requestLog = join(dir, "requests.jsonl");
	await writeFile(
		fakeFetch,
		`import { appendFile } from "node:fs/promises";
const log = process.env.HEVY_SMOKE_LOG;
globalThis.fetch = async (input, init = {}) => {
	const headers = Object.fromEntries(new Headers(init.headers).entries());
	const request = {
		method: init.method ?? "GET",
		url: String(input),
		headers,
		body: typeof init.body === "string" ? init.body : "",
	};
	await appendFile(log, JSON.stringify(request) + "\\n");
	const pathname = new URL(request.url).pathname;
	const response =
		request.method === "POST" && pathname === "/v1/routine_folders"
			? { status: 201, body: { id: 3 } }
			: request.method === "PUT" && pathname === "/v1/workouts/workout-1"
				? { status: 200, body: { id: "workout-1" } }
				: { status: 404, body: { error: "unexpected request" } };
	return new Response(JSON.stringify(response.body), {
		status: response.status,
		headers: { "content-type": "application/json" },
	});
};
`,
		"utf8",
	);
	const env = {
		...process.env,
		HEVY_API_KEY: key,
		HEVY_SMOKE_LOG: requestLog,
		NODE_OPTIONS: `--import=${fakeFetch}`,
	};
	const version = await exec(binary, ["--version"], { env });
	if (version.stdout !== `${manifest.version}\n` || version.stderr !== "")
		throw new Error("Packed CLI executable did not report its version");

	const help = await exec(binary, ["--help"], { env });
	if (
		help.stderr !== "" ||
		!help.stdout.includes("workouts list|create|update") ||
		!help.stdout.includes("routines list|create|update") ||
		!help.stdout.includes("exercises create") ||
		!help.stdout.includes("measurements list|get|create|update") ||
		!help.stdout.includes("folders create") ||
		help.stdout.toLowerCase().includes("delete")
	)
		throw new Error("Packed CLI help mutation matrix is incorrect");

	const folder = await exec(
		binary,
		[
			"folders",
			"create",
			"--data",
			'{"routine_folder":{"title":"Strength"}}',
			"--yes",
			"--json",
		],
		{ env },
	);
	if (folder.stderr !== "") throw new Error("Packed folder create failed");
	if (JSON.parse(folder.stdout).routine_folder.id !== 3)
		throw new Error("Packed folder response was not normalized");

	const workout = {
		workout_id: "workout-1",
		workout: {
			title: "Push",
			start_time: "2024-01-01T10:00:00Z",
			end_time: "2024-01-01T11:00:00Z",
			exercises: [
				{
					exercise_template_id: "exercise-1",
					sets: [{ type: "normal", weight_kg: 50, reps: 5 }],
				},
			],
		},
	};
	const update = await runWithInput(
		binary,
		["workouts", "update", "workout-1", "--data", "@-", "--yes", "--json"],
		{ env },
		JSON.stringify(workout),
	);
	if (update.code !== 0 || update.stderr !== "")
		throw new Error("Packed workout update failed");
	if (JSON.parse(update.stdout).workout_id !== "workout-1")
		throw new Error("Packed workout response was not normalized");

	const requests = (await readFile(requestLog, "utf8"))
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	if (requests.length !== 2) throw new Error("Unexpected packed request count");
	const [folderRequest, workoutRequest] = requests;
	if (
		folderRequest.method !== "POST" ||
		new URL(folderRequest.url).pathname !== "/v1/routine_folders" ||
		folderRequest.headers["api-key"] !== key ||
		JSON.stringify(JSON.parse(folderRequest.body)) !==
			JSON.stringify({ routine_folder: { title: "Strength" } })
	)
		throw new Error("Packed folder request contract is incorrect");
	if (
		workoutRequest.method !== "PUT" ||
		new URL(workoutRequest.url).pathname !== "/v1/workouts/workout-1" ||
		workoutRequest.headers["api-key"] !== key ||
		JSON.stringify(JSON.parse(workoutRequest.body)) !==
			JSON.stringify({
				workout: {
					title: "Push",
					start_time: "2024-01-01T10:00:00Z",
					end_time: "2024-01-01T11:00:00Z",
					is_private: false,
					exercises: [
						{
							exercise_template_id: "exercise-1",
							sets: [
								{
									type: "normal",
									weight_kg: 50,
									reps: 5,
								},
							],
						},
					],
				},
			})
	)
		throw new Error("Packed workout request contract is incorrect");
} finally {
	await rm(packageDist, { recursive: true, force: true });
	if (hadDist) await moveDirectory(backupDist, packageDist);
	await rm(backupDir, { recursive: true, force: true });
	await rm(dir, { recursive: true, force: true });
}
