import { Effect, Option, Stream } from "effect";
import { defineOperation } from "./define-operation.js";
import type {
	HevyExecutionOptions,
	HevyOperationSafety,
} from "@hevy-mcp/hevy-client";
import type {
	HevyRequestEffectClient,
	HevyRequestEffectError,
} from "@hevy-mcp/hevy-client/internal";
import type {
	GetV1RoutineFolders200,
	PostRoutineFolderRequestBody,
	PostV1RoutineFolders201,
	RoutineFolder,
} from "@hevy-mcp/hevy-client/types";
import {
	assertPageEcho,
	hasNextPage,
	isEmptyResponse,
	withExpectedEndOfList,
	withExpectedNotFound,
	PaginationMismatchError,
} from "./operation-errors.js";

export interface FoldersGetInput {
	readonly folderId: string;
}

export interface FoldersGetOutput {
	readonly routineFolder: RoutineFolder | null;
	readonly folderId: string;
	readonly expected404Outcome?: "not_found";
}

export type FoldersGetAdapter = Pick<
	HevyRequestEffectClient,
	"getRoutineFolder"
>;

export interface FoldersGetDescriptor {
	readonly id: "folders.get";
	readonly safety: Extract<HevyOperationSafety, "read">;
}

export const foldersGetDescriptor: FoldersGetDescriptor = {
	id: "folders.get",
	safety: "read",
};

export interface FoldersGetOperation {
	readonly descriptor: FoldersGetDescriptor;
	readonly effect: (
		input: FoldersGetInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<FoldersGetOutput, HevyRequestEffectError>;
	execute(
		input: FoldersGetInput,
		options?: HevyExecutionOptions,
	): Promise<FoldersGetOutput>;
}

export type FoldersCreateInput = PostRoutineFolderRequestBody;

export type FoldersCreateAdapter = Pick<
	HevyRequestEffectClient,
	"createRoutineFolder"
>;

export interface FoldersCreateDescriptor {
	readonly id: "folders.create";
	readonly safety: Extract<HevyOperationSafety, "non-idempotent-write">;
}

export const foldersCreateDescriptor: FoldersCreateDescriptor = {
	id: "folders.create",
	safety: "non-idempotent-write",
};

export interface FoldersCreateOperation {
	readonly descriptor: FoldersCreateDescriptor;
	readonly effect: (
		input: FoldersCreateInput,
		options?: HevyExecutionOptions,
	) => Effect.Effect<
		PostV1RoutineFolders201 | undefined,
		HevyRequestEffectError
	>;
	execute(
		input: FoldersCreateInput,
		options?: HevyExecutionOptions,
	): Promise<PostV1RoutineFolders201 | undefined>;
}

export type FoldersListAllAdapter = Pick<
	HevyRequestEffectClient,
	"getRoutineFolders"
>;

export interface FoldersListAllDescriptor {
	readonly id: "folders.listAll";
	readonly safety: Extract<HevyOperationSafety, "read">;
}

export const foldersListAllDescriptor: FoldersListAllDescriptor = {
	id: "folders.listAll",
	safety: "read",
};

export interface FoldersListAllOperation {
	readonly descriptor: FoldersListAllDescriptor;
	readonly effect: (
		options?: HevyExecutionOptions,
	) => Effect.Effect<
		RoutineFolder[],
		HevyRequestEffectError | PaginationMismatchError
	>;
	execute(options?: HevyExecutionOptions): Promise<RoutineFolder[]>;
}

const FOLDERS_PAGE_SIZE = 10;

type FoldersListCursor = {
	readonly page: number;
};

type FoldersListPage = {
	readonly folders: RoutineFolder[];
};

export function createFoldersGetOperation(
	adapter: FoldersGetAdapter,
): FoldersGetOperation {
	return defineOperation(
		foldersGetDescriptor,
		function* (input: FoldersGetInput, options?: HevyExecutionOptions) {
			const request = adapter.getRoutineFolder(input.folderId, options);
			return yield* request.pipe(
				Effect.map((routineFolder) => ({
					routineFolder: isEmptyResponse(routineFolder)
						? null
						: (routineFolder ?? null),
					folderId: input.folderId,
				})),
				withExpectedNotFound("/v1/routine_folders", {
					routineFolder: null,
					folderId: input.folderId,
					expected404Outcome: "not_found" as const,
				}),
			);
		},
	);
}

export function createFoldersCreateOperation(
	adapter: FoldersCreateAdapter,
): FoldersCreateOperation {
	return defineOperation(
		foldersCreateDescriptor,
		function* (input: FoldersCreateInput, options?: HevyExecutionOptions) {
			const request = adapter.createRoutineFolder(input, options);
			const response = yield* request;
			return isEmptyResponse(response) ? undefined : response;
		},
	);
}

export function createFoldersListAllOperation(
	adapter: FoldersListAllAdapter,
): FoldersListAllOperation {
	return defineOperation(
		foldersListAllDescriptor,
		function* (options?: HevyExecutionOptions) {
			const pageStream = Stream.paginate<
				FoldersListCursor,
				FoldersListPage,
				HevyRequestEffectError | PaginationMismatchError
			>({ page: 1 }, (cursor) => {
				const params = { page: cursor.page, pageSize: FOLDERS_PAGE_SIZE };
				const request = adapter.getRoutineFolders(params, options);
				return request.pipe(
					Effect.tap((response) =>
						assertPageEcho(response, cursor.page, "routineFolders"),
					),
					Effect.map((response: GetV1RoutineFolders200) => {
						const folders = response?.routine_folders ?? [];
						return [
							[{ folders }],
							hasNextPage(response?.page_count, cursor.page, folders.length)
								? Option.some({ page: cursor.page + 1 })
								: Option.none(),
						] as const;
					}),
					withExpectedEndOfList("/v1/routine_folders", cursor.page, [
						[],
						Option.none<FoldersListCursor>(),
					] as const),
				);
			});
			const pages = yield* Stream.runCollect(pageStream);
			return pages.flatMap((page) => page.folders);
		},
	);
}
