const neutralPackages = "^packages/(?:hevy-client|operations|core)/src/";
const workerPackage = "^packages/worker/src/";
const packageSources =
	"^packages/(?:hevy-client|operations|core|node|worker|cli)/src/";
const runtimeOnlyPackages =
	"(?:@cloudflare/|cloudflare:|@sentry/|@opentelemetry/)";

module.exports = {
	forbidden: [
		{
			name: "no-circular",
			comment: "Workspace packages must not contain circular dependencies.",
			severity: "error",
			from: {},
			to: { circular: true },
		},
		{
			name: "neutral-only-depends-on-neutral",
			comment:
				"The runtime-neutral client/core cannot depend on Node, Worker, or CLI source.",
			severity: "error",
			from: { path: neutralPackages },
			to: { path: "^packages/(?:node|worker|cli)/src/" },
		},
		{
			name: "worker-does-not-depend-on-node-or-cli",
			comment:
				"The Worker graph must remain workerd-safe and separate from Node/CLI code.",
			severity: "error",
			from: { path: workerPackage },
			to: { path: "^packages/(?:node|cli)/src/" },
		},
		{
			name: "node-does-not-depend-on-worker",
			comment:
				"The Node runtime must not pull Worker-only code into its bundle.",
			severity: "error",
			from: { path: "^packages/(?:node|cli)/src/" },
			to: { path: "^packages/worker/src/" },
		},
		{
			name: "neutral-no-node-builtins",
			comment:
				"Neutral packages reject Node built-ins; the compiler-backed checker remains authoritative.",
			severity: "error",
			from: { path: neutralPackages },
			to: { dependencyTypes: ["core"] },
		},
		{
			name: "worker-no-node-builtins",
			comment: "Worker source rejects Node built-ins.",
			severity: "error",
			from: { path: workerPackage },
			to: { dependencyTypes: ["core"] },
		},
		{
			name: "neutral-no-dynamic-imports",
			comment:
				"Neutral packages reject runtime-dependent dynamic imports; local literal test imports remain allowed.",
			severity: "error",
			from: { path: neutralPackages },
			to: {
				dynamic: true,
				pathNot: neutralPackages,
			},
		},
		{
			name: "neutral-no-runtime-specific-packages",
			comment:
				"Neutral packages reject Cloudflare, Sentry, and OpenTelemetry imports.",
			severity: "error",
			from: { path: neutralPackages },
			to: { path: runtimeOnlyPackages },
		},
		{
			name: "worker-no-node-observability-families",
			comment: "Worker source rejects Sentry and Node OpenTelemetry families.",
			severity: "error",
			from: { path: workerPackage },
			to: { path: "(?:@sentry/|@opentelemetry/)" },
		},
		{
			name: "workspace-source-only",
			comment:
				"Workspace source should not resolve an internal package through an undeclared path.",
			severity: "error",
			from: { path: packageSources },
			to: {
				couldNotResolve: true,
				// `cloudflare:workers` is a workerd-provided runtime module, not
				// an npm package that dependency-cruiser can resolve locally.
				pathNot: "^cloudflare:workers$",
			},
		},
	],
	options: {
		combinedDependencies: true,
		parser: "swc",
		doNotFollow: {
			path: "node_modules",
			dependencyTypes: [
				"npm",
				"npm-dev",
				"npm-optional",
				"npm-peer",
				"npm-bundled",
				"npm-no-pkg",
			],
		},
		enhancedResolveOptions: {
			exportsFields: ["exports"],
			conditionNames: ["import", "types", "node", "default"],
		},
	},
};
