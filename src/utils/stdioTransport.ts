import process from "node:process";
import type { TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
	JSONRPCMessage,
	MessageExtraInfo,
} from "@modelcontextprotocol/sdk/types.js";
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";

class ReadBuffer {
	private _buffer: Buffer | undefined;

	append(chunk: Buffer) {
		this._buffer = this._buffer ? Buffer.concat([this._buffer, chunk]) : chunk;
	}

	readLine() {
		if (!this._buffer) {
			return null;
		}

		const index = this._buffer.indexOf("\n");
		if (index === -1) {
			return null;
		}

		const line = this._buffer.toString("utf8", 0, index).replace(/\r$/, "");
		this._buffer = this._buffer.subarray(index + 1);
		return line;
	}

	clear() {
		this._buffer = undefined;
	}
}

function deserializeMessageLenient(line: string) {
	let parsedJson: unknown;
	try {
		parsedJson = JSON.parse(line);
	} catch {
		return null;
	}

	if (
		parsedJson &&
		typeof parsedJson === "object" &&
		"params" in parsedJson &&
		(parsedJson as { params?: unknown }).params === null
	) {
		(parsedJson as { params?: unknown }).params = {};
	}

	const parsedMessage = JSONRPCMessageSchema.safeParse(parsedJson);
	if (!parsedMessage.success) {
		return null;
	}

	return parsedMessage.data;
}

/**
 * Server transport for stdio which tolerates common JSON-RPC quirks.
 *
 * In practice, some JSON-RPC client libraries emit `"params": null` for
 * notifications/requests without params. The MCP SDK expects `params` to be an
 * object when present, so we normalize `null` -> `{}` and ignore any remaining
 * malformed lines.
 */
export class LenientStdioServerTransport {
	private _stdin: typeof process.stdin;
	private _stdout: typeof process.stdout;
	private _readBuffer = new ReadBuffer();
	private _started = false;
	private _invalidMessageCount = 0;
	private readonly _maxInvalidMessagesToLog = 5;

	onclose?: () => void;
	onerror?: (error: Error) => void;
	onmessage?: <T extends JSONRPCMessage>(
		message: T,
		extra?: MessageExtraInfo,
	) => void;

	// Arrow functions to bind `this` properly, while maintaining function identity.
	private _ondata = (chunk: Buffer) => {
		this._readBuffer.append(chunk);
		this.processReadBuffer();
	};

	private _onerror = (error: Error) => {
		this.onerror?.(error);
	};

	constructor(_stdin = process.stdin, _stdout = process.stdout) {
		this._stdin = _stdin;
		this._stdout = _stdout;
	}

	async start() {
		if (this._started) {
			throw new Error(
				"LenientStdioServerTransport already started! If using Server class, note that connect() calls start() automatically.",
			);
		}

		this._started = true;
		this._stdin.on("data", this._ondata);
		this._stdin.on("error", this._onerror);
	}

	private processReadBuffer() {
		while (true) {
			const line = this._readBuffer.readLine();
			if (line === null) {
				break;
			}

			try {
				const message = deserializeMessageLenient(line);
				if (!message) {
					this._invalidMessageCount += 1;
					if (this._invalidMessageCount <= this._maxInvalidMessagesToLog) {
						console.error(
							"Ignoring malformed JSON-RPC message on stdin (failed schema validation)",
						);
					}
					continue;
				}

				this.onmessage?.(message, undefined);
			} catch (error) {
				this.onerror?.(
					error instanceof Error
						? error
						: new Error(`Transport error: ${String(error)}`),
				);
			}
		}
	}

	async close() {
		this._stdin.off("data", this._ondata);
		this._stdin.off("error", this._onerror);

		const remainingDataListeners = this._stdin.listenerCount("data");
		if (remainingDataListeners === 0) {
			this._stdin.pause();
		}

		this._readBuffer.clear();
		this.onclose?.();
	}

	send(message: JSONRPCMessage, _options?: TransportSendOptions) {
		return new Promise<void>((resolve) => {
			const json = `${JSON.stringify(message)}\n`;
			if (this._stdout.write(json)) {
				resolve();
				return;
			}

			this._stdout.once("drain", resolve);
		});
	}
}
