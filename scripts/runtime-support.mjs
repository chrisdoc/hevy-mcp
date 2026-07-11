import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import semver from "semver";

const canonicalRange = "^24.0.0 || ^26.0.0";
const primaryMajor = 24;
const ciSupport = [
	{ major: 24, level: "primary" },
	{ major: 26, level: "npm-package compatibility" },
];

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

async function readJson(path, label) {
	const contents = await readFile(path, "utf8");
	try {
		return JSON.parse(contents);
	} catch (error) {
		throw new Error(`${label} is not valid JSON: ${error.message}`);
	}
}

function parseCiSupport(workflow) {
	return [
		...workflow.matchAll(
			/- node-version: "(\d+)\.x"\n\s+support-level: "([^"]+)"/g,
		),
	].map((match) => ({ major: Number(match[1]), level: match[2] }));
}

export async function checkRuntimeSupport({ rootDir = process.cwd() } = {}) {
	const [packageJson, packageLock, nvmrc, workflow] = await Promise.all([
		readJson(resolve(rootDir, "package.json"), "package.json"),
		readJson(resolve(rootDir, "package-lock.json"), "package-lock.json"),
		readFile(resolve(rootDir, ".nvmrc"), "utf8"),
		readFile(resolve(rootDir, ".github/workflows/build-and-test.yml"), "utf8"),
	]);

	assert(
		packageJson.engines?.node === canonicalRange,
		`package.json engines.node must be ${canonicalRange}`,
	);
	assert(
		packageLock.packages?.[""]?.engines?.node === canonicalRange,
		`package-lock.json root engines.node must be ${canonicalRange}`,
	);
	assert(
		nvmrc.trim() === String(primaryMajor),
		`.nvmrc must select the primary Node major ${primaryMajor}`,
	);
	assert(
		JSON.stringify(parseCiSupport(workflow)) === JSON.stringify(ciSupport),
		`CI runtime support must be ${JSON.stringify(ciSupport)}`,
	);

	for (const major of [20, 21, 22, 23, 25, 27]) {
		assert(
			!semver.satisfies(`${major}.0.0`, canonicalRange),
			`engines.node must not claim Node ${major}`,
		);
	}
	for (const major of ciSupport.map(({ major }) => major)) {
		assert(
			semver.satisfies(`${major}.0.0`, canonicalRange),
			`engines.node must include CI Node ${major}`,
		);
	}

	return { canonicalRange, ciSupport, primaryMajor };
}

const isCli =
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isCli) {
	try {
		const result = await checkRuntimeSupport();
		const compatibility = result.ciSupport.find(
			({ level }) => level === "npm-package compatibility",
		);
		console.log(
			`Runtime support is aligned: Node ${result.primaryMajor} primary, Node ${compatibility.major} ${compatibility.level} (${result.canonicalRange}).`,
		);
	} catch (error) {
		console.error(`runtime-support: ${error.message}`);
		process.exitCode = 1;
	}
}
