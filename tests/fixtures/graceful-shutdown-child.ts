import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { installGracefulShutdown } from "../../src/utils/graceful-shutdown.js";

const transport = new StdioServerTransport();
await transport.start();
installGracefulShutdown({ target: transport });

const payload = "x".repeat(512 * 1024);
void transport.send({
	jsonrpc: "2.0",
	id: 1,
	result: { payload },
});

if (!process.stdout.writableNeedDrain) {
	throw new Error("Expected the stdout write to be backpressured");
}

console.error("BACKPRESSURED");
