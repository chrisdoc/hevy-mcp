import { defineRule } from "@oxlint/plugins";
import type { ESTree, SourceCode } from "@oxlint/plugins";

type ConditionalEmptyObjectSpread = {
	readonly conditional: ESTree.ConditionalExpression;
	readonly property: ESTree.ObjectProperty | null;
};

type UndefinedCheckedExpression = {
	readonly expression: ESTree.Expression;
	readonly isDefinedWhenTrue: boolean;
};

function unwrapParentheses(node: ESTree.Expression): ESTree.Expression {
	let current = node;
	while (current.type === "ParenthesizedExpression") {
		current = current.expression;
	}
	return current;
}

function isEmptyObjectExpression(node: ESTree.Expression): boolean {
	return node.type === "ObjectExpression" && node.properties.length === 0;
}

function singleObjectProperty(
	node: ESTree.Expression,
): ESTree.ObjectProperty | null {
	if (node.type !== "ObjectExpression" || node.properties.length !== 1)
		return null;

	const [property] = node.properties;
	if (
		property?.type !== "Property" ||
		property.kind !== "init" ||
		property.method ||
		property.computed
	) {
		return null;
	}

	return property;
}

function conditionalEmptyObjectSpread(
	node: ESTree.Expression,
): ConditionalEmptyObjectSpread | null {
	const conditional = unwrapParentheses(node);
	if (conditional.type !== "ConditionalExpression") return null;

	if (isEmptyObjectExpression(conditional.consequent)) {
		return {
			conditional,
			property: singleObjectProperty(conditional.alternate),
		};
	}

	if (isEmptyObjectExpression(conditional.alternate)) {
		return {
			conditional,
			property: singleObjectProperty(conditional.consequent),
		};
	}

	return null;
}

function undefinedCheckedExpression(
	test: ESTree.Expression,
): UndefinedCheckedExpression | null {
	const binary = unwrapParentheses(test);
	if (binary.type !== "BinaryExpression") return null;
	if (binary.operator !== "===" && binary.operator !== "!==") return null;

	const left = unwrapParentheses(binary.left);
	const right = unwrapParentheses(binary.right);
	const leftIsUndefined =
		left.type === "Identifier" && left.name === "undefined";
	const rightIsUndefined =
		right.type === "Identifier" && right.name === "undefined";
	if (leftIsUndefined === rightIsUndefined) return null;

	return {
		expression: leftIsUndefined ? right : left,
		isDefinedWhenTrue: binary.operator === "!==",
	};
}

function canAutofixConditionalEmptyObjectSpread(
	sourceCode: SourceCode,
	conditional: ESTree.ConditionalExpression,
	property: ESTree.ObjectProperty,
): boolean {
	const checked = undefinedCheckedExpression(conditional.test);
	if (checked === null) return false;

	const propertyIsConsequent = conditional.consequent === property.parent;
	if (propertyIsConsequent !== checked.isDefinedWhenTrue) return false;

	return (
		sourceCode.getText(unwrapParentheses(checked.expression)) ===
		sourceCode.getText(property.value)
	);
}

/**
 * Discourage conditional empty-object spreads (`...(c ? { k: v } : {})`).
 *
 * Rationale: the spread hides whether the key is present, which matters for
 * serialization contracts (absent vs `undefined`). Now warn-severity: visible
 * without blocking. The autofix covers only the guarded property pattern;
 * other shapes can alter the in-memory contract, so migrate those by hand
 * (see docs/anti-slop-migration.md).
 *
 * Good: explicit branches or `optionalProperty()` helpers
 * Bad: `...(edit ? { end_date } : {})`
 */
export const noConditionalEmptyObjectSpreadRule = defineRule({
	meta: {
		type: "suggestion",
		fixable: "code",
		docs: {
			description:
				"Disallow object spreads that conditionally spread an empty object to omit fields.",
		},
		messages: {
			avoid:
				"Do not use conditional empty-object spreads. Prefer a direct property or build the object in separate statements.",
		},
	},
	create(context) {
		return {
			SpreadElement(node) {
				if (node.parent.type !== "ObjectExpression") return;

				const match = conditionalEmptyObjectSpread(node.argument);
				if (match === null) return;

				const { conditional, property } = match;
				if (
					property !== null &&
					canAutofixConditionalEmptyObjectSpread(
						context.sourceCode,
						conditional,
						property,
					)
				) {
					context.report({
						node,
						messageId: "avoid",
						fix: (fixer) =>
							fixer.replaceText(node, context.sourceCode.getText(property)),
					});
					return;
				}

				context.report({ node, messageId: "avoid" });
			},
		};
	},
});
