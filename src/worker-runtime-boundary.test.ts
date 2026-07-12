import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

interface RuntimeBoundaryOptions {
	entrypoints: string[];
	sourceRoot: string;
	compilerOptions?: ts.CompilerOptions;
	tsconfigPath?: string;
}

function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
	const clause = node.importClause;
	if (!clause) return false;
	if (clause.isTypeOnly) return true;
	if (clause.name || !clause.namedBindings) return false;
	if (!ts.isNamedImports(clause.namedBindings)) return false;
	return (
		clause.namedBindings.elements.length > 0 &&
		clause.namedBindings.elements.every((element) => element.isTypeOnly)
	);
}

function isTypeOnlyExport(node: ts.ExportDeclaration): boolean {
	if (node.isTypeOnly) return true;
	if (!node.exportClause || !ts.isNamedExports(node.exportClause)) return false;
	return (
		node.exportClause.elements.length > 0 &&
		node.exportClause.elements.every((element) => element.isTypeOnly)
	);
}

function getRuntimeSpecifiers(sourceFile: ts.SourceFile): string[] {
	const specifiers: string[] = [];

	function addModuleSpecifier(node: ts.Expression | undefined) {
		if (node && ts.isStringLiteralLike(node)) {
			specifiers.push(node.text);
		}
	}

	function visit(node: ts.Node) {
		if (ts.isImportDeclaration(node)) {
			if (!isTypeOnlyImport(node)) addModuleSpecifier(node.moduleSpecifier);
			return;
		}

		if (ts.isExportDeclaration(node)) {
			if (!isTypeOnlyExport(node)) addModuleSpecifier(node.moduleSpecifier);
			return;
		}

		if (
			ts.isImportEqualsDeclaration(node) &&
			!node.isTypeOnly &&
			ts.isExternalModuleReference(node.moduleReference)
		) {
			addModuleSpecifier(node.moduleReference.expression);
			return;
		}

		if (
			ts.isCallExpression(node) &&
			(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(node.expression) &&
					node.expression.text === "require"))
		) {
			addModuleSpecifier(node.arguments[0]);
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return specifiers;
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
	return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

function readCompilerOptions(tsconfigPath: string): ts.CompilerOptions {
	const configFile = ts.readConfigFile(tsconfigPath, (filePath) =>
		ts.sys.readFile(filePath),
	);
	if (configFile.error) {
		throw new Error(
			`Unable to read ${tsconfigPath}: ${formatDiagnostic(configFile.error)}`,
		);
	}

	const parsedConfig = ts.parseJsonConfigFileContent(
		configFile.config,
		ts.sys,
		dirname(tsconfigPath),
		undefined,
		tsconfigPath,
	);
	if (parsedConfig.errors.length > 0) {
		throw new Error(
			`Unable to parse ${tsconfigPath}: ${parsedConfig.errors.map(formatDiagnostic).join("\n")}`,
		);
	}

	return parsedConfig.options;
}

function isPathWithin(rootPath: string, candidatePath: string): boolean {
	const relativePath = relative(rootPath, candidatePath);
	return (
		relativePath === "" ||
		(!isAbsolute(relativePath) &&
			relativePath !== ".." &&
			!relativePath.startsWith(`..${sep}`))
	);
}

function resolveRepositoryOwnedSourceModule(
	importer: string,
	specifier: string,
	compilerOptions: ts.CompilerOptions,
	sourceRoot: string,
): string | null {
	const resolution = ts.resolveModuleName(
		specifier,
		importer,
		compilerOptions,
		ts.sys,
	).resolvedModule;
	if (!resolution) {
		if (!specifier.startsWith(".")) return null;
		throw new Error(
			`Unable to resolve repository-local runtime import ${JSON.stringify(specifier)} from ${importer}`,
		);
	}

	const resolvedPath = realpathSync(resolution.resolvedFileName);
	// Deliberately stop at repository-owned source. Runtime compatibility for
	// third-party node_modules is exercised by the worker HTTP bundle test.
	if (resolvedPath.split(sep).includes("node_modules")) return null;
	if (!isPathWithin(sourceRoot, resolvedPath)) return null;

	return resolvedPath;
}

function formatModule(filePath: string, sourceRoot: string): string {
	const relativePath = relative(sourceRoot, filePath);
	if (isPathWithin(sourceRoot, filePath)) {
		return `src/${relativePath.split(sep).join("/")}`;
	}
	return filePath;
}

function isNodeOwnedModule(filePath: string, sourceRoot: string): boolean {
	if (!isPathWithin(sourceRoot, filePath)) return false;
	const relativePath = relative(sourceRoot, filePath).split(sep).join("/");
	return relativePath === "node" || relativePath.startsWith("node/");
}

function findRuntimeBoundaryViolations({
	entrypoints,
	sourceRoot,
	compilerOptions: explicitCompilerOptions,
	tsconfigPath,
}: RuntimeBoundaryOptions): string[] {
	const normalizedSourceRoot = realpathSync(sourceRoot);
	const compilerOptions =
		explicitCompilerOptions ??
		(tsconfigPath ? readCompilerOptions(tsconfigPath) : {});
	const visited = new Set<string>();
	const violations: string[] = [];

	function traverse(filePath: string, chain: string[]) {
		const normalizedFilePath = realpathSync(filePath);
		if (visited.has(normalizedFilePath)) return;
		visited.add(normalizedFilePath);

		const sourceText = readFileSync(normalizedFilePath, "utf8");
		const sourceFile = ts.createSourceFile(
			normalizedFilePath,
			sourceText,
			ts.ScriptTarget.Latest,
			true,
		);

		for (const specifier of getRuntimeSpecifiers(sourceFile)) {
			if (isBuiltin(specifier)) {
				violations.push([...chain, specifier].join(" -> "));
				continue;
			}

			const resolvedModule = resolveRepositoryOwnedSourceModule(
				normalizedFilePath,
				specifier,
				compilerOptions,
				normalizedSourceRoot,
			);
			if (!resolvedModule) continue;
			const nextChain = [
				...chain,
				formatModule(resolvedModule, normalizedSourceRoot),
			];
			if (isNodeOwnedModule(resolvedModule, normalizedSourceRoot)) {
				violations.push(nextChain.join(" -> "));
				continue;
			}
			traverse(resolvedModule, nextChain);
		}
	}

	for (const entrypoint of entrypoints) {
		const normalizedEntrypoint = realpathSync(entrypoint);
		if (!isPathWithin(normalizedSourceRoot, normalizedEntrypoint)) {
			throw new Error(
				`Worker boundary entrypoint is outside repository source root: ${normalizedEntrypoint}`,
			);
		}
		traverse(normalizedEntrypoint, [
			formatModule(normalizedEntrypoint, normalizedSourceRoot),
		]);
	}

	return violations;
}

function assertWorkerRuntimeBoundary(options: RuntimeBoundaryOptions): void {
	const violations = findRuntimeBoundaryViolations(options);
	if (violations.length === 0) return;
	throw new Error(
		[
			"Worker-safe repository source dependency boundary violated (third-party node_modules excluded):",
			...violations.map((chain) => `- ${chain}`),
		].join("\n"),
	);
}

const temporaryDirectories: string[] = [];

function createFixture(files: Record<string, string>) {
	const root = mkdtempSync(join(tmpdir(), "hevy-mcp-boundary-"));
	temporaryDirectories.push(root);
	const sourceRoot = join(root, "src");

	for (const [filePath, contents] of Object.entries(files)) {
		const destination = join(sourceRoot, filePath);
		mkdirSync(dirname(destination), { recursive: true });
		writeFileSync(destination, contents);
	}

	return { root, sourceRoot };
}

describe("Worker repository source runtime dependency boundary", () => {
	afterEach(() => {
		for (const directory of temporaryDirectories.splice(0)) {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("keeps repository-owned shared-server and worker dependencies free of Node runtime imports", () => {
		const sourceRoot = dirname(fileURLToPath(import.meta.url));

		expect(() =>
			assertWorkerRuntimeBoundary({
				sourceRoot,
				tsconfigPath: join(sourceRoot, "..", "tsconfig.json"),
				entrypoints: [
					join(sourceRoot, "shared-server.ts"),
					join(sourceRoot, "worker.ts"),
				],
			}),
		).not.toThrow();
	});

	it.each(["node:fs", "fs", "fs/promises", "path", "crypto", "node:test"])(
		"reports the full local chain to synthetic Node builtin %s",
		(specifier) => {
			const { sourceRoot } = createFixture({
				"entry.ts": 'import "./middle.js";',
				"middle.ts": `import ${JSON.stringify(specifier)};`,
			});

			expect(() =>
				assertWorkerRuntimeBoundary({
					sourceRoot,
					entrypoints: [join(sourceRoot, "entry.ts")],
				}),
			).toThrow(
				[
					"Worker-safe repository source dependency boundary violated (third-party node_modules excluded):",
					`- src/entry.ts -> src/middle.ts -> ${specifier}`,
				].join("\n"),
			);
		},
	);

	it("reports the full local chain to a synthetic src/node module", () => {
		const { sourceRoot } = createFixture({
			"entry.ts": 'export * from "./middle.js";',
			"middle.ts": 'import "./node/config.js";',
			"node/config.ts": "export const config = {};",
		});

		expect(() =>
			assertWorkerRuntimeBoundary({
				sourceRoot,
				entrypoints: [join(sourceRoot, "entry.ts")],
			}),
		).toThrow("src/entry.ts -> src/middle.ts -> src/node/config.ts");
	});

	it("reports the full local chain through a configured TypeScript alias", () => {
		const { sourceRoot } = createFixture({
			"entry.ts": 'export * from "./middle.js";',
			"middle.ts": 'import "@node/config";',
			"node/config.ts": "export const config = {};",
		});

		expect(() =>
			assertWorkerRuntimeBoundary({
				sourceRoot,
				entrypoints: [join(sourceRoot, "entry.ts")],
				compilerOptions: {
					baseUrl: sourceRoot,
					module: ts.ModuleKind.ESNext,
					moduleResolution: ts.ModuleResolutionKind.Bundler,
					paths: { "@node/*": ["node/*"] },
				},
			}),
		).toThrow("src/entry.ts -> src/middle.ts -> src/node/config.ts");
	});

	it("ignores type-only imports and exports", () => {
		const { sourceRoot } = createFixture({
			"entry.ts": [
				'import type { Stats } from "node:fs";',
				'export type { NodeConfig } from "./node/config.js";',
			].join("\n"),
			"node/config.ts": [
				'import "node:crypto";',
				"export interface NodeConfig {}",
			].join("\n"),
		});

		expect(() =>
			assertWorkerRuntimeBoundary({
				sourceRoot,
				entrypoints: [join(sourceRoot, "entry.ts")],
			}),
		).not.toThrow();
	});
});
