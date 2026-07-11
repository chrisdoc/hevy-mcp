import { appendFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

const logPath = process.env.HEVY_MCP_TEST_NETWORK_GUARD_LOG;
if (!logPath) {
	throw new Error("HEVY_MCP_TEST_NETWORK_GUARD_LOG is required");
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

function isNumericLoopback(hostname) {
	const normalized = normalizeHostname(hostname);
	return normalized === "127.0.0.1" || normalized === "::1";
}

function recordAndReject(api, hostname, port) {
	const attempt = {
		api,
		hostname: normalizeHostname(hostname) ?? "<missing>",
		port: typeof port === "string" || typeof port === "number" ? port : null,
	};
	appendFileSync(logPath, `${JSON.stringify(attempt)}\n`, { mode: 0o600 });
	throw new Error(`Network guard blocked non-loopback access via ${api}`);
}

function assertAllowed(api, hostname, port) {
	if (!isNumericLoopback(hostname)) {
		recordAndReject(api, hostname, port);
	}
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
	assertAllowed("fetch", url.hostname, url.port);
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
