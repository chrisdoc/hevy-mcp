import { Cache, Effect } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it, vi } from "vitest";
import type { ExerciseTemplate } from "@hevy-mcp/hevy-client/types";
import type { HevyExecutionOptions } from "@hevy-mcp/hevy-client";
import type { TemplatesListAllOperation } from "@hevy-mcp/operations";
import {
	createExerciseTemplateCatalog,
	type ExerciseTemplateCatalog,
	type ExerciseTemplateCatalogCache,
	EXERCISE_TEMPLATE_CATALOG_CACHE_MAX_SIZE,
	EXERCISE_TEMPLATE_CATALOG_CACHE_TTL_MS,
} from "./exercise-template-catalog.js";

type ListAll = Pick<TemplatesListAllOperation, "effect">;
type ListAllError = Effect.Error<ReturnType<ListAll["effect"]>>;

function createCatalog(
	listAll: ListAll,
	cache?: ExerciseTemplateCatalogCache,
): ExerciseTemplateCatalog {
	const serverCache =
		cache ??
		Effect.runSync(
			Cache.make({
				capacity: EXERCISE_TEMPLATE_CATALOG_CACHE_MAX_SIZE,
				timeToLive: EXERCISE_TEMPLATE_CATALOG_CACHE_TTL_MS,
				lookup: (_key: string) => listAll.effect(),
			}),
		);
	return createExerciseTemplateCatalog({ templates: { listAll } }, serverCache);
}

function operation(effect: ListAll["effect"]): ListAll {
	return { effect };
}

