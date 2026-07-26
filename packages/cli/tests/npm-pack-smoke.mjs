import { access, mkdtemp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const packageDist = fileURLToPath(new URL("../dist", import.meta.url));
const dir = await mkdtemp(join(tmpdir(), "hevy-cli-pack-"));
const backupDir = await mkdtemp(join(tmpdir(), "hevy-cli-dist-"));
const backupDist = join(backupDir, "dist");
let hadDist = false;

try {
	try {
		await access(packageDist);
		hadDist = true;
		await rename(packageDist, backupDist);
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
	const version = await exec(
		join(consumer, "node_modules/.bin/hevy"),
		["--version"],
		{ env: { ...process.env, HEVY_API_KEY: "" } },
	);
	if (version.stdout !== `${manifest.version}\n` || version.stderr !== "")
		throw new Error("Packed CLI executable did not report its version");
} finally {
	await rm(packageDist, { recursive: true, force: true });
	if (hadDist) await rename(backupDist, packageDist);
	await rm(backupDir, { recursive: true, force: true });
	await rm(dir, { recursive: true, force: true });
}
