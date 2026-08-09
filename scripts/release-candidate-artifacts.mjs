import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"..",
);

export function candidateTarballFilename({ name, version }) {
	if (typeof name !== "string" || !name) {
		throw new Error("Release candidate package name is required");
	}
	if (typeof version !== "string" || !version) {
		throw new Error(`Release candidate version is required for ${name}`);
	}
	return `${name.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`;
}

export async function releaseCandidateArtifact(
	packageDirectory,
	{ repositoryRoot: root = repositoryRoot } = {},
) {
	const manifestPath = resolve(root, packageDirectory, "package.json");
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	const filename = candidateTarballFilename(manifest);
	const path = resolve(root, ".nx/pack", filename);
	let details = null;
	try {
		details = await stat(path);
	} catch (error) {
		if (
			!error ||
			typeof error !== "object" ||
			!("code" in error) ||
			error.code !== "ENOENT"
		) {
			throw error;
		}
	}
	if (!details?.isFile() || details.size === 0) {
		throw new Error(
			`Release candidate is missing or empty for ${manifest.name}@${manifest.version}: ${path}`,
		);
	}
	return {
		name: manifest.name,
		version: manifest.version,
		manifest,
		filename,
		path,
		size: details.size,
	};
}
