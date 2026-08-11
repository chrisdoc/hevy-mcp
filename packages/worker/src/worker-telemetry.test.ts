import { describe, expect, it } from "vitest";
import {
	createWorkerUserHash,
	getCloudflareColo,
	getCloudflareGeography,
} from "./worker-telemetry.js";

describe("Worker telemetry context", () => {
	it("keeps the existing deterministic HMAC user pseudonym", async () => {
		await expect(createWorkerUserHash("test-key")).resolves.toBe("2cb0b5f95a");
		await expect(createWorkerUserHash("another-key")).resolves.toBe(
			"0ddf86a356",
		);
		await expect(createWorkerUserHash("test-key")).resolves.not.toBe(
			"another-key",
		);
	});

	it("does not derive a hash for an empty credential", async () => {
		await expect(createWorkerUserHash("")).resolves.toBeUndefined();
	});

	it("returns only a valid Cloudflare colo from request metadata", () => {
		const request = new Request("https://worker.example/mcp");
		Object.defineProperty(request, "cf", {
			value: { colo: "SFO", clientIp: "198.51.100.10" },
		});
		expect(getCloudflareColo(request)).toBe("SFO");
		expect(JSON.stringify(getCloudflareColo(request))).not.toContain(
			"198.51.100.10",
		);
	});

	it("returns bounded approximate geography without client identifiers", () => {
		const request = new Request("https://worker.example/mcp");
		Object.defineProperty(request, "cf", {
			value: {
				city: "San Francisco",
				region: "California",
				country: "US",
				clientIp: "198.51.100.10",
			},
		});
		expect(getCloudflareGeography(request)).toEqual({
			localityName: "San Francisco",
			localityRegion: "California",
			countryCode: "US",
		});
		expect(JSON.stringify(getCloudflareGeography(request))).not.toContain(
			"198.51.100.10",
		);
	});

	it("reads each geography field once", () => {
		const reads = { city: 0, region: 0, country: 0 };
		const cf = {
			get city() {
				reads.city += 1;
				return "San Francisco";
			},
			get region() {
				reads.region += 1;
				return "California";
			},
			get country() {
				reads.country += 1;
				return "US";
			},
		};
		const request = new Request("https://worker.example/mcp");
		Object.defineProperty(request, "cf", { value: cf });

		expect(getCloudflareGeography(request)).toEqual({
			localityName: "San Francisco",
			localityRegion: "California",
			countryCode: "US",
		});
		expect(reads).toEqual({ city: 1, region: 1, country: 1 });
	});

	it.each([
		{ city: "", region: "California", country: "US" },
		{ city: "San Francisco", region: "California", country: "USA" },
		{ city: "<script>", region: "California", country: "US" },
	])("drops malformed geography fields: %j", (cf) => {
		const request = new Request("https://worker.example/mcp");
		Object.defineProperty(request, "cf", { value: cf });
		expect(getCloudflareGeography(request)).toEqual(
			cf.country === "USA"
				? { localityName: "San Francisco", localityRegion: "California" }
				: { localityRegion: "California", countryCode: "US" },
		);
	});

	it.each([
		"198.51.100.10",
		"37.7749",
		"37.7749, -122.4194",
		"94103",
		"12345-6789",
		"a".repeat(65),
	])("rejects identifier-shaped or oversized geography values: %s", (value) => {
		const request = new Request("https://worker.example/mcp");
		Object.defineProperty(request, "cf", {
			value: { city: value, region: value, country: "US" },
		});
		expect(getCloudflareGeography(request)).toEqual({ countryCode: "US" });
	});

	it.each([
		undefined,
		{},
		{ colo: "sfo" },
		{ colo: "UNKNOWN" },
		{ colo: "1.2.3" },
		{ colo: "" },
	])("omits a missing or invalid colo: %j", (cf) => {
		const request = new Request("https://worker.example/mcp");
		if (cf !== undefined) Object.defineProperty(request, "cf", { value: cf });
		expect(getCloudflareColo(request)).toBeUndefined();
	});
});
