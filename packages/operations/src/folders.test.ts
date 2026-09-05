import { HevyHttpError, NotFoundError } from "@hevy-mcp/hevy-client";
import type {
	GetV1RoutineFolders200,
	PostRoutineFolderRequestBody,
	PostV1RoutineFolders201,
	RoutineFolder,
} from "@hevy-mcp/hevy-client/types";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import {
	createFoldersCreateOperation,
	createFoldersGetOperation,
	createFoldersListAllOperation,
	type FoldersListAllAdapter,
} from "./folders.js";

function notFound(endpoint: string): NotFoundError {
	return new NotFoundError({
		status: 404,
		method: "GET",
		endpoint,
		expected: true,
	});
}

describe("folders.get operation", () => {
	it("returns the folder entity and id with a read descriptor", async () => {
		const getRoutineFolder = vi.fn(() =>
			Effect.succeed<RoutineFolder>({ id: 42, title: "Push" }),
		);
		const operation = createFoldersGetOperation({ getRoutineFolder });
		const options = { timeoutMs: 1_000 };

		await expect(
			Effect.runPromise(operation.effect({ folderId: "42" }, options)),
		).resolves.toEqual({
			routineFolder: { id: 42, title: "Push" },
			folderId: "42",
		});
		expect(operation.descriptor).toEqual({
			id: "folders.get",
			safety: "read",
		});
		expect(getRoutineFolder).toHaveBeenCalledWith("42", options);
	});

	it("recovers only a member 404 as not_found", async () => {
		const getRoutineFolder = vi.fn(() =>
			Effect.fail(notFound("/v1/routine_folders/42")),
		);
		const operation = createFoldersGetOperation({ getRoutineFolder });

		await expect(
			Effect.runPromise(operation.effect({ folderId: "42" })),
		).resolves.toEqual({
			routineFolder: null,
			folderId: "42",
			expected404Outcome: "not_found",
		});
	});

	it("fails a collection or unrelated 404", async () => {
		for (const endpoint of [
			"/v1/routine_folders",
			"/v1/exercise_templates/template-1",
		]) {
			const error = notFound(endpoint);
			const operation = createFoldersGetOperation({
				getRoutineFolder: vi.fn(() => Effect.fail(error)),
			});

			await expect(
				Effect.runPromise(operation.effect({ folderId: "42" })),
			).rejects.toBe(error);
		}
	});
});

describe("folders.create operation", () => {
	it("posts the caller folder body through the Effect adapter", async () => {
		const body: PostRoutineFolderRequestBody = {
			routine_folder: { title: "Push" },
		};
		const created: PostV1RoutineFolders201 = { id: 42, title: "Push" };
		const createRoutineFolder = vi.fn(() => Effect.succeed(created));
		const operation = createFoldersCreateOperation({ createRoutineFolder });

		await expect(Effect.runPromise(operation.effect(body))).resolves.toEqual(
			created,
		);
		expect(createRoutineFolder).toHaveBeenCalledWith(body);
	});
});

describe("folders.listAll operation", () => {
	it("concatenates pages at page size ten and forwards options", async () => {
		const requests: Array<{
			readonly params: Parameters<
				FoldersListAllAdapter["getRoutineFolders"]
			>[0];
			readonly options: Parameters<
				FoldersListAllAdapter["getRoutineFolders"]
			>[1];
		}> = [];
		const responses: GetV1RoutineFolders200[] = [
			{
				page: 1,
				page_count: 2,
				routine_folders: [{ id: 1, title: "Push" }],
			},
			{
				page: 2,
				page_count: 2,
				routine_folders: [{ id: 2, title: "Pull" }],
			},
		];
		const options = { timeoutMs: 1_000 };
		const getRoutineFolders = vi.fn((params, requestOptions) => {
			requests.push({ params, options: requestOptions });
			return Effect.succeed(responses[(params?.page ?? 1) - 1] ?? {});
		});
		const operation = createFoldersListAllOperation({ getRoutineFolders });

		await expect(Effect.runPromise(operation.effect(options))).resolves.toEqual(
			[
				{ id: 1, title: "Push" },
				{ id: 2, title: "Pull" },
			],
		);
		expect(requests).toEqual([
			{ params: { page: 1, pageSize: 10 }, options },
			{ params: { page: 2, pageSize: 10 }, options },
		]);
	});

	it("stops on an empty page and does not request beyond page_count", async () => {
		const getRoutineFolders = vi
			.fn<FoldersListAllAdapter["getRoutineFolders"]>()
			.mockImplementation((params) =>
				Effect.succeed(
					params?.page === 1
						? {
								page: 1,
								page_count: 4,
								routine_folders: [{ id: 1 }],
							}
						: { page: params?.page, page_count: 4, routine_folders: [] },
				),
			);
		const operation = createFoldersListAllOperation({ getRoutineFolders });

		await expect(Effect.runPromise(operation.effect())).resolves.toEqual([
			{ id: 1 },
		]);
		expect(getRoutineFolders).toHaveBeenCalledTimes(2);
	});

	it("ends on a later-page 404 but fails on a first-page 404", async () => {
		const laterPageError = notFound("/v1/routine_folders");
		const laterPageAdapter = {
			getRoutineFolders: vi
				.fn<FoldersListAllAdapter["getRoutineFolders"]>()
				.mockImplementation((params) =>
					params?.page === 1
						? Effect.succeed({
								page: 1,
								page_count: 3,
								routine_folders: [{ id: 1 }],
							})
						: Effect.fail(laterPageError),
				),
		};
		const laterPageOperation = createFoldersListAllOperation(laterPageAdapter);

		await expect(
			Effect.runPromise(laterPageOperation.effect()),
		).resolves.toEqual([{ id: 1 }]);

		const firstPageError = notFound("/v1/routine_folders");
		const firstPageOperation = createFoldersListAllOperation({
			getRoutineFolders: vi
				.fn<FoldersListAllAdapter["getRoutineFolders"]>()
				.mockReturnValue(Effect.fail(firstPageError)),
		});

		await expect(Effect.runPromise(firstPageOperation.effect())).rejects.toBe(
			firstPageError,
		);
	});

	it("does not recover a member-path 404 while listing", async () => {
		const error = new HevyHttpError("not found", {
			status: 404,
			method: "GET",
			endpoint: "/v1/routine_folders/42",
		});
		const operation = createFoldersListAllOperation({
			getRoutineFolders: vi
				.fn<FoldersListAllAdapter["getRoutineFolders"]>()
				.mockReturnValue(Effect.fail(error)),
		});

		await expect(Effect.runPromise(operation.effect())).rejects.toBe(error);
	});
});
