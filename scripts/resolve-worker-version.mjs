import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

export const MAX_WORKER_PREVIEW_TAG_LENGTH = 64;

export function resolveWorkerVersion(manifest) {
	let packageJson;
	try {
		packageJson = JSON.parse(manifest);
	} catch {
		throw new Error("Worker package manifest must be valid JSON");
	}
	const version = packageJson?.version;
	if (typeof version !== "string" || semver.valid(version) !== version) {
		throw new Error(
			"Worker package manifest version must be a valid semantic version",
		);
	}
	return version;
}

export function resolveWorkerPreviewTag({
	manifest,
	pullRequestNumber,
	headSha,
}) {
	const version = resolveWorkerVersion(manifest);
	const pullRequest = String(pullRequestNumber);
	if (!/^[1-9]\d{0,9}$/.test(pullRequest)) {
		throw new Error(
			"Worker preview tag requires a positive pull request number",
		);
	}
	if (typeof headSha !== "string" || !/^[0-9a-f]{7,64}$/i.test(headSha)) {
		throw new Error("Worker preview tag requires a hexadecimal commit SHA");
	}

	const parsedVersion = semver.parse(version);
	if (!parsedVersion) {
		throw new Error("Worker package manifest version could not be parsed");
	}
	const existingPrerelease = parsedVersion.prerelease.join(".");
	const previewPrerelease = [
		existingPrerelease,
		"pr",
		pullRequest,
		headSha.slice(0, 12).toLowerCase(),
	]
		.filter(Boolean)
		.join(".");
	const tag = `${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}-${previewPrerelease}`;
	if (semver.valid(tag) !== tag) {
		throw new Error(
			"Resolved Worker preview tag is not a valid semantic version",
		);
	}
	if (tag.length > MAX_WORKER_PREVIEW_TAG_LENGTH) {
		throw new Error(
			`Resolved Worker preview tag exceeds ${MAX_WORKER_PREVIEW_TAG_LENGTH} characters`,
		);
	}
	return tag;
}

async function main() {
	const [mode, pullRequestNumber, headSha] = process.argv.slice(2);
	const manifest = await readFile(
		resolve(
			fileURLToPath(new URL("..", import.meta.url)),
			"packages/worker/package.json",
		),
		"utf8",
	);
	if (mode === "production") {
		process.stdout.write(resolveWorkerVersion(manifest));
		return;
	}
	if (mode === "preview") {
		process.stdout.write(
			resolveWorkerPreviewTag({ manifest, pullRequestNumber, headSha }),
		);
		return;
	}
	throw new Error(
		"Usage: resolve-worker-version.mjs production | preview <pr-number> <head-sha>",
	);
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	await main();
}
