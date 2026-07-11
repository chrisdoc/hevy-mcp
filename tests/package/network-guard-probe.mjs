import assert from "node:assert/strict";
import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import http from "node:http";
import http2 from "node:http2";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { Worker } from "node:worker_threads";

const allowedHost = process.env.HEVY_MCP_TEST_ALLOWED_HOST;
const allowedPort = Number(process.env.HEVY_MCP_TEST_ALLOWED_PORT);
assert.ok(allowedHost);
assert.ok(Number.isInteger(allowedPort));
const wrongPort = allowedPort === 65_535 ? allowedPort - 1 : allowedPort + 1;

// Package code can replace the public stream writer, but the preload captured
// its synchronous fd writer before this module ran.
process.stderr.write = () => true;

const observed = [];

async function expectDenied(api, operation) {
	let thrown;
	try {
		await operation();
	} catch (error) {
		thrown = error;
	}
	assert.match(
		thrown?.message ?? "",
		new RegExp(
			`Package isolation guard blocked .+ via ${api.replaceAll(".", "\\.")}`,
		),
		`${api} did not throw the guard denial`,
	);
	observed.push(api);

	// A caught denial followed by stream replacement/rewrites must not remove
	// the marker already captured by the parent from fd 2.
	process.stderr.write(
		"\r                                                        \r",
	);
}

await expectDenied("fetch", () =>
	fetch(`http://${allowedHost}:${wrongPort}/guard-probe`),
);
await expectDenied("http.request", () =>
	http.request({ host: allowedHost, port: wrongPort }),
);
await expectDenied("https.request", () =>
	https.request({ host: allowedHost, port: wrongPort }),
);
await expectDenied("net.connect", () => net.connect(wrongPort, allowedHost));
await expectDenied("tls.connect", () => tls.connect(wrongPort, allowedHost));
await expectDenied("child_process.spawn", () =>
	childProcess.spawn(process.execPath, ["--version"]),
);
await expectDenied(
	"worker_threads.Worker",
	() => new Worker("export {};", { eval: true }),
);
await expectDenied("dgram.createSocket", () => dgram.createSocket("udp4"));
await expectDenied("http2.connect", () =>
	http2.connect(`http://${allowedHost}:${wrongPort}`),
);
await expectDenied("dns.lookup", () => dns.lookup("127.0.0.1", () => {}));
await expectDenied("dns.promises.lookup", () =>
	dns.promises.lookup("127.0.0.1"),
);
await expectDenied("dns.promises.lookupService", () =>
	dns.promises.lookupService("127.0.0.1", 80),
);
await expectDenied("dns.Resolver.resolve4", () => {
	const resolver = new dns.Resolver();
	resolver.setServers(["127.0.0.1:9"]);
	return resolver.resolve4("guard.invalid", () => {});
});
await expectDenied("dns.promises.Resolver.resolve4", () => {
	const resolver = new dns.promises.Resolver();
	resolver.setServers(["127.0.0.1:9"]);
	return resolver.resolve4("guard.invalid");
});

process.stdout.write(JSON.stringify(observed));
