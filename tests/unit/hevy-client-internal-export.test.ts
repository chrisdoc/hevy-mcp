import { describe, expect, it } from "vitest";

import * as publicClientExports from "@hevy-mcp/hevy-client";
import * as internalClientExports from "@hevy-mcp/hevy-client/internal";

describe("@hevy-mcp/hevy-client package exports", () => {
	it("keeps the Effect seam on the internal subpath only", () => {
		expect("requestEffect" in publicClientExports).toBe(false);
		expect("createRequestEffect" in publicClientExports).toBe(false);
		expect("getNativeRequestEffect" in publicClientExports).toBe(false);
		expect("getRequestEffectClient" in publicClientExports).toBe(false);
		expect(internalClientExports.getNativeRequestEffect).toBeTypeOf("function");
		expect(internalClientExports.getRequestEffectClient).toBeTypeOf("function");
		expect(internalClientExports.interruptOnAbortSignal).toBeTypeOf("function");
		expect("interruptOnAbortSignal" in publicClientExports).toBe(false);
	});
});
