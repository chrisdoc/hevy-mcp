import { Effect, Option, Predicate, Stream } from "effect";
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
	isExpectedReadEndOfList,
	isExpectedReadNotFound,
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

function hasNextFoldersPage(
	pageCount: number | undefined,
	page: number,
	folders: readonly RoutineFolder[],
): boolean {
	return (
		folders.length > 0 &&
		Predicate.isNumber(pageCount) &&
		Number.isSafeInteger(pageCount) &&
		pageCount > page
	);
}

export function createFoldersGetOperation(
	adapter: FoldersGetAdapter,
): FoldersGetOperation {
	const effect = Effect.fn("operations.folders.get")(function* (
		input: FoldersGetInput,
		options?: HevyExecutionOptions,
	) {
		const request =
			options === undefined
				? adapter.getRoutineFolder(input.folderId)
				: adapter.getRoutineFolder(input.folderId, options);
		return yield* request.pipe(
			Effect.map((routineFolder) => ({
				routineFolder: isEmptyResponse(routineFolder)
					? null
					: (routineFolder ?? null),
				folderId: input.folderId,
			})),
			Effect.catchIf(
				(error) => isExpectedReadNotFound(error, "/v1/routine_folders"),
				() =>
					Effect.succeed({
						routineFolder: null,
						folderId: input.folderId,
						expected404Outcome: "not_found" as const,
					}),
			),
		);
	});

	const operation: FoldersGetOperation = {
		descriptor: foldersGetDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}

export function createFoldersCreateOperation(
	adapter: FoldersCreateAdapter,
): FoldersCreateOperation {
	const effect = Effect.fn("operations.folders.create")(function* (
		input: FoldersCreateInput,
		options?: HevyExecutionOptions,
	) {
		const request =
			options === undefined
				? adapter.createRoutineFolder(input)
				: adapter.createRoutineFolder(input, options);
		const response = yield* request;
		return isEmptyResponse(response) ? undefined : response;
	});

	const operation: FoldersCreateOperation = {
		descriptor: foldersCreateDescriptor,
		effect,
		execute(input, options) {
			return Effect.runPromise(operation.effect(input, options));
		},
	};
	return operation;
}

function isEmptyResponse<T extends object>(
	response: T | null | undefined,
): response is T & Record<never, never> {
	return (
		response !== null &&
		response !== undefined &&
		Object.keys(response).length === 0
	);
}

export function createFoldersListAllOperation(
	adapter: FoldersListAllAdapter,
): FoldersListAllOperation {
	const effect = Effect.fn("operations.folders.listAll")(function* (
		options?: HevyExecutionOptions,
	) {
		const pageStream = Stream.paginate<
			FoldersListCursor,
			FoldersListPage,
			HevyRequestEffectError | PaginationMismatchError
		>({ page: 1 }, (cursor) => {
			const params = { page: cursor.page, pageSize: FOLDERS_PAGE_SIZE };
			const request =
				options === undefined
					? adapter.getRoutineFolders(params)
					: adapter.getRoutineFolders(params, options);
			return request.pipe(
				Effect.flatMap((response: GetV1RoutineFolders200) => {
					if (response?.page !== undefined && response.page !== cursor.page) {
						return Effect.fail(
							new PaginationMismatchError({
								requested: cursor.page,
								received: response.page,
								collection: "routineFolders",
								message: `Routine folders page mismatch: requested page ${cursor.page} but received page ${response.page}`,
							}),
						);
					}

					const folders = response?.routine_folders ?? [];
					return Effect.succeed([
						[{ folders }],
						hasNextFoldersPage(response?.page_count, cursor.page, folders)
							? Option.some({ page: cursor.page + 1 })
							: Option.none(),
					] as const);
				}),
				Effect.catchIf(
					(error) =>
						isExpectedReadEndOfList(error, "/v1/routine_folders", cursor.page),
					() => Effect.succeed([[], Option.none<FoldersListCursor>()] as const),
				),
			);
		});
		const pages = yield* Stream.runCollect(pageStream);
		return pages.flatMap((page) => page.folders);
	});

	const operation: FoldersListAllOperation = {
		descriptor: foldersListAllDescriptor,
		effect,
		execute(options) {
			return Effect.runPromise(operation.effect(options));
		},
	};
	return operation;
}
