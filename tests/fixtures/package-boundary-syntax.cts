// @ts-nocheck
import type { HevyClient } from "@hevy-mcp/hevy-client";
export { userInfoSchema } from "@hevy-mcp/hevy-client/schemas";
import clientTypes = require("@hevy-mcp/hevy-client/types");

export async function loadBoundarySyntax(): Promise<unknown> {
	const client = await import("@hevy-mcp/hevy-client");
	const schemas = require("@hevy-mcp/hevy-client/schemas");
	return [client, schemas, clientTypes, null as HevyClient | null];
}
