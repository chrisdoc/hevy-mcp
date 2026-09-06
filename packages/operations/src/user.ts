import { Effect } from "effect";
import type {
	HevyExecutionOptions,
	HevyOperationSafety,
} from "@hevy-mcp/hevy-client";
import type {
	HevyRequestEffectClient,
	HevyRequestEffectError,
} from "@hevy-mcp/hevy-client/internal";
import type { UserInfo } from "@hevy-mcp/hevy-client/types";

export type UserGetAdapter = Pick<HevyRequestEffectClient, "getUserInfo">;

export interface UserGetDescriptor {
	readonly id: "user.get";
	readonly safety: Extract<HevyOperationSafety, "read">;
}

export const userGetDescriptor: UserGetDescriptor = {
	id: "user.get",
	safety: "read",
};

export interface UserGetOperation {
	readonly descriptor: UserGetDescriptor;
	readonly effect: (
		options?: HevyExecutionOptions,
	) => Effect.Effect<UserInfo | undefined, HevyRequestEffectError>;
	execute(options?: HevyExecutionOptions): Promise<UserInfo | undefined>;
}

export function createUserGetOperation(
	adapter: UserGetAdapter,
): UserGetOperation {
	const effect = Effect.fn("operations.user.get")(function* (
		options?: HevyExecutionOptions,
	) {
		const request =
			options === undefined
				? adapter.getUserInfo()
				: adapter.getUserInfo(options);
		const response = yield* request;
		return response?.data;
	});

	const operation: UserGetOperation = {
		descriptor: userGetDescriptor,
		effect,
		execute(options) {
			return Effect.runPromise(operation.effect(options));
		},
	};
	return operation;
}
