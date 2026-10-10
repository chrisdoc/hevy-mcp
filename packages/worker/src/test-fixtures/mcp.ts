import type { JSONObject } from "@modelcontextprotocol/server";

export function initializeMessage(id: number, clientName: string): JSONObject {
	return {
		jsonrpc: "2.0",
		id,
		method: "initialize",
		params: {
			protocolVersion: "2025-11-25",
			capabilities: {},
			clientInfo: { name: clientName, version: "1" },
		},
	};
}

export function jsonPostRequest(
	body: JSONObject,
	headers: RequestInit["headers"],
	url = "https://worker.example/mcp",
): Request {
	return new Request(url, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
}

export async function parseMcpResponse(response: Response): Promise<unknown> {
	const text = await response.text();
	if (response.headers.get("content-type")?.includes("text/event-stream")) {
		const data = text
			.split("\n")
			.find((line) => line.startsWith("data: "))
			?.slice(6);
		if (!data) throw new Error(`Missing SSE data: ${text}`);
		return JSON.parse(data);
	}
	return JSON.parse(text);
}
