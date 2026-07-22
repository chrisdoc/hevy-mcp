import { readFile, readdir } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as ast from "typescript/unstable/ast";
import { API } from "typescript/unstable/sync";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const packageRules = new Map([
	[
		"packages/hevy-client",
		{
			allowed: new Map(),
			forbidden: ["@cloudflare/", "cloudflare:", "@sentry/", "@opentelemetry/"],
			rejectBuiltins: true,
			rejectDynamicImports: true,
		},
	],
	[
		"packages/core",
		{
			allowed: new Map([
				["@hevy-mcp/hevy-client", new Set(["", "types", "schemas"])],
			]),
			forbidden: ["@cloudflare/", "cloudflare:", "@sentry/", "@opentelemetry/"],
			rejectBuiltins: true,
			rejectDynamicImports: true,
		},
	],
	[
		"packages/node",
		{
			allowed: new Map([
				["@hevy-mcp/core", new Set([""])],
				["@hevy-mcp/hevy-client", new Set([""])],
			]),
			forbidden: ["@cloudflare/", "cloudflare:"],
			rejectBuiltins: false,
			rejectDynamicImports: false,
		},
	],
	[
		"packages/worker",
		{
			allowed: new Map([
				["@hevy-mcp/core", new Set([""])],
				["@hevy-mcp/hevy-client", new Set([""])],
			]),
			forbidden: ["@sentry/", "@opentelemetry/"],
			rejectBuiltins: true,
			rejectDynamicImports: false,
		},
	],
]);

const internalPackages = [...packageRules.keys()].map(
	(relativePackage) => `@hevy-mcp/${relativePackage.split("/")[1]}`,
);

async function collect(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await collect(path)));
		else if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) files.push(path);
	}
	return files;
}

function moduleSpecifier(node) {
	return node && ast.isStringLiteralLikeNode(node) ? node.text : undefined;
}

