import { describe, expect, it } from "vitest";
import {
	observeServerRss,
	parseProcStatusRss,
} from "../performance/harness.js";

describe("server RSS observations", () => {
	it("parses Linux VmRSS values as bytes", () => {
		expect(parseProcStatusRss("Name:\tnode\nVmRSS:\t  1234 kB\n")).toBe(
			1_263_616,
		);
	});

	it("returns null when VmRSS is absent or malformed", () => {
		expect(parseProcStatusRss("Name:\tnode\n")).toBeNull();
		expect(parseProcStatusRss("VmRSS: unknown kB\n")).toBeNull();
	});

	it("uses a nullable fallback when the process cannot be observed", () => {
		const observation = observeServerRss(null, 3, "initialized");
		expect(observation).toMatchObject({
			iteration: 3,
			phase: "initialized",
			rssBytes: null,
		});
		expect(observation.unavailableReason).toBeTruthy();
	});
});
