import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import semver from "semver";

const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const REQUEST_TIMEOUT_MS = 3_000;
const REGISTRY_URL = "https://registry.npmjs.org";

interface UpdateCheckOptions {
	packageName: string;
	currentVersion: string;
}

interface CacheEntry {
	checkedAt: number;
	latestVersion: string;
}

interface ImmediateHandle {
	unref(): unknown;
}

interface VersionCheckDependencies {
	fetch: typeof fetch;
	readFile: typeof readFile;
	mkdir: typeof mkdir;
	writeFile: typeof writeFile;
	rename: typeof rename;
	unlink: typeof unlink;
	homedir: typeof homedir;
	randomUUID: typeof randomUUID;
	now: () => number;
	env: NodeJS.ProcessEnv;
	writeStderr: (message: string) => unknown;
}

interface SchedulerDependencies {
	setImmediate: (callback: () => void) => ImmediateHandle;
	checkForUpdate: (
		options: UpdateCheckOptions,
		dependencies?: Partial<VersionCheckDependencies>,
	) => Promise<void>;
}

const defaultDependencies: VersionCheckDependencies = {
	fetch,
	readFile,
	mkdir,
	writeFile,
	rename,
	unlink,
	homedir,
	randomUUID,
	now: Date.now,
	env: process.env,
	writeStderr: (message) => process.stderr.write(message),
};

const defaultSchedulerDependencies: SchedulerDependencies = {
	setImmediate,
	checkForUpdate,
};

function getCachePath(dependencies: VersionCheckDependencies): string {
	const cacheRoot =
		dependencies.env.XDG_CACHE_HOME || join(dependencies.homedir(), ".cache");
	return join(cacheRoot, "hevy-mcp", "update-check.json");
}

function parseCacheEntry(value: string, now: number): CacheEntry | undefined {
	try {
		const parsed: unknown = JSON.parse(value);
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			!("checkedAt" in parsed) ||
			!("latestVersion" in parsed)
		) {
			return undefined;
		}

		const { checkedAt, latestVersion } = parsed;
		if (
			typeof checkedAt !== "number" ||
			!Number.isFinite(checkedAt) ||
			typeof latestVersion !== "string" ||
			!semver.valid(latestVersion)
		) {
			return undefined;
		}

		const age = now - checkedAt;
		if (age < 0 || age >= CACHE_TTL_MS) {
			return undefined;
		}

		return { checkedAt, latestVersion };
	} catch {
		return undefined;
	}
}

function parseLatestVersion(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null || !("dist-tags" in value)) {
		return undefined;
	}

	const distTags = value["dist-tags"];
	if (
		typeof distTags !== "object" ||
		distTags === null ||
		!("latest" in distTags) ||
		typeof distTags.latest !== "string" ||
		!semver.valid(distTags.latest)
	) {
		return undefined;
	}

	return distTags.latest;
}

function shouldNotifyAboutUpdate(
	currentVersion: string,
	latestVersion: string,
): boolean {
	const current = semver.parse(currentVersion);
	const latest = semver.parse(latestVersion);

	if (
		!current ||
		!latest ||
		latest.prerelease.length > 0 ||
		!semver.gt(latest, current)
	) {
		return false;
	}

	if (latest.major > current.major) {
		return true;
	}

	return latest.major === current.major && latest.minor - current.minor > 2;
}

async function readFreshCachedVersion(
	cachePath: string,
	dependencies: VersionCheckDependencies,
): Promise<string | undefined> {
	try {
		const cache = await dependencies.readFile(cachePath, "utf8");
		return parseCacheEntry(cache, dependencies.now())?.latestVersion;
	} catch {
		return undefined;
	}
}

async function fetchLatestVersion(
	packageName: string,
	dependencies: VersionCheckDependencies,
): Promise<string | undefined> {
	try {
		const response = await dependencies.fetch(
			`${REGISTRY_URL}/${encodeURIComponent(packageName)}`,
			{
				headers: {
					Accept: "application/vnd.npm.install-v1+json",
				},
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			},
		);
		if (!response.ok) {
			return undefined;
		}

		return parseLatestVersion(await response.json());
	} catch {
		return undefined;
	}
}

async function writeCache(
	cachePath: string,
	entry: CacheEntry,
	dependencies: VersionCheckDependencies,
): Promise<void> {
	const temporaryPath = `${cachePath}.${process.pid}.${dependencies.randomUUID()}.tmp`;

	try {
		await dependencies.mkdir(dirname(cachePath), { recursive: true });
		await dependencies.writeFile(
			temporaryPath,
			`${JSON.stringify(entry)}\n`,
			"utf8",
		);
		await dependencies.rename(temporaryPath, cachePath);
	} catch {
		try {
			await dependencies.unlink(temporaryPath);
		} catch {
			// Cache cleanup failures are non-fatal.
		}
	}
}

export async function checkForUpdate(
	options: UpdateCheckOptions,
	overrides: Partial<VersionCheckDependencies> = {},
): Promise<void> {
	try {
		if (!semver.valid(options.currentVersion)) {
			return;
		}

		const dependencies = { ...defaultDependencies, ...overrides };
		const cachePath = getCachePath(dependencies);
		let latestVersion = await readFreshCachedVersion(cachePath, dependencies);

		if (!latestVersion) {
			latestVersion = await fetchLatestVersion(
				options.packageName,
				dependencies,
			);
			if (!latestVersion) {
				return;
			}

			await writeCache(
				cachePath,
				{ checkedAt: dependencies.now(), latestVersion },
				dependencies,
			);
		}

		if (shouldNotifyAboutUpdate(options.currentVersion, latestVersion)) {
			dependencies.writeStderr(
				`Update available for ${options.packageName}: current ${options.currentVersion}, latest ${latestVersion}. Notices are shown for newer major versions or when more than two minor versions behind. Update using your preferred installation method (for example, npm install -g ${options.packageName}@latest).\n`,
			);
		}
	} catch {
		// Update checks must never interfere with the MCP server lifecycle.
	}
}

export function scheduleUpdateCheck(
	options: UpdateCheckOptions,
	overrides: Partial<SchedulerDependencies> = {},
): void {
	const dependencies = { ...defaultSchedulerDependencies, ...overrides };
	const immediate = dependencies.setImmediate(() => {
		void dependencies.checkForUpdate(options).catch(() => undefined);
	});
	immediate.unref();
}
