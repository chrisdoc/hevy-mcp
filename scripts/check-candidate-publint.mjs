import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import {
	releaseCandidateArtifact,
	repositoryRoot,
} from "./release-candidate-artifacts.mjs";

const publint = resolve(
	repositoryRoot,
	"node_modules/.bin",
	process.platform === "win32" ? "publint.cmd" : "publint",
);
const candidates = await Promise.all([
	releaseCandidateArtifact("packages/node"),
	releaseCandidateArtifact("packages/cli"),
]);

for (const candidate of candidates) {
	const result = spawnSync(
		publint,
		["run", "--strict", "--pack=false", candidate.path],
		{ cwd: repositoryRoot, env: process.env, stdio: "inherit" },
	);
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`Publint failed for ${candidate.filename} with ${result.signal ? `signal ${result.signal}` : `exit code ${result.status ?? 1}`}`,
		);
	}
}
