import { Cache, Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vitest";

const makeCache = <Value, Error = never>(
	lookup: (key: string) => Effect.Effect<Value, Error>,
	options: {
		readonly capacity?: number;
		readonly timeToLive?: Parameters<typeof Cache.make>[0]["timeToLive"];
	} = {},
) =>
	Cache.make<string, Value, Error>({
		capacity: options.capacity ?? 2,
		lookup,
		timeToLive: options.timeToLive ?? "1 minute",
	});

describe("exercise template cache", () => {
	it("returns cached values for subsequent hits before TTL expiry", async () => {
		let lookups = 0;
		const program = Effect.gen(function* () {
			const cache = yield* makeCache(() =>
				Effect.sync(() => {
					lookups += 1;
					return "bench";
				}),
			);
			const first = yield* Cache.get(cache, "catalog");
			const second = yield* Cache.get(cache, "catalog");
			return [first, second] as const;
		});

		await expect(Effect.runPromise(program)).resolves.toEqual([
			"bench",
			"bench",
		]);
		expect(lookups).toBe(1);
	});

	it("expires entries under the Effect test clock", async () => {
		let lookups = 0;
		const program = Effect.gen(function* () {
			const cache = yield* makeCache(
				() =>
					Effect.sync(() => {
						lookups += 1;
						return lookups;
					}),
				{ timeToLive: "1 second" },
			);
			const first = yield* Cache.get(cache, "catalog");
			yield* TestClock.adjust("1 second");
			const second = yield* Cache.get(cache, "catalog");
			return [first, second] as const;
		});

		await expect(
			Effect.runPromise(Effect.provide(program, TestClock.layer())),
		).resolves.toEqual([1, 2]);
	});

	it("evicts the least recently used entry at capacity", async () => {
		const seen: string[] = [];
		const program = Effect.gen(function* () {
			const cache = yield* makeCache((key) =>
				Effect.sync(() => {
					seen.push(key);
					return `${key}-value`;
				}),
			);
			yield* Cache.get(cache, "a");
			yield* Cache.get(cache, "b");
			yield* Cache.get(cache, "a");
			yield* Cache.get(cache, "c");
			yield* Cache.get(cache, "b");
		});

		await Effect.runPromise(program);
		expect(seen).toEqual(["a", "b", "c", "b"]);
	});

	it("refreshes a value and keeps the fresh result cached", async () => {
		let lookups = 0;
		const program = Effect.gen(function* () {
			const cache = yield* makeCache(() =>
				Effect.sync(() => {
					lookups += 1;
					return lookups === 1 ? "stale" : "fresh";
				}),
			);
			yield* Cache.get(cache, "catalog");
			const refreshed = yield* Cache.refresh(cache, "catalog");
			const cached = yield* Cache.get(cache, "catalog");
			return [refreshed, cached] as const;
		});

		await expect(Effect.runPromise(program)).resolves.toEqual([
			"fresh",
			"fresh",
		]);
		expect(lookups).toBe(2);
	});

	it("de-duplicates concurrent in-flight lookups", async () => {
		let lookups = 0;
		let resolveLookup: (() => void) | undefined;
		const program = Effect.gen(function* () {
			const cache = yield* makeCache(() =>
				Effect.callback<string>((resume) => {
					lookups += 1;
					resolveLookup = () => resume(Effect.succeed("shared"));
				}),
			);
			const first = yield* Cache.get(cache, "catalog").pipe(Effect.forkChild);
			yield* Effect.yieldNow;
			const second = yield* Cache.get(cache, "catalog").pipe(Effect.forkChild);
			yield* Effect.yieldNow;
			const lookupCount = lookups;
			resolveLookup?.();
			const values = yield* Effect.all([Fiber.join(first), Fiber.join(second)]);
			return [lookupCount, values] as const;
		});

		await expect(Effect.runPromise(program)).resolves.toEqual([
			1,
			["shared", "shared"],
		]);
	});

	it("does not retain failed lookups when the TTL for failures is zero", async () => {
		let lookups = 0;
		const program = Effect.gen(function* () {
			const cache = yield* makeCache(
				() =>
					Effect.sync(() => {
						lookups += 1;
						return lookups === 1
							? Effect.fail("first failure" as const)
							: Effect.succeed("recovered" as const);
					}).pipe(Effect.flatten),
				{ timeToLive: "1 millis" },
			);
			const first = yield* Effect.exit(Cache.get(cache, "catalog"));
			yield* TestClock.adjust("1 millis");
			const second = yield* Cache.get(cache, "catalog");
			return [first, second] as const;
		});

		await expect(
			Effect.runPromise(Effect.provide(program, TestClock.layer())),
		).resolves.toMatchObject([{ _tag: "Failure" }, "recovered"]);
		expect(lookups).toBe(2);
	});
});
