import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ServerOptions } from "@modelcontextprotocol/sdk/server/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	CallToolResultSchema,
	type CallToolResult,
	type Implementation,
} from "@modelcontextprotocol/sdk/types.js";
import nock, { type Interceptor, type Scope } from "nock";
import { resetExerciseTemplateCatalogCache } from "../../src/utils/exercise-template-catalog.js";
import { createClient, type HevyClient } from "../../src/utils/hevyClient.js";
import type { HevyClientOptions } from "../../src/utils/hevyClientKubb.js";

export const MOCK_HEVY_API_BASE_URL = "https://api.hevyapp.com";
export const MOCK_HEVY_API_KEY = "mock-hevy-api-key";

export type MockedComponentRegistration = (
	server: McpServer,
	hevyClient: HevyClient,
) => void;

export interface MockedMcpHarness {
	readonly client: Client;
	readonly server: McpServer;
	readonly name: string;
	close(): Promise<void>;
}

interface CreateMockedMcpHarnessOptions {
	name: string;
	register: MockedComponentRegistration;
	serverInfo?: Implementation;
	serverOptions?: ServerOptions;
}

interface CallToolOptions {
	requireStructuredContentForReadTools?: boolean;
}

export type MockedMcpNetworkPolicyRestore = () => void;

export type MockedMcpHarnessTeardownTarget = Pick<
	MockedMcpHarness,
	"close" | "name"
>;

export interface MockedToolResult {
	isError: boolean | undefined;
	structuredContent: Record<string, unknown> | undefined;
	text: string;
}

const openHarnesses = new Set<MockedMcpHarness>();
const ownedNockScopes = new Set<Scope>();
const ownedNockInterceptors = new Set<Interceptor>();
let networkIsolationDepth = 0;
let restoreNetworkPolicy: MockedMcpNetworkPolicyRestore | undefined;

const nockInterceptorMethods = new Set<PropertyKey>([
	"get",
	"post",
	"put",
	"head",
	"patch",
	"merge",
	"delete",
	"options",
	"intercept",
]);

export function createMockedApiScope(): Scope {
	const scope = nock(MOCK_HEVY_API_BASE_URL, {
		reqheaders: {
			"api-key": MOCK_HEVY_API_KEY,
		},
	});
	ownedNockScopes.add(scope);

	return new Proxy(scope, {
		get(target, property, receiver) {
			const value = Reflect.get(target, property, receiver);
			if (typeof value !== "function") return value;
			if (!nockInterceptorMethods.has(property)) return value.bind(target);

			return (...args: unknown[]) => {
				const interceptor = Reflect.apply(value, target, args) as Interceptor;
				ownedNockInterceptors.add(interceptor);
				return interceptor;
			};
		},
	});
}

export function createMockedHevyClient(
	options: HevyClientOptions = {},
): HevyClient {
	return createClient(MOCK_HEVY_API_KEY, MOCK_HEVY_API_BASE_URL, options);
}

export function composeMockedComponentRegistration(
	...registrations: MockedComponentRegistration[]
): MockedComponentRegistration {
	return (server, hevyClient) => {
		for (const register of registrations) {
			register(server, hevyClient);
		}
	};
}

export function disableMockedMcpExternalNetworking(
	restorePolicy: MockedMcpNetworkPolicyRestore,
): () => void {
	if (networkIsolationDepth === 0) {
		restoreNetworkPolicy = restorePolicy;
		nock.disableNetConnect();
	}
	networkIsolationDepth++;

	let restored = false;
	return () => {
		if (restored) return;
		restored = true;
		networkIsolationDepth--;
		if (networkIsolationDepth === 0) {
			const restore = restoreNetworkPolicy;
			restoreNetworkPolicy = undefined;
			restore?.();
		}
	};
}

