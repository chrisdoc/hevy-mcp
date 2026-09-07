import { defineRule } from "@oxlint/plugins";

/**
 * Disallow runtime `typeof` narrowing in favor of decoders and predicates.
 *
 * Rationale: `typeof x === "string"` proves little and composes poorly;
 * `Predicate.isString` / schema decoders carry the contract. Use the
 * `Effect` `Predicate` module or a Zod/Schema parse at the boundary.
 *
 * Good: `Predicate.isString(value)`, `Schema.decode(...)`
 * Bad: `typeof value === "string" ? value.toUpperCase() : ...`
 */
export const noRuntimeTypeofRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow runtime typeof checks; external values must be decoded into meaningful types at their I/O boundary.",
		},
		messages: {
			runtimeTypeof:
				"A runtime `typeof` check only narrows an unparsed representation; it does not establish the expected contract. Parse the value into a strongly typed domain type at the earliest possible point, as close as possible to the I/O boundary where the data originated.",
		},
	},
	create(context) {
		return {
			UnaryExpression(node) {
				if (node.operator === "typeof") {
					context.report({ node, messageId: "runtimeTypeof" });
				}
			},
		};
	},
});
