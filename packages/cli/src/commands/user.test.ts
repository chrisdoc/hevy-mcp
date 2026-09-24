import { execute } from "./index.js";
import {
	asCommandOperations,
	commandArgs,
	commandClient,
	commandOperation,
} from "./test-support.js";
import { describe, expect, it } from "vitest";

describe("user command", () => {
	it("retains the user data envelope", async () => {
		const get = commandOperation("user.get", { id: "user-1" });
		const operations = asCommandOperations({ user: { get } });

		await expect(
			execute(
				commandArgs("user"),
				commandClient(),
				undefined,
				undefined,
				operations,
			),
		).resolves.toEqual({ user: { data: { id: "user-1" } } });
		expect(get.effect).toHaveBeenCalledWith(undefined);
	});
});
