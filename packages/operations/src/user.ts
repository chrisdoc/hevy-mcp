import type { Effect } from "effect";
import { defineOperation } from "./define-operation.js";
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
	return defineOperation(
		userGetDescriptor,
		function* (options?: HevyExecutionOptions) {
			const response = yield* adapter.getUserInfo(options);
			return response?.data;
		},
	);
}
