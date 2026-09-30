import { describe, expect, it } from "vitest";

import {
	corsHeaders,
	DEFAULT_ALLOWED_ORIGINS,
	healthResponse,
	healthResponseWithCors,
	parseAllowedOrigins,
	parseBearerApiKey,
	resolveHevyApiBaseUrl,
	response,
	validateOrigin,
	withCors,
	type WorkerEnv,
} from "./worker-http-helpers.js";

describe("worker-http-helpers", () => {
	describe("parseBearerApiKey", () => {
		it("extracts bearer token correctly", () => {
			expect(parseBearerApiKey("Bearer my-key")).toBe("my-key");
			expect(parseBearerApiKey("bearer my-key")).toBe("my-key");
			expect(parseBearerApiKey("BEARER my-key")).toBe("my-key");
		});

		it("returns null for non-bearer or malformed headers", () => {
			expect(parseBearerApiKey(null)).toBeNull();
			expect(parseBearerApiKey("")).toBeNull();
			expect(parseBearerApiKey("Basic 12345")).toBeNull();
			expect(parseBearerApiKey("Bearer ")).toBeNull();
			expect(parseBearerApiKey("Bearer key1, key2")).toBeNull();
		});
	});

	describe("parseAllowedOrigins", () => {
		it("returns defaults when undefined", () => {
			const origins = parseAllowedOrigins(undefined);
			expect(origins).toEqual(new Set(DEFAULT_ALLOWED_ORIGINS));
		});

		it("parses comma-separated custom origins", () => {
			const origins = parseAllowedOrigins(
				"https://app.example.com, https://test.example.com",
			);
			expect(origins).toEqual(
				new Set(["https://app.example.com", "https://test.example.com"]),
			);
		});
	});

	describe("validateOrigin", () => {
		const env: WorkerEnv = {
			MCP_ALLOWED_ORIGINS: "https://allowed.example.com",
		};

		it("returns null when no Origin header is present", () => {
			const req = new Request("https://worker.example.com/mcp", {
				method: "POST",
			});
			expect(validateOrigin(req, env)).toBeNull();
		});

		it("returns origin when origin matches request origin", () => {
			const req = new Request("https://worker.example.com/mcp", {
				method: "POST",
				headers: { Origin: "https://worker.example.com" },
			});
			expect(validateOrigin(req, env)).toBe("https://worker.example.com");
		});

		it("returns origin when origin is in allowed origins", () => {
			const req = new Request("https://worker.example.com/mcp", {
				method: "POST",
				headers: { Origin: "https://allowed.example.com" },
			});
			expect(validateOrigin(req, env)).toBe("https://allowed.example.com");
		});

		it("returns 403 Forbidden Response when origin is not allowed", () => {
			const req = new Request("https://worker.example.com/mcp", {
				method: "POST",
				headers: { Origin: "https://disallowed.example.com" },
			});
			const result = validateOrigin(req, env);
			expect(result).toBeInstanceOf(Response);
			expect((result as Response).status).toBe(403);
		});

		it("allows any origin when MCP_DISABLE_ORIGIN_CHECK is true", () => {
			const disabledEnv: WorkerEnv = {
				MCP_DISABLE_ORIGIN_CHECK: "true",
			};
			const req = new Request("https://worker.example.com/mcp", {
				method: "POST",
				headers: { Origin: "https://any.example.com" },
			});
			expect(validateOrigin(req, disabledEnv)).toBe("https://any.example.com");
		});

		it("allows null origin on POST /authorize when OAuth is enabled", () => {
			const oauthEnv: WorkerEnv = {
				OAUTH_KV: {
					get: () => Promise.resolve(null),
					put: () => Promise.resolve(),
					delete: () => Promise.resolve(),
					list: () => Promise.resolve({ keys: [] }),
				},
			};
			const req = new Request("https://worker.example.com/authorize", {
				method: "POST",
				headers: { Origin: "null" },
			});
			expect(validateOrigin(req, oauthEnv)).toBe("null");
		});
	});

	describe("CORS and response helpers", () => {
		it("corsHeaders sets Access-Control-Allow-Origin and Vary", () => {
			const headers = corsHeaders("https://test.example.com");
			expect(headers.get("Access-Control-Allow-Origin")).toBe(
				"https://test.example.com",
			);
			expect(headers.get("Vary")).toBe("Origin");
		});

		it("withCors attaches CORS headers to response", () => {
			const base = new Response("ok", { status: 200 });
			const withC = withCors(base, "https://test.example.com");
			expect(withC.headers.get("Access-Control-Allow-Origin")).toBe(
				"https://test.example.com",
			);
			expect(withC.headers.get("Vary")).toBe("Origin");
		});

		it("response creates a Response with CORS", async () => {
			const res = response("Not Found", 404, "https://test.example.com");
			expect(res.status).toBe(404);
			expect(await res.text()).toBe("Not Found");
			expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
				"https://test.example.com",
			);
		});
	});

	describe("healthResponse and healthResponseWithCors", () => {
		it("handles GET /health with 200 OK", async () => {
			const req = new Request("https://worker.example.com/health", {
				method: "GET",
			});
			const res = healthResponse(req);
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ status: "ok" });
		});

		it("handles OPTIONS /health with 204 No Content", () => {
			const req = new Request("https://worker.example.com/health", {
				method: "OPTIONS",
			});
			const res = healthResponse(req);
			expect(res.status).toBe(204);
		});

		it("rejects non-GET/OPTIONS requests with 405 Method Not Allowed", () => {
			const req = new Request("https://worker.example.com/health", {
				method: "POST",
			});
			const res = healthResponse(req);
			expect(res.status).toBe(405);
		});

		it("healthResponseWithCors adds CORS to health response", () => {
			const req = new Request("https://worker.example.com/health", {
				method: "GET",
				headers: { Origin: "https://claude.ai" },
			});
			const res = healthResponseWithCors(req, {});
			expect(res.status).toBe(200);
			expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
				"https://claude.ai",
			);
		});
	});

	describe("resolveHevyApiBaseUrl", () => {
		it("returns default when undefined", () => {
			expect(resolveHevyApiBaseUrl(undefined)).toBe("https://api.hevyapp.com");
		});

		it("returns origin for valid base URL", () => {
			expect(resolveHevyApiBaseUrl("https://custom.example.com/")).toBe(
				"https://custom.example.com",
			);
		});

		it("throws TypeError for invalid base URLs", () => {
			expect(() => resolveHevyApiBaseUrl("not-a-url")).toThrow(TypeError);
			expect(() => resolveHevyApiBaseUrl("ftp://example.com")).toThrow(
				TypeError,
			);
			expect(() =>
				resolveHevyApiBaseUrl("https://user:pass@example.com"),
			).toThrow(TypeError);
			expect(() => resolveHevyApiBaseUrl("https://example.com/path")).toThrow(
				TypeError,
			);
		});
	});
});