function inspectSourceLexically(source) {
	const withoutComments = source
		.replace(/\/\*[\s\S]*?\*\//g, " ")
		.replace(/(^|\s|;)\/\/.*$/gm, "$1 ");
	const edges = [];
	for (const pattern of [
		/(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\sfrom\s*)?["']([^"']+)["']/g,
		/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
		/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
	]) {
		for (const match of withoutComments.matchAll(pattern)) {
			edges.push({ specifier: match[1], kind: "lexical" });
		}
	}
	const nonLiteralCalls = [
		...withoutComments.matchAll(/\bimport\s*\(\s*(?!["'])/g),
		...withoutComments.matchAll(/\brequire\s*\(\s*(?!["'])/g),
	].map(() => "dynamic");
	return { edges, nonLiteralCalls };
}

function inspectCompilerSourceFile(sourceFile) {
	const edges = [];
	const nonLiteralCalls = [];

	function visit(node) {
		if (ast.isImportDeclaration(node) || ast.isExportDeclaration(node)) {
			const specifier = moduleSpecifier(node.moduleSpecifier);
			if (specifier) edges.push({ specifier, kind: "import" });
		}
		if (ast.isImportEqualsDeclaration(node)) {
			const reference = node.moduleReference;
			if (ast.isExternalModuleReference(reference)) {
				const specifier = moduleSpecifier(reference.expression);
				if (specifier) edges.push({ specifier, kind: "import-equals" });
			}
		}
		if (ast.isCallExpression(node)) {
			const expression = node.expression;
			const isImportCall = expression.kind === ast.SyntaxKind.ImportKeyword;
			const isRequireCall =
				ast.isIdentifier(expression) && expression.text === "require";
			if (isImportCall || isRequireCall) {
				const argument = node.arguments[0];
				const specifier = moduleSpecifier(argument);
				if (specifier)
					edges.push({
						specifier,
						kind: isImportCall ? "import()" : "require",
					});
				else nonLiteralCalls.push(isImportCall ? "import()" : "require");
			}
		}
		node.forEachChild(visit);
	}

	sourceFile.forEachChild(visit);
	return { edges, nonLiteralCalls, usedCompilerApi: true };
}

/**
 * Extract every supported module edge from fixture source. Real workspace
 * files are inspected with the TypeScript compiler API below; this helper is
 * intentionally kept synchronous for small, in-memory policy fixtures.
 */
export function inspectSource(source, _fileName = "fixture.ts") {
	return inspectSourceLexically(source);
}

function inspectFilesWithCompiler(files) {
	const api = new API();
	let snapshot;
	try {
		snapshot = api.updateSnapshot({ openFiles: files });
		const inspections = new Map();
		for (const file of files) {
			const project = snapshot.getDefaultProjectForFile(file);
			const sourceFile = project?.program?.getSourceFile(file);
			if (!sourceFile) {
				throw new Error(
					`TypeScript compiler could not load boundary file: ${file}`,
				);
			}
			inspections.set(file, inspectCompilerSourceFile(sourceFile));
		}
		return inspections;
	} finally {
		snapshot?.dispose();
		api.close();
	}
}

/**
 * Inspect one on-disk source file with TypeScript's compiler-backed AST.
 * Boundary enforcement fails closed when the compiler cannot parse a file.
 */
export function inspectFileWithCompiler(file) {
	return inspectFilesWithCompiler([resolve(file)]).get(resolve(file));
}

function isInside(path, directory) {
	return path === directory || path.startsWith(`${directory}/`);
}

export function findImportViolations({
	source,
	file,
	fileName = file,
	relativePackage,
	packageRoot,
	rule,
	inspection,
}) {
	const failures = [];
	const { edges, nonLiteralCalls } =
		inspection ?? inspectSource(source, fileName);
	if (rule.rejectDynamicImports && nonLiteralCalls.length > 0) {
		failures.push(
			`${relativePackage}: non-literal dynamic import/require in ${file}`,
		);
	}

	for (const { specifier } of edges) {
		if (specifier.startsWith(".")) {
			const target = resolve(dirname(file), specifier);
			if (!isInside(target, packageRoot)) {
				failures.push(
					`${relativePackage}: relative import escapes package: ${specifier}`,
				);
			}
			continue;
		}

		const internal = internalPackages.find(
			(packageName) =>
				specifier === packageName || specifier.startsWith(`${packageName}/`),
		);
		if (internal) {
			const subpath = specifier.slice(internal.length).replace(/^\//, "");
			const allowedSubpaths = rule.allowed.get(internal);
			if (!allowedSubpaths?.has(subpath)) {
				failures.push(
					`${relativePackage}: forbidden internal import: ${specifier}`,
				);
			}
		}
		if (
			rule.rejectBuiltins &&
			(builtinModules.includes(specifier) || specifier.startsWith("node:"))
		) {
			failures.push(
				`${relativePackage}: forbidden Node builtin import: ${specifier}`,
			);
		}
		for (const prefix of rule.forbidden) {
			if (specifier === prefix || specifier.startsWith(prefix)) {
				failures.push(
					`${relativePackage}: forbidden runtime import: ${specifier}`,
				);
			}
		}
	}
	return failures;
}

export async function checkBoundaries(projectRoot = root) {
	const failures = [];
	for (const [relativePackage, rule] of packageRules) {
		const packageRoot = resolve(projectRoot, relativePackage);
		const files = await collect(resolve(packageRoot, "src"));
		const inspections = inspectFilesWithCompiler(files);
		for (const file of files) {
			const source = await readFile(file, "utf8");
			failures.push(
				...findImportViolations({
					source,
					file,
					relativePackage,
					packageRoot,
					rule,
					inspection: inspections.get(file),
				}),
			);
		}
	}

	const rootFiles = await collect(resolve(projectRoot, "src"));
	const rootInspections = inspectFilesWithCompiler(rootFiles);
	for (const file of rootFiles) {
		const { edges } = rootInspections.get(file);
		for (const { specifier } of edges) {
			if (specifier.startsWith(".") && specifier.includes("generated/")) {
				failures.push(
					`root source still imports retired generated area: ${file}`,
				);
			}
		}
	}
	return [...new Set(failures)];
}

if (
	process.argv[1] &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
	const failures = await checkBoundaries();
	if (failures.length) {
		throw new Error(`Package boundary violations:\n${failures.join("\n")}`);
	}
	console.log("Package boundaries are valid.");
}
