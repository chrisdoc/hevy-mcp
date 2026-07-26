import { isIP } from "node:net";

export type NodeTransport = "stdio" | "http";

export interface NodeCliOptions {
	transport: NodeTransport;
	host: string;
	port: number;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

function valueAfter(args: string[], index: number, option: string): string {
	const value = args[index + 1];
	if (!value || value.startsWith("-")) {
		throw new Error(`${option} requires a value.`);
	}
	return value;
}

function parseHost(value: string): string {
	const host = value.trim();
	const unbracketed =
		host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
	const isBracketed = host.startsWith("[") || host.endsWith("]");
	const validHostname =
		/^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;
	if (
		host.length === 0 ||
		(isBracketed && !(host.startsWith("[") && host.endsWith("]"))) ||
		(isBracketed && isIP(unbracketed) !== 6) ||
		(!isBracketed && host.includes(":") && isIP(host) !== 6) ||
		(!isBracketed &&
			!host.includes(":") &&
			isIP(host) === 0 &&
			!validHostname.test(host)) ||
		/\s/u.test(host) ||
		host.includes("/") ||
		host.includes("@") ||
		host.includes("://")
	) {
		throw new Error(
			`Invalid host: ${value}. Provide a hostname or IP address.`,
		);
	}
	return unbracketed;
}

function parsePort(value: string): number {
	if (!/^[0-9]+$/u.test(value)) {
		throw new Error(`Invalid port: ${value}. Use an integer from 1 to 65535.`);
	}
	const port = Number(value);
	if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
		throw new Error(`Invalid port: ${value}. Use an integer from 1 to 65535.`);
	}
	return port;
}

export function parseNodeCliOptions(args: string[]): NodeCliOptions {
	let transport: NodeTransport = "stdio";
	let host = DEFAULT_HOST;
	let port = DEFAULT_PORT;
	let transportExplicit = false;
	let hostExplicit = false;
	let portExplicit = false;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg || ["--help", "-h", "--version", "-v"].includes(arg)) {
			continue;
		}
		switch (arg) {
			case "--transport": {
				const value = valueAfter(args, index, arg);
				index += 1;
				if (value !== "stdio" && value !== "http") {
					throw new Error(
						`Invalid transport: ${value}. Use either stdio or http.`,
					);
				}
				transport = value;
				transportExplicit = true;
				break;
			}
			case "--host":
				host = parseHost(valueAfter(args, index, arg));
				hostExplicit = true;
				index += 1;
				break;
			case "--port":
				port = parsePort(valueAfter(args, index, arg));
				portExplicit = true;
				index += 1;
				break;
			default:
				throw new Error(`Unknown option: ${arg}`);
		}
	}

	if (transport === "stdio" && (hostExplicit || portExplicit)) {
		throw new Error(
			"--host and --port can only be used with --transport http.",
		);
	}
	if (transport === "stdio" && transportExplicit) {
		return { transport, host: DEFAULT_HOST, port: DEFAULT_PORT };
	}
	return { transport, host, port };
}
