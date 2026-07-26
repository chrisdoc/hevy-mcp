import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const dir = await mkdtemp(join(tmpdir(), "hevy-cli-pack-"));
try {
	await exec(
		"npm",
		["pack", "--workspace=@chrisdoc/hevy-cli", "--pack-destination", dir],
		{ cwd: new URL("../../..", import.meta.url) },
	);
	const names = await (await import("node:fs/promises")).readdir(dir);
	if (names.length !== 1 || !names[0].endsWith(".tgz"))
		throw new Error("CLI tarball was not created");
	const manifest = JSON.parse(
		(await exec("tar", ["-xOf", join(dir, names[0]), "package/package.json"]))
			.stdout,
	);
	if (manifest.name !== "@chrisdoc/hevy-cli")
		throw new Error("CLI package metadata missing");
	if (manifest.dependencies && Object.keys(manifest.dependencies).length)
		throw new Error("CLI has runtime dependencies");
	await exec("tar", ["-xzf", join(dir, names[0]), "-C", dir]);
	const version = await exec(
		"node",
		[join(dir, "package/dist/cli.mjs"), "--version"],
		{
			env: { ...process.env, HEVY_API_KEY: undefined },
		},
	);
	if (version.stdout !== `${manifest.version}\n` || version.stderr !== "")
		throw new Error("Packed CLI executable did not report its version");
} finally {
	await rm(dir, { recursive: true, force: true });
}
