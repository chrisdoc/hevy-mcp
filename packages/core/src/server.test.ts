import { afterEach, describe, expect, it } from "vitest";
import { Effect, Layer, Tracer } from "effect";
import { createHevyMcpServer } from "./server.js";
import { createMockHevyClient } from "../test-fixtures/mock-hevy.js";
import {
	ExerciseTemplateCatalogService,
	HevyClientService,
	HevyOperationsService,
	ToolObserverService,
} from "./runtime/effect-services.js";
import { createOperations } from "@hevy-mcp/operations";
import type { CoreServiceLayer } from "./runtime/effect-layer.js";

describe("createHevyMcpServer", () => {
	const servers: Array<{ close(): Promise<void> }> = [];

	afterEach(async () => {
		await Promise.all(
			servers.splice(0).map(async (server) => {
				await server.close();
			}),
		);
	});

	it("records server construction with the supplied Effect tracer", async () => {
		const spans: Tracer.NativeSpan[] = [];
		const effectTracer = Tracer.make({
			span: (options) => {
				const span = new Tracer.NativeSpan(options);
				spans.push(span);
				return span;
			},
		});
		const parentSpan = Tracer.externalSpan({
			traceId: "0123456789abcdef0123456789abcdef",
			spanId: "0123456789abcdef",
		});
		const server = await createHevyMcpServer({
			createClient: () => createMockHevyClient(),
			effectTracer,
			effectParentSpan: () => parentSpan,
		});
		servers.push(server);

		const constructionSpan = spans.find(
			(span) => span.name === "core.createHevyMcpServer",
		);
		expect(constructionSpan?.parent).toMatchObject({
			_tag: "Some",
			value: { spanId: parentSpan.spanId },
		});
	});

	it("keeps the Promise-compatible close façade idempotent", async () => {
		const server = await createHevyMcpServer({
			createClient: () => createMockHevyClient(),
		});
		servers.push(server);

		await expect(
			Promise.all([server.close(), server.close()]),
		).resolves.toEqual([undefined, undefined]);
	});

	it("acquires server services once and releases them on close", async () => {
		const acquired = { client: 0, operations: 0, catalog: 0, observer: 0 };
		const released = { client: 0, operations: 0, catalog: 0, observer: 0 };
		const client = createMockHevyClient();
		const operations = createOperations(client);
		const catalog = {
			effect: () => Effect.succeed([]),
			get: () => Promise.resolve([]),
			reset: () => undefined,
		};
		const observer = { start: () => undefined };
		const scoped = <S>(
			service: { readonly key: string },
			value: S,
			name: keyof typeof acquired,
		) =>
			Layer.effect(
				service as never,
				Effect.acquireRelease(
					Effect.sync(() => {
						acquired[name] += 1;
						return value;
					}),
					() =>
						Effect.sync(() => {
							released[name] += 1;
						}),
				),
			);
		const serviceLayer = Layer.mergeAll(
			scoped(HevyClientService, client, "client"),
			scoped(HevyOperationsService, operations, "operations"),
			scoped(ExerciseTemplateCatalogService, catalog, "catalog"),
			scoped(ToolObserverService, observer, "observer"),
		) as CoreServiceLayer;
		const server = await createHevyMcpServer({
			createClient: () => client,
			serviceLayer,
		});
		servers.push(server);

		expect(acquired).toEqual({
			client: 1,
			operations: 1,
			catalog: 1,
			observer: 1,
		});
		expect(released).toEqual({
			client: 0,
			operations: 0,
			catalog: 0,
			observer: 0,
		});
		await server.close();
		await server.close();
		expect(released).toEqual({
			client: 1,
			operations: 1,
			catalog: 1,
			observer: 1,
		});
	});

	it("releases partially acquired services when construction fails", async () => {
		const acquired = { client: 0, operations: 0, catalog: 0, observer: 0 };
		const released = { client: 0, operations: 0, catalog: 0, observer: 0 };
		const client = createMockHevyClient();
		const operations = createOperations(client);
		const catalog = {
			effect: () => Effect.succeed([]),
			get: () => Promise.resolve([]),
			reset: () => undefined,
		};
		const scoped = <S>(
			service: { readonly key: string },
			value: S,
			name: keyof typeof acquired,
		) =>
			Layer.effect(
				service as never,
				Effect.acquireRelease(
					Effect.sync(() => {
						acquired[name] += 1;
						return value;
					}),
					() =>
						Effect.sync(() => {
							released[name] += 1;
						}),
				),
			);
		const serviceLayer = Layer.mergeAll(
			scoped(HevyClientService, client, "client"),
			scoped(HevyOperationsService, operations, "operations"),
			scoped(ExerciseTemplateCatalogService, catalog, "catalog"),
		) as CoreServiceLayer;

		await expect(
			createHevyMcpServer({
				createClient: () => client,
				serviceLayer,
				onToolsRegistered: () => {
					throw new Error("registration failed");
				},
			}),
		).rejects.toThrow("registration failed");
		expect(acquired).toEqual({
			client: 1,
			operations: 1,
			catalog: 1,
			observer: 0,
		});
		expect(released).toEqual({
			client: 1,
			operations: 1,
			catalog: 1,
			observer: 0,
		});
	});

	it("preserves the construction error when asynchronous cleanup fails", async () => {
		const constructionError = new Error("registration failed");
		const cleanupError = new Error("cleanup failed");
		const client = createMockHevyClient();
		const serviceLayer = Layer.effect(
			HevyClientService,
			Effect.acquireRelease(Effect.succeed(client), () =>
				Effect.promise(() => Promise.resolve()).pipe(
					Effect.andThen(Effect.die(cleanupError)),
				),
			),
		) as CoreServiceLayer;

		await expect(
			createHevyMcpServer({
				createClient: () => client,
				serviceLayer,
				onToolsRegistered: () => {
					throw constructionError;
				},
			}),
		).rejects.toBe(constructionError);
	});
});
