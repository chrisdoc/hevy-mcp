import childProcess from "node:child_process";
import dgram from "node:dgram";
import { appendFileSync, readFileSync } from "node:fs";
import http from "node:http";
import http2 from "node:http2";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";
import workerThreads from "node:worker_threads";

const logPath = process.env.HEVY_MCP_TEST_NETWORK_GUARD_LOG;
if (!logPath) {
	throw new Error("HEVY_MCP_TEST_NETWORK_GUARD_LOG is required");
}

const allowedHostname = process.env.HEVY_MCP_TEST_ALLOWED_HOST;
const allowedPortText = process.env.HEVY_MCP_TEST_ALLOWED_PORT;
const allowedPort = Number(allowedPortText);
if (
	(allowedHostname !== "127.0.0.1" && allowedHostname !== "::1") ||
	!Number.isInteger(allowedPort) ||
	allowedPort < 1 ||
	allowedPort > 65_535 ||
	String(allowedPort) !== allowedPortText
) {
	throw new Error(
		"HEVY_MCP_TEST_ALLOWED_HOST and HEVY_MCP_TEST_ALLOWED_PORT are required",
	);
}

if (!process.permission) {
	throw new Error("Node Permission Model must be active in the package child");
}

const parentEnvironmentPath = `/proc/${process.ppid}/environ`;
if (process.permission.has("fs.read", parentEnvironmentPath)) {
	throw new Error("Node Permission Model unexpectedly permits parent environ");
}
try {
	readFileSync(parentEnvironmentPath);
	throw new Error(
		"parent environment was readable despite the permission check",
	);
} catch (error) {
	if (error?.code !== "ERR_ACCESS_DENIED") {
		throw error;
	}
}

function normalizeHostname(hostname) {
	if (typeof hostname !== "string") {
		return undefined;
	}

	if (hostname.startsWith("[") && hostname.endsWith("]")) {
		return hostname.slice(1, -1);
	}

	return hostname;
}

function normalizePort(port) {
	if (typeof port === "number" && Number.isInteger(port)) {
		return port;
	}
	if (typeof port === "string" && /^\d+$/.test(port)) {
		return Number(port);
	}
	return undefined;
}

function recordAndReject(kind, api, metadata = {}) {
	const attempt = { kind, api, ...metadata };
	appendFileSync(logPath, `${JSON.stringify(attempt)}\n`, { mode: 0o600 });
	throw new Error(`Package isolation guard blocked ${kind} access via ${api}`);
}

function assertAllowed(api, hostname, port) {
	const normalizedHostname = normalizeHostname(hostname);
	const normalizedPort = normalizePort(port);
	if (
		normalizedHostname !== allowedHostname ||
		normalizedPort !== allowedPort
	) {
		recordAndReject("network", api, {
			hostname: normalizedHostname ?? "<missing>",
			port: normalizedPort ?? null,
		});
	}
}

function rejectCapability(kind, api) {
	return function blockedCapability() {
		recordAndReject(kind, api);
	};
}

function httpTarget(input, options) {
	let parsed;
	if (input instanceof URL) {
		parsed = input;
	} else if (typeof input === "string") {
		try {
			parsed = new URL(input);
		} catch {
			parsed = undefined;
		}
	}

	const candidate =
		parsed ??
		(input && typeof input === "object" && !(input instanceof URL)
			? input
			: options && typeof options === "object"
				? options
				: {});
	const hostname = parsed?.hostname ?? candidate.hostname ?? candidate.host;
	const port = parsed?.port ?? candidate.port;
	return { hostname, port };
}

function socketTarget(args) {
	const first = args[0];
	if (Array.isArray(first)) {
		return socketTarget(first);
	}

	if (typeof first === "number") {
		return {
			hostname: typeof args[1] === "string" ? args[1] : undefined,
			port: first,
		};
	}

	if (first && typeof first === "object") {
		return {
			hostname: first.host ?? first.hostname,
			port: first.port,
		};
	}

	return { hostname: undefined, port: undefined };
}

const originalFetch = globalThis.fetch;
globalThis.fetch = function guardedFetch(input, init) {
	const url = input instanceof URL ? input : new URL(input.url ?? input);
	assertAllowed("fetch", url.hostname, url.port || undefined);
	return originalFetch.call(this, input, init);
};

function guardHttpModule(module, name) {
	const originalRequest = module.request;
	const originalGet = module.get;

	module.request = function guardedRequest(input, options, _callback) {
		const target = httpTarget(input, options);
		assertAllowed(`${name}.request`, target.hostname, target.port);
		return originalRequest.apply(this, arguments);
	};

	module.get = function guardedGet(input, options, _callback) {
		const target = httpTarget(input, options);
		assertAllowed(`${name}.get`, target.hostname, target.port);
		return originalGet.apply(this, arguments);
	};
}

guardHttpModule(http, "http");
guardHttpModule(https, "https");

const originalNetConnect = net.connect;
const originalNetCreateConnection = net.createConnection;
const originalSocketConnect = net.Socket.prototype.connect;
const originalTlsConnect = tls.connect;

net.connect = function guardedNetConnect(...args) {
	const target = socketTarget(args);
	assertAllowed("net.connect", target.hostname, target.port);
	return originalNetConnect.apply(this, args);
};

net.createConnection = function guardedNetCreateConnection(...args) {
	const target = socketTarget(args);
	assertAllowed("net.createConnection", target.hostname, target.port);
	return originalNetCreateConnection.apply(this, args);
};

net.Socket.prototype.connect = function guardedSocketConnect(...args) {
	const target = socketTarget(args);
	assertAllowed("net.Socket.connect", target.hostname, target.port);
	return originalSocketConnect.apply(this, args);
};

tls.connect = function guardedTlsConnect(...args) {
	const target = socketTarget(args);
	assertAllowed("tls.connect", target.hostname, target.port);
	return originalTlsConnect.apply(this, args);
};

for (const method of [
	"spawn",
	"spawnSync",
	"exec",
	"execSync",
	"execFile",
	"execFileSync",
	"fork",
]) {
	childProcess[method] = rejectCapability("process", `child_process.${method}`);
}

dgram.createSocket = rejectCapability("network", "dgram.createSocket");
dgram.Socket = class GuardedDatagramSocket {
	constructor() {
		recordAndReject("network", "dgram.Socket");
	}
};
http2.connect = rejectCapability("network", "http2.connect");
http2.createServer = rejectCapability("network", "http2.createServer");
http2.createSecureServer = rejectCapability(
	"network",
	"http2.createSecureServer",
);

workerThreads.Worker = class GuardedWorker {
	constructor() {
		recordAndReject("worker", "worker_threads.Worker");
	}
};

syncBuiltinESMExports();