export async function createMockedMcpHarness({
	name,
	register,
	serverInfo = { name, version: "1.0.0" },
	serverOptions,
}: CreateMockedMcpHarnessOptions): Promise<MockedMcpHarness> {
	resetExerciseTemplateCatalogCache();

	const server = new McpServer(serverInfo, serverOptions);
	const client = new Client({ name: `${name}-client`, version: "1.0.0" });
	const hevyClient = createMockedHevyClient();
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();

	let closed = false;
	const harness: MockedMcpHarness = {
		client,
		server,
		name,
		async close() {
			if (closed) return;
			closed = true;
			openHarnesses.delete(harness);

			const results = await Promise.allSettled([
				client.close(),
				server.close(),
			]);
			resetExerciseTemplateCatalogCache();

			const failures = results.filter(
				(result): result is PromiseRejectedResult =>
					result.status === "rejected",
			);
			if (failures.length > 0) {
				throw new AggregateError(
					failures.map(({ reason }) => reason),
					`Failed to close mocked MCP harness "${name}"`,
				);
			}
		},
	};

	try {
		register(server, hevyClient);
		await Promise.all([
			client.connect(clientTransport),
			server.connect(serverTransport),
		]);
		openHarnesses.add(harness);
		return harness;
	} catch (error) {
		await Promise.allSettled([client.close(), server.close()]);
		resetExerciseTemplateCatalogCache();
		throw error;
	}
}

export function getToolText(result: CallToolResult): string {
	const firstContent = result.content[0];
	if (!firstContent || firstContent.type !== "text") {
		throw new Error("Expected first MCP tool response content to be text");
	}

	return firstContent.text;
}

export function requireStructuredContent(
	result: CallToolResult,
	context = "MCP tool response",
): Record<string, unknown> {
	if (result.structuredContent === undefined) {
		throw new Error(`Expected structured content from ${context}`);
	}

	return result.structuredContent;
}

export function parseToolText<T>(
	result: Pick<MockedToolResult, "text">,
	context = "MCP tool response",
): T {
	try {
		return JSON.parse(result.text) as T;
	} catch (error) {
		throw new Error(`Expected valid JSON text from ${context}`, {
			cause: error,
		});
	}
}

export async function callTool(
	client: Client,
	name: string,
	arguments_: Record<string, unknown>,
	options: CallToolOptions = {},
): Promise<MockedToolResult> {
	const result = await client.request(
		{
			method: "tools/call",
			params: { name, arguments: arguments_ },
		},
		CallToolResultSchema,
	);

	if (
		options.requireStructuredContentForReadTools &&
		!result.isError &&
		(name.startsWith("get-") || name.startsWith("search-"))
	) {
		requireStructuredContent(result, name);
	}

	return {
		isError: result.isError,
		structuredContent: result.structuredContent,
		text: getToolText(result),
	};
}

export async function cleanupMockedMcpTestState(): Promise<void> {
	const failures: unknown[] = [];
	const pendingMocks = [...ownedNockScopes].flatMap((scope) =>
		scope.pendingMocks(),
	);
	if (pendingMocks.length > 0) {
		failures.push(
			new Error(`Unused Nock interceptors:\n${pendingMocks.join("\n")}`),
		);
	}

	const leakedHarnesses = [...openHarnesses];
	if (leakedHarnesses.length > 0) {
		failures.push(
			new Error(
				`Unclosed mocked MCP harnesses: ${leakedHarnesses
					.map(({ name }) => name)
					.join(", ")}`,
			),
		);
	}

	for (const harness of leakedHarnesses) {
		try {
			await harness.close();
		} catch (error) {
			failures.push(error);
		}
	}

	for (const interceptor of ownedNockInterceptors) {
		nock.removeInterceptor(interceptor);
	}
	ownedNockInterceptors.clear();
	ownedNockScopes.clear();
	resetExerciseTemplateCatalogCache();

	if (failures.length > 0) {
		throw new AggregateError(failures, "Mocked MCP test cleanup failed");
	}
}

function collectTeardownFailure(failures: unknown[], error: unknown): void {
	if (error instanceof AggregateError) {
		failures.push(...error.errors);
		return;
	}

	failures.push(error);
}

export async function teardownMockedMcpTestState(
	harness: MockedMcpHarnessTeardownTarget | null | undefined,
): Promise<void> {
	const failures: unknown[] = [];

	if (harness) {
		try {
			await harness.close();
		} catch (error) {
			collectTeardownFailure(failures, error);
		}
	}

	try {
		await cleanupMockedMcpTestState();
	} catch (error) {
		collectTeardownFailure(failures, error);
	}

	if (failures.length > 0) {
		throw new AggregateError(failures, "Mocked MCP test teardown failed");
	}
}
