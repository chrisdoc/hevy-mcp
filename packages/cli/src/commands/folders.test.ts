import { execute } from "./index.js";
import {
	asCommandOperations,
	commandArgs,
	commandClient,
	commandOperation,
	mutationOptions,
} from "./test-support.js";
import { describe, expect, it } from "vitest";

describe("folder commands", () => {
	it("requires confirmation and returns the created folder", async () => {
		const create = commandOperation("folders.create", { id: "folder-1" });
		const operations = asCommandOperations({ folders: { create } });
		const data = { routine_folder: { title: "Strength" } };

		await expect(
			execute(
				commandArgs("folders", "create", [], mutationOptions(data)),
				commandClient(),
				undefined,
				undefined,
				operations,
			),
		).resolves.toEqual({ routine_folder: { id: "folder-1" } });
		expect(create.effect).toHaveBeenCalledWith(data, undefined);
	});
});
