import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

const FORBIDDEN_SYMBOL_NAME = "shape";

function isForbiddenSymbolName(name: string): boolean {
	return name.toLowerCase() === FORBIDDEN_SYMBOL_NAME;
}

/**
 * Ban the bare name "shape" in JavaScript and TypeScript symbols.
 *
 * Origin: Zod schemas expose fields via `.shape`, and locals named `shape`
 * were repeatedly confused with schema shapes during review. Member accesses
 * (`schema.shape.page`) and object keys stay exempt — only standalone
 * bindings are flagged. Compounds (`reshape`, `shaped`) are intentionally
 * allowed: the hazard is the exact name, not the substring.
 *
 * Good: `const fields = schema.shape`, `reshape(input)`
 * Bad: `const shape = schema.shape`
 */
export const noForbiddenTermInSymbolNamesRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				'Disallow the bare name "shape" (case-insensitive) in JavaScript, TypeScript, private, and JSX symbols; member accesses and compounds are exempt.',
		},
		messages: {
			forbiddenSymbolName:
				'Do not name a standalone binding "shape" (found "{{name}}"); use a precise name or access the schema field directly.',
		},
	},
	create(context) {
		const reportForbiddenSymbolName = (
			node: ESTree.Node & { name: string },
		) => {
			if (!isForbiddenSymbolName(node.name)) return;
			const parent = node.parent;
			if (
				parent?.type === "TSQualifiedName" ||
				parent?.type === "TSTypeReference" ||
				(parent?.type === "MemberExpression" &&
					parent.property === node &&
					!parent.computed) ||
				(parent?.type === "Property" && parent.key === node && !parent.computed)
			) {
				return;
			}
			context.report({
				node,
				messageId: "forbiddenSymbolName",
				data: { name: node.name },
			});
		};

		return {
			Identifier: reportForbiddenSymbolName,
			PrivateIdentifier: reportForbiddenSymbolName,
			JSXIdentifier: reportForbiddenSymbolName,
		};
	},
});
