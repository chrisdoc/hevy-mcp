import { NotFoundError } from "@hevy-mcp/hevy-client";
import type { UserInfo } from "@hevy-mcp/hevy-client/types";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { createUserGetOperation } from "./user.js";

describe("user.get operation", () => {
	it("returns the profile data rather than the response envelope", async () => {
		const data: UserInfo = {
			id: "user-1",
			name: "Chris",
			url: "https://hevy.com/user/chris",
		};
		const getUserInfo = vi.fn(() => Effect.succeed({ data }));
		const operation = createUserGetOperation({ getUserInfo });
		const options = { timeoutMs: 1_000 };

		await expect(Effect.runPromise(operation.effect(options))).resolves.toEqual(
			data,
		);
		expect(operation.descriptor).toEqual({
			id: "user.get",
			safety: "read",
		});
		expect(getUserInfo).toHaveBeenCalledWith(options);
	});

	it("keeps a 404 as a tagged failure", async () => {
		const error = new NotFoundError({
			status: 404,
			method: "GET",
			endpoint: "/v1/user/info",
			expected: false,
		});
		const operation = createUserGetOperation({
			getUserInfo: vi.fn(() => Effect.fail(error)),
		});

		await expect(Effect.runPromise(operation.effect())).rejects.toBe(error);
	});

	it("omits options when no execution options are supplied", async () => {
		const getUserInfo = vi.fn(() => Effect.succeed({ data: undefined }));
		const operation = createUserGetOperation({ getUserInfo });

		await expect(
			Effect.runPromise(operation.effect()),
		).resolves.toBeUndefined();
		expect(getUserInfo).toHaveBeenCalledWith();
	});
});
