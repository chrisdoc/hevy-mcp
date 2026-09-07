import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

type Parameter = ESTree.ParamPattern;
type ParameterOwner =
	| ESTree.ArrowFunctionExpression
	| ESTree.Function
	| ESTree.TSCallSignatureDeclaration
	| ESTree.TSConstructSignatureDeclaration
	| ESTree.TSConstructorType
	| ESTree.TSFunctionType
	| ESTree.TSMethodSignature;

function parameterAnnotation(
	parameter: Parameter,
): ESTree.TSTypeAnnotation | null | undefined {
	if (parameter.type === "TSParameterProperty") {
		return parameterAnnotation(parameter.parameter);
	}
	if (parameter.type === "RestElement") {
		return parameter.typeAnnotation ?? parameterAnnotation(parameter.argument);
	}
	if (parameter.type === "AssignmentPattern") {
		return parameter.typeAnnotation ?? parameter.left.typeAnnotation;
	}
	return parameter.typeAnnotation;
}

function parameterName(parameter: Parameter, sourceText: string): string {
	if (parameter.type === "TSParameterProperty") {
		return parameterName(parameter.parameter, sourceText);
	}
	if (parameter.type === "AssignmentPattern") {
		return parameterName(parameter.left, sourceText);
	}
	if (parameter.type === "RestElement") {
		return parameterName(parameter.argument, sourceText);
	}
	return parameter.type === "Identifier"
		? parameter.name
		: sourceText.replace(/\s*:\s*unknown\s*$/u, "");
}

function unwrapIdentifier(parameter: Parameter): string | null {
	const target =
		parameter.type === "AssignmentPattern" ? parameter.left : parameter;
	if (target.type !== "Identifier") return null;
	return target.name;
}

function calleeName(callee: ESTree.Expression): string | null {
	if (callee.type === "Identifier") return callee.name;
	if (
		callee.type === "MemberExpression" &&
		callee.property.type === "Identifier"
	) {
		return callee.property.name;
	}
	return null;
}

function isGuardName(name: string | null): boolean {
	return (
		name !== null &&
		/^(is|has|can|should|assert|check|validate|classify|normalize|parse|decode|ensure)[A-Z0-9_]/u.test(
			name,
		)
	);
}

function isNameReference(node: ESTree.Node, name: string): boolean {
	return node.type === "Identifier" && node.name === name;
}

function isAssertionName(name: string | null): boolean {
	return name !== null && /^(assert|ensure)[A-Z0-9_]/u.test(name);
}

/**
 * A guard call whose result is discarded narrows nothing: `isError(error);
 * return error` still leaves `error` unknown. Assertion-style calls
 * (`assertX`, `ensureX`) narrow past the statement by convention; anything
 * else must feed a condition, an assignment, or a return to count.
 */
function isDiscardedCall(node: ESTree.Node): boolean {
	let parent: ESTree.Node | null | undefined = node.parent;
	while (parent) {
		if (parent.type === "ExpressionStatement") return true;
		if (
			parent.type === "AwaitExpression" ||
			parent.type === "YieldExpression" ||
			parent.type === "UnaryExpression" ||
			parent.type === "ParenthesizedExpression" ||
			parent.type === "ChainExpression"
		) {
			parent = parent.parent;
			continue;
		}
		return false;
	}
	return false;
}

function isSyntaxNode(value: unknown): value is ESTree.Node {
	return value instanceof Object && "type" in value;
}

function childNodes(node: ESTree.Node): ESTree.Node[] {
	const children: ESTree.Node[] = [];
	for (const [key, value] of Object.entries(node)) {
		if (key === "parent") continue;
		if (value instanceof Object) {
			if (Array.isArray(value)) {
				for (const item of value) {
					if (isSyntaxNode(item)) children.push(item);
				}
			} else if (isSyntaxNode(value)) {
				children.push(value);
			}
		}
	}
	return children;
}

function isNestedFunction(node: ESTree.Node): boolean {
	return (
		node.type === "ArrowFunctionExpression" ||
		node.type === "FunctionDeclaration" ||
		node.type === "FunctionExpression"
	);
}

function bodyNarrowsParameter(
	statements: ESTree.Node[],
	name: string,
): boolean {
	const visit = (node: ESTree.Node): boolean => {
		if (
			node.type === "BinaryExpression" &&
			(node.operator === "instanceof" || node.operator === "in") &&
			(isNameReference(node.left, name) || isNameReference(node.right, name))
		) {
			return true;
		}
		if (
			node.type === "CallExpression" &&
			isGuardName(calleeName(node.callee)) &&
			node.arguments.some(
				(argument) =>
					argument.type !== "SpreadElement" && isNameReference(argument, name),
			) &&
			(!isDiscardedCall(node) || isAssertionName(calleeName(node.callee)))
		) {
			return true;
		}
		if (isNestedFunction(node)) return false;
		return childNodes(node).some(visit);
	};
	return statements.some(visit);
}

function functionBodyStatements(node: ParameterOwner): ESTree.Node[] | null {
	if (
		node.type !== "ArrowFunctionExpression" &&
		node.type !== "FunctionDeclaration" &&
		node.type !== "FunctionExpression"
	) {
		return null;
	}
	const body = node.body;
	if (body === null || body === undefined) return null;
	if (body.type !== "BlockStatement") {
		return node.type === "ArrowFunctionExpression" ? [body] : null;
	}
	return [...body.body];
}

/** Exempt `error: unknown` when the body genuinely narrows it. */
function isNarrowedInBody(node: ParameterOwner, parameter: Parameter): boolean {
	const name = unwrapIdentifier(parameter);
	if (name === null) return false;
	const statements = functionBodyStatements(node);
	if (statements === null) return false;
	return bodyNarrowsParameter(statements, name);
}

/**
 * Disallow unknown inputs except narrowed failure causes.
 *
 * Rationale: `unknown` parameters push validation onto every caller. Name the
 * failure cause `cause`, or narrow an `error` parameter in the body with
 * `instanceof` / `in` / guard calls — the exemption recognizes genuine
 * narrowing (a discarded guard call does not narrow, except `assert*` /
 * `ensure*` by convention) so classifiers are not forced into dishonest
 * names.
 */
export const noUnknownParametersRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow explicitly unknown function parameters except `cause`; decode unknown input at its I/O boundary instead.",
		},
		messages: {
			unknownParameter:
				"Parameter `{{parameter}}` accepts `unknown` without establishing its contract. Define the expected schema or parser so the value becomes a strongly typed domain type at the earliest possible point, as close as possible to the I/O boundary where the data originated.",
		},
	},
	create(context) {
		const checkParameters = (node: ParameterOwner) => {
			for (const parameter of node.params) {
				const annotation = parameterAnnotation(parameter);
				if (annotation?.typeAnnotation.type !== "TSUnknownKeyword") continue;
				const name = parameterName(
					parameter,
					context.sourceCode.getText(parameter),
				);
				if (name === "cause") continue;
				if (isNarrowedInBody(node, parameter)) continue;
				context.report({
					node: annotation.typeAnnotation,
					messageId: "unknownParameter",
					data: { parameter: name },
				});
			}
		};

		return {
			ArrowFunctionExpression: checkParameters,
			FunctionDeclaration: checkParameters,
			FunctionExpression: checkParameters,
			TSCallSignatureDeclaration: checkParameters,
			TSConstructSignatureDeclaration: checkParameters,
			TSConstructorType: checkParameters,
			TSDeclareFunction: checkParameters,
			TSEmptyBodyFunctionExpression: checkParameters,
			TSFunctionType: checkParameters,
			TSMethodSignature: checkParameters,
		};
	},
});
