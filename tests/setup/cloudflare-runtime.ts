// The OAuth provider checks this Worker runtime global while it is imported.
// Unit tests run in Node, so mirror the compatibility flag used by Wrangler.
Object.defineProperty(globalThis, "Cloudflare", {
	configurable: true,
	enumerable: false,
	writable: true,
	value: {
		compatibilityFlags: {
			global_fetch_strictly_public: true,
		},
	},
});
