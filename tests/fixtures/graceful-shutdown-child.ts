import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { installGracefulShutdown } from "../../packages/node/src/utils/graceful-shutdown.js";

const transport = new StdioServerTransport();
await transport.start();
installGracefulShutdown({ target: transport });

const payload = "x".repeat(128 * 1024);
const pendingSends: Promise<void>[] = [];
const maximumFrameCount = 64;

while (
	!process.stdout.writableNeedDrain &&
	pendingSends.length < maximumFrameCount
) {
	const id = pendingSends.length + 1;
	pendingSends.push(
		transport.send({
			jsonrpc: "2.0",
			id,
			result: { payload },
		}),
	);
}

if (!process.stdout.writableNeedDrain) {
	throw new Error(
		`Expected stdout backpressure after ${maximumFrameCount} frames`,
	);
}

console.error(`BACKPRESSURED:${pendingSends.length}`);
await Promise.all(pendingSends);
