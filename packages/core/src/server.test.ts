import { afterEach, describe, expect, it } from "vitest";
import { Effect, Layer } from "effect";
import { createHevyMcpServer } from "./server.js";
import { createMockHevyClient } from "../test-fixtures/mock-hevy.js";
import {
	ExerciseTemplateCatalogService,
	HevyClientService,
	HevyOperationsService,
	ToolObserverService,
} from "./effect-services.js";
import { createOperations } from "@hevy-mcp/operations";
import type { CoreServiceLayer } from "./effect-layer.js";

describe("createHevyMcpServer", () => {
	const servers: Array<{ close(): Promise<void> }> = [];

	afterEach(async () => {
		await Promise.all(
			servers.splice(0).map(async (server) => {
				await server.close();
			}),
		);
	});

	it("keeps the Promise-compatible close façade idempotent", async () => {
		const server = createHevyMcpServer({
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
		const server = createHevyMcpServer({
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

	it("releases partially acquired services when construction fails", () => {
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

		expect(() =>
			createHevyMcpServer({
				createClient: () => client,
				serviceLayer,
				onToolsRegistered: () => {
					throw new Error("registration failed");
				},
			}),
		).toThrow("registration failed");
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
});
