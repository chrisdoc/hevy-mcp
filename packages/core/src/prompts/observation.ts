import { memoizeObservationScope, type ToolObserver } from "../observation.js";
import { resolveErrorPolicy } from "../utils/error-policy.js";
import { bucketCount } from "../utils/result-telemetry.js";

export type PromptResult = {
	messages: Array<{
		role: "user" | "assistant";
		content: { type: "text"; text: string };
	}>;
};

async function observePrompt(
	name: string,
	observer: ToolObserver | undefined,
	argumentKeys: readonly "routineId"[],
	argumentPresence: { routineId?: true },
	argumentKeyCount: number,
	handler: () => Promise<PromptResult> | PromptResult,
): Promise<PromptResult> {
	const startedAt = Date.now();
	let scope;
	try {
		scope = memoizeObservationScope(
			observer?.start({
				name,
				kind: "prompt",
				argumentKeys,
				argumentPresence,
				argumentKeyCountBucket: bucketCount(argumentKeyCount),
			}),
		);
	} catch {
		scope = undefined;
	}

	try {
		const invoke = () => Promise.resolve(handler());
		const result = await (scope ? scope.run(invoke) : invoke());
		void scope?.finish({
			outcome: "success",
			durationMs: Date.now() - startedAt,
			result: {
				isError: false,
				hasStructuredContent: false,
				contentCountBucket: bucketCount(result.messages.length),
			},
		});
		return result;
	} catch (error) {
		const policy = resolveErrorPolicy(error, "MCP prompt failed");
		void scope?.finish({
			outcome: "thrown_error",
			durationMs: Date.now() - startedAt,
			errorType: policy.type,
			error: policy.diagnostic,
		});
		console.error("MCP prompt failure", policy.diagnostic);
		throw error;
	}
}

export function withPromptObservation<TArgs extends Record<string, unknown>>(
	name: string,
	observer: ToolObserver | undefined,
	handler: (args: TArgs) => Promise<PromptResult> | PromptResult,
) {
	return async (args: TArgs): Promise<PromptResult> => {
		const allArgumentKeys = Object.keys(args);
		const argumentKeys = allArgumentKeys.filter(
			(key) => key === "routineId",
		) as "routineId"[];
		return observePrompt(
			name,
			observer,
			argumentKeys,
			args.routineId ? { routineId: true } : {},
			allArgumentKeys.length,
			() => handler(args),
		);
	};
}

export function withNoArgumentPromptObservation(
	name: string,
	observer: ToolObserver | undefined,
	handler: () => Promise<PromptResult> | PromptResult,
) {
	return async (): Promise<PromptResult> =>
		observePrompt(name, observer, [], {}, 0, handler);
}