describe("exercise template catalog", () => {
	it("reset clears the server cache and forces a fresh catalog request", async () => {
		const listAll = vi
			.fn<ListAll["effect"]>()
			.mockReturnValueOnce(Effect.succeed([{ id: "first" }]))
			.mockReturnValueOnce(Effect.succeed([{ id: "second" }]));
		const catalog = createCatalog(operation(listAll));

		await expect(catalog.get()).resolves.toMatchObject([{ id: "first" }]);
		await expect(catalog.get()).resolves.toMatchObject([{ id: "first" }]);
		catalog.reset();
		await expect(catalog.get()).resolves.toMatchObject([{ id: "second" }]);
		expect(listAll).toHaveBeenCalledTimes(2);
	});

	it("deduplicates concurrent cache misses", async () => {
		let resolveLookup: ((templates: ExerciseTemplate[]) => void) | undefined;
		const listAll = vi.fn<ListAll["effect"]>().mockImplementation(() =>
			Effect.callback<ExerciseTemplate[], ListAllError>((resume) => {
				resolveLookup = (templates) => resume(Effect.succeed(templates));
			}),
		);
		const catalog = createCatalog(operation(listAll));

		const first = Effect.runPromise(catalog.effect());
		const second = Effect.runPromise(catalog.effect());
		await Promise.resolve();
		expect(listAll).toHaveBeenCalledOnce();

		resolveLookup?.([{ id: "shared", title: "Shared" }]);
		await expect(Promise.all([first, second])).resolves.toEqual([
			[{ id: "shared", title: "Shared" }],
			[{ id: "shared", title: "Shared" }],
		]);
	});

	it("does not share controlled calls between independently cancellable callers", async () => {
		const firstController = new AbortController();
		const secondController = new AbortController();
		const listAll = vi
			.fn<ListAll["effect"]>()
			.mockImplementation((options?: HevyExecutionOptions) =>
				Effect.callback<ExerciseTemplate[], ListAllError>((resume) => {
					const signal = options?.signal;
					if (signal?.aborted) {
						resume(Effect.fail(signal.reason));
						return;
					}
					const onAbort = () =>
						resume(Effect.fail(signal?.reason ?? new Error("aborted")));
					signal?.addEventListener("abort", onAbort, { once: true });
					const template =
						signal === firstController.signal ? "first" : "second";
					const timer = setTimeout(
						() => resume(Effect.succeed([{ id: template }])),
						template === "first" ? 100 : 20,
					);
					return Effect.sync(() => {
						clearTimeout(timer);
						signal?.removeEventListener("abort", onAbort);
					});
				}),
			);
		const catalog = createCatalog(operation(listAll));

		const first = catalog.get({
			execution: { signal: firstController.signal },
		});
		const second = catalog.get({
			execution: { signal: secondController.signal },
		});
		firstController.abort(new DOMException("first canceled", "AbortError"));

		await expect(first).rejects.toMatchObject({ name: "AbortError" });
		await expect(second).resolves.toMatchObject([{ id: "second" }]);
		expect(listAll).toHaveBeenCalledTimes(2);
	});

	it("uses templates.listAll rather than a Promise client for lookup", async () => {
		const listAll = vi
			.fn<ListAll["effect"]>()
			.mockReturnValue(
				Effect.succeed([{ id: "template-1", title: "Template 1" }]),
			);
		const catalog = createCatalog(operation(listAll));

		await expect(catalog.get()).resolves.toEqual([
			{ id: "template-1", title: "Template 1" },
		]);
		expect(listAll).toHaveBeenCalledOnce();
	});

	it("reloads after the five-minute TTL", async () => {
		let calls = 0;
		const listAll = vi
			.fn<ListAll["effect"]>()
			.mockImplementation(() =>
				Effect.succeed([{ id: `template-${++calls}` }]),
			);
		const catalog = createCatalog(operation(listAll));
		const program = Effect.gen(function* () {
			const first = yield* catalog.effect();
			yield* TestClock.adjust(
				`${EXERCISE_TEMPLATE_CATALOG_CACHE_TTL_MS} millis`,
			);
			const second = yield* catalog.effect();
			return [first, second] as const;
		});

		await expect(
			Effect.runPromise(Effect.provide(program, TestClock.layer())),
		).resolves.toEqual([[{ id: "template-1" }], [{ id: "template-2" }]]);
		expect(listAll).toHaveBeenCalledTimes(2);
	});

	it("invalidates a failed lookup before the next call", async () => {
		const listAll = vi
			.fn<ListAll["effect"]>()
			.mockReturnValueOnce(Effect.fail(new Error("temporary failure")))
			.mockReturnValueOnce(Effect.succeed([{ id: "recovered" }]));
		const catalog = createCatalog(operation(listAll));

		await expect(catalog.get()).rejects.toThrow("temporary failure");
		await expect(catalog.get()).resolves.toMatchObject([{ id: "recovered" }]);
		expect(listAll).toHaveBeenCalledTimes(2);
	});

	it("does not let an older controlled load replace a newer result", async () => {
		const firstController = new AbortController();
		const secondController = new AbortController();
		const pending: Array<{
			signal: AbortSignal | undefined;
			resume: (effect: Effect.Effect<ExerciseTemplate[]>) => void;
		}> = [];
		const listAll = vi
			.fn<ListAll["effect"]>()
			.mockImplementation((options?: HevyExecutionOptions) =>
				Effect.callback<ExerciseTemplate[], ListAllError>((resume) => {
					pending.push({ resume, signal: options?.signal });
				}),
			);
		const catalog = createCatalog(operation(listAll));

		const first = catalog.get({
			execution: { signal: firstController.signal },
		});
		const second = catalog.get({
			execution: { signal: secondController.signal },
		});
		await vi.waitFor(() => expect(pending).toHaveLength(2));

		pending[1]?.resume(Effect.succeed([{ id: "newer" }]));
		await expect(second).resolves.toMatchObject([{ id: "newer" }]);
		pending[0]?.resume(Effect.succeed([{ id: "older" }]));
		await expect(first).resolves.toMatchObject([{ id: "older" }]);
		await expect(catalog.get()).resolves.toMatchObject([{ id: "newer" }]);
		expect(pending.map(({ signal }) => signal)).toEqual([
			firstController.signal,
			secondController.signal,
		]);
		expect(listAll).toHaveBeenCalledTimes(2);
	});
});
