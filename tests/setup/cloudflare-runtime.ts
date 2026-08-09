// The OAuth provider checks this Worker runtime global while it is imported.
// Unit tests run in Node, so mirror the compatibility flag used by Wrangler.
interface CloudflareRuntime {
	compatibilityFlags?: Record<string, boolean>;
	[key: string]: unknown;
}

const globalObject = globalThis as typeof globalThis & {
	Cloudflare?: CloudflareRuntime;
};
const existingCloudflare = globalObject.Cloudflare;

const cloudflareRuntime = Object.freeze({
	...(existingCloudflare ?? {}),
	compatibilityFlags: Object.freeze({
		...(existingCloudflare?.compatibilityFlags ?? {}),
		global_fetch_strictly_public: true,
	}),
});

Object.defineProperty(globalThis, "Cloudflare", {
	configurable: true,
	enumerable: false,
	writable: false,
	value: cloudflareRuntime,
});
