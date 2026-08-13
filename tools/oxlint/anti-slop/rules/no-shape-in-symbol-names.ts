import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

const FORBIDDEN_SYMBOL_NAME = "shape";

function containsForbiddenSymbolName(name: string): boolean {
	return name.toLowerCase().includes(FORBIDDEN_SYMBOL_NAME);
}

/** Ban the case-insensitive substring "shape" in every JavaScript and TypeScript symbol name. */
export const noForbiddenTermInSymbolNamesRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				'Disallow the case-insensitive substring "shape" in JavaScript, TypeScript, private, and JSX symbol names.',
		},
		messages: {
			forbiddenSymbolName:
				'Do not use the case-insensitive substring "shape" in symbol names (found "{{name}}").',
		},
	},
	create(context) {
		const reportForbiddenSymbolName = (
			node: ESTree.Node & { name: string },
		) => {
			if (!containsForbiddenSymbolName(node.name)) return;
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
