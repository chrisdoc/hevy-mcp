import type { HevyClient } from "@hevy-mcp/hevy-client";
import type { HevyOperations } from "@hevy-mcp/operations";
import { Effect } from "effect";
import { vi } from "vitest";
import type { CliArgs } from "../arguments.js";
import { createEffectClient } from "../test-fixtures/effect-client.js";

export const commandArgs = (
	command: string,
	subcommand?: string,
	positionals: readonly string[] = [],
	options: CliArgs["options"] = {},
): CliArgs => ({ command, subcommand, positionals: [...positionals], options });

export function commandClient(): HevyClient {
	return createEffectClient({});
}

export function commandOperation<T>(id: string, value: T) {
	return {
		descriptor: { id, safety: "read" as const },
		effect: vi.fn(() => Effect.succeed(value)),
		execute: vi.fn(),
	};
}

export function asCommandOperations<T extends object>(
	operations: T,
): T & HevyOperations {
	return operations as T & HevyOperations;
}

export function mutationOptions(data: unknown): CliArgs["options"] {
	return { data: JSON.stringify(data), yes: true };
}
