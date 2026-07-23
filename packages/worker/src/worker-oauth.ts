import {
	type AuthRequest,
	OAuthProvider,
	type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { z } from "zod";
import { createSafeErrorDiagnostic } from "@hevy-mcp/core";

const MCP_PATH = "/mcp";
const AUTHORIZE_PATH = "/authorize";
const TOKEN_PATH = "/token";
const REGISTER_PATH = "/register";

/** Outcome of checking a Hevy API key against the upstream Hevy API. */
export type HevyApiKeyValidation =
	| "valid"
	| "invalid"
	| "unavailable"
	| "config-error";

/**
 * Hevy-specific behavior injected by the Worker entrypoint so this module
 * stays focused on the OAuth flow itself.
 */
export interface HevyOAuthDependencies<Env> {
	validateApiKey(apiKey: string, env: Env): Promise<HevyApiKeyValidation>;
	serveMcp(request: Request, env: Env, apiKey: string): Promise<Response>;
}

/** Grant props stored (encrypted) by the OAuth provider for each grant. */
export interface HevyGrantProps {
	hevyApiKey: string;
	[key: string]: unknown;
}

interface OAuthProviderEnv {
	OAUTH_PROVIDER: OAuthHelpers;
}

export interface HevyOAuthWorker<Env> {
	fetch(request: Request, env: Env, ctx: object): Promise<Response>;
}

/**
 * Access tokens minted by the OAuth provider always have the shape
 * `userId:grantId:secret`. Hevy API keys never contain a colon, so a
 * bearer value matching this shape routes to the OAuth layer while
 * everything else keeps using the legacy direct-API-key path.
 */
export function hasOAuthAccessTokenShape(token: string): boolean {
	return /^[^:]+:[^:]+:[^:]+$/.test(token);
}

function isKvNamespaceLike(value: unknown): boolean {
	if (typeof value !== "object" || value === null) return false;
	const kv = value as Record<string, unknown>;
	return (
		typeof kv.get === "function" &&
		typeof kv.put === "function" &&
		typeof kv.delete === "function" &&
		typeof kv.list === "function"
	);
}

/**
 * OAuth is enabled only when OAUTH_KV is bound to something that actually
 * looks like a KV namespace. A misconfigured binding (e.g. a plain string
 * var) must not route requests into the OAuth provider, where it would
 * fail at runtime.
 */
export function isOAuthEnabled(env: { OAUTH_KV?: unknown }): boolean {
	return isKvNamespaceLike(env.OAUTH_KV);
}

async function deriveUserId(apiKey: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(apiKey),
	);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export function encodeAuthRequest(authRequest: AuthRequest): string {
	const bytes = new TextEncoder().encode(JSON.stringify(authRequest));
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}

/**
 * Shape an authorization request must have before this Worker completes it.
 * PKCE with S256 is mandatory (the MCP authorization spec requires PKCE):
 * without a stored code challenge the provider would treat the grant as
 * non-PKCE and allow the authorization code to be redeemed without a
 * verifier. `parseAuthRequest` output (`state` always a string, possibly
 * empty) and round-tripped payloads both satisfy this schema; unknown
 * fields such as `resource` pass through untouched.
 */
const authRequestSchema = z.looseObject({
	responseType: z.literal("code"),
	clientId: z.string().min(1),
	redirectUri: z.string().min(1),
	scope: z.array(z.string()),
	state: z.string(),
	codeChallenge: z.string().min(1),
	codeChallengeMethod: z.literal("S256"),
	resource: z.union([z.string(), z.array(z.string())]).optional(),
});

export function validateAuthRequest(value: unknown): AuthRequest | null {
	const result = authRequestSchema.safeParse(value);
	return result.success ? result.data : null;
}

export function decodeAuthRequest(encoded: string): AuthRequest | null {
	let parsed: unknown;
	try {
		const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
		const binary = atob(base64);
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		parsed = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return null;
	}
	return validateAuthRequest(parsed);
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

const HTML_RESPONSE_HEADERS: Record<string, string> = {
	"Content-Type": "text/html; charset=utf-8",
	"Cache-Control": "no-store",
	"X-Frame-Options": "DENY",
	"Referrer-Policy": "no-referrer",
	// No form-action directive: Chrome applies it to the redirect that
	// follows the form submission, which would block the 302 back to the
	// OAuth client's redirect_uri (e.g. claude.ai) after approval.
	"Content-Security-Policy":
		"default-src 'none'; style-src 'unsafe-inline'; " +
		"frame-ancestors 'none'; base-uri 'none'",
};

function htmlResponse(body: string, status = 200): Response {
	return new Response(body, { status, headers: HTML_RESPONSE_HEADERS });
}

const AUTHORIZE_PAGE_STYLES = `
	:root { color-scheme: light dark; }
	body {
		font-family: system-ui, -apple-system, sans-serif;
		background: #f4f4f5; color: #18181b;
		display: flex; justify-content: center;
		margin: 0; padding: 2rem 1rem; min-height: 100vh;
		box-sizing: border-box;
	}
	main {
		background: #ffffff; border: 1px solid #e4e4e7; border-radius: 12px;
		padding: 2rem; max-width: 26rem; width: 100%;
		height: fit-content; box-sizing: border-box;
	}
	h1 { font-size: 1.25rem; margin: 0 0 1rem; }
	p { line-height: 1.5; margin: 0 0 1rem; }
	label { display: block; font-weight: 600; margin-bottom: 0.5rem; }
	input[type="password"] {
		width: 100%; box-sizing: border-box; font-size: 1rem;
		padding: 0.6rem 0.75rem; margin-bottom: 1rem;
		border: 1px solid #d4d4d8; border-radius: 8px;
		background: inherit; color: inherit;
	}
	button {
		width: 100%; font-size: 1rem; font-weight: 600;
		padding: 0.7rem; border: none; border-radius: 8px;
		background: #2563eb; color: #ffffff; cursor: pointer;
	}
	.error {
		background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c;
		border-radius: 8px; padding: 0.75rem; margin-bottom: 1rem;
	}
	.hint { font-size: 0.875rem; color: #52525b; }
	a { color: #2563eb; }
	@media (prefers-color-scheme: dark) {
		body { background: #18181b; color: #fafafa; }
		main { background: #27272a; border-color: #3f3f46; }
		input[type="password"] { border-color: #52525b; }
		.error { background: #450a0a; border-color: #7f1d1d; color: #fca5a5; }
		.hint { color: #a1a1aa; }
	}
`;

export interface AuthorizePageOptions {
	clientName: string;
	encodedRequest: string;
	error?: string;
}

export function renderAuthorizePage(options: AuthorizePageOptions): string {
	const clientName = escapeHtml(options.clientName);
	const encodedRequest = escapeHtml(options.encodedRequest);
	const errorBanner = options.error
		? `<div class="error">${escapeHtml(options.error)}</div>`
		: "";
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect ${clientName} to Hevy</title>
<style>${AUTHORIZE_PAGE_STYLES}</style>
</head>
<body>
<main>
<h1>Connect to Hevy</h1>
<p><strong>${clientName}</strong> is requesting access to your Hevy account
through the hevy-mcp server.</p>
${errorBanner}
<form method="post" action="${AUTHORIZE_PATH}">
<input type="hidden" name="oauth_request" value="${encodedRequest}">
<label for="hevy_api_key">Hevy API key</label>
<input type="password" id="hevy_api_key" name="hevy_api_key"
	autocomplete="off" required>
<button type="submit">Connect</button>
</form>
<p class="hint">Find your API key at
<a href="https://hevy.com/settings?developer" rel="noreferrer">
hevy.com/settings &rarr; Developer</a> (requires Hevy Pro). The key is
validated with Hevy and stored encrypted for this connection only. Rotating
the key in Hevy revokes access.</p>
</main>
</body>
</html>`;
}

function authorizeErrorResponse(message: string, status: number): Response {
	return htmlResponse(
		`<!doctype html><html lang="en"><head><meta charset="utf-8">` +
			`<title>Authorization error</title></head>` +
			`<body><p>${escapeHtml(message)}</p></body></html>`,
		status,
	);
}

export async function handleAuthorizeGet(
	request: Request,
	helpers: OAuthHelpers,
): Promise<Response> {
	let parsedRequest: AuthRequest;
	try {
		parsedRequest = await helpers.parseAuthRequest(request);
	} catch {
		return authorizeErrorResponse("Invalid authorization request.", 400);
	}
	const authRequest = validateAuthRequest(parsedRequest);
	if (!authRequest) {
		return authorizeErrorResponse(
			"Invalid authorization request. This server requires the " +
				"authorization code flow with PKCE (S256 code challenge).",
			400,
		);
	}
	const client = await helpers.lookupClient(authRequest.clientId);
	if (!client) {
		return authorizeErrorResponse("Unknown OAuth client.", 400);
	}
	return htmlResponse(
		renderAuthorizePage({
			clientName: client.clientName?.trim() || client.clientId,
			encodedRequest: encodeAuthRequest(authRequest),
		}),
	);
}

export async function handleAuthorizePost<Env>(
	request: Request,
	env: Env,
	helpers: OAuthHelpers,
	dependencies: HevyOAuthDependencies<Env>,
): Promise<Response> {
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return authorizeErrorResponse("Invalid form submission.", 400);
	}
	const encodedRequest = form.get("oauth_request");
	const authRequest =
		typeof encodedRequest === "string"
			? decodeAuthRequest(encodedRequest)
			: null;
	if (!authRequest) {
		return authorizeErrorResponse("Invalid authorization request.", 400);
	}
	const client = await helpers.lookupClient(authRequest.clientId);
	if (!client) {
		return authorizeErrorResponse("Unknown OAuth client.", 400);
	}
	const clientName = client.clientName?.trim() || client.clientId;
	const rerender = (error: string, status: number): Response =>
		htmlResponse(
			renderAuthorizePage({
				clientName,
				encodedRequest: encodedRequest as string,
				error,
			}),
			status,
		);

	const apiKeyEntry = form.get("hevy_api_key");
	const apiKey = typeof apiKeyEntry === "string" ? apiKeyEntry.trim() : "";
	if (!apiKey) return rerender("Enter your Hevy API key.", 400);

	const validation = await dependencies.validateApiKey(apiKey, env);
	if (validation === "config-error") {
		return new Response("Worker configuration error", { status: 500 });
	}
	if (validation === "unavailable") {
		return rerender(
			"Hevy is temporarily unavailable. Please try again in a moment.",
			502,
		);
	}
	if (validation === "invalid") {
		return rerender(
			"Hevy rejected this API key. Check the key and try again.",
			401,
		);
	}

	try {
		const props: HevyGrantProps = { hevyApiKey: apiKey };
		const { redirectTo } = await helpers.completeAuthorization({
			request: authRequest,
			userId: await deriveUserId(apiKey),
			metadata: {},
			scope: authRequest.scope,
			props,
		});
		return new Response(null, {
			status: 302,
			headers: { Location: redirectTo, "Cache-Control": "no-store" },
		});
	} catch (error) {
		console.error({
			event: "worker.error",
			context: "oauth-complete-authorization",
			...createSafeErrorDiagnostic(error),
		});
		return authorizeErrorResponse(
			"Authorization could not be completed. Please try again.",
			502,
		);
	}
}

function oauthUnauthorizedResponse(request: Request): Response {
	const url = new URL(request.url);
	const resourceMetadataUrl =
		`${url.origin}/.well-known/oauth-protected-resource` + url.pathname;
	return new Response("Unauthorized", {
		status: 401,
		headers: {
			"WWW-Authenticate":
				'Bearer error="invalid_token", ' +
				'error_description="The Hevy API key behind this grant is no ' +
				'longer valid", ' +
				`resource_metadata="${resourceMetadataUrl}"`,
		},
	});
}

async function handleAuthorizedMcpRequest<Env>(
	request: Request,
	env: Env,
	ctx: object,
	dependencies: HevyOAuthDependencies<Env>,
): Promise<Response> {
	const props = (ctx as { props?: Partial<HevyGrantProps> } | null | undefined)
		?.props;
	const apiKey =
		typeof props?.hevyApiKey === "string" ? props.hevyApiKey : null;
	if (!apiKey) return oauthUnauthorizedResponse(request);

	const validation = await dependencies.validateApiKey(apiKey, env);
	if (validation === "config-error") {
		return new Response("Worker configuration error", { status: 500 });
	}
	if (validation === "invalid") return oauthUnauthorizedResponse(request);
	if (validation === "unavailable") {
		return new Response("Hevy API is temporarily unavailable", {
			status: 502,
		});
	}
	return dependencies.serveMcp(request, env, apiKey);
}

/**
 * Build the OAuth provider that fronts the Worker when an `OAUTH_KV`
 * namespace is bound. It implements OAuth 2.1 authorization code flow with
 * PKCE, CIMD client metadata with DCR fallback, and RFC 8414 / RFC 9728
 * discovery metadata for remote MCP clients including ChatGPT.
 */
export function createHevyOAuthProvider<Env extends object>(
	dependencies: HevyOAuthDependencies<Env>,
): HevyOAuthWorker<Env> {
	const provider = new OAuthProvider({
		apiRoute: MCP_PATH,
		apiHandler: {
			fetch: (request: Request, env: Env, ctx: object) =>
				handleAuthorizedMcpRequest(request, env, ctx, dependencies),
		},
		defaultHandler: {
			fetch: async (request: Request, env: Env & OAuthProviderEnv) => {
				const url = new URL(request.url);
				if (url.pathname !== AUTHORIZE_PATH) {
					return new Response("Not found", { status: 404 });
				}
				if (request.method === "GET") {
					return handleAuthorizeGet(request, env.OAUTH_PROVIDER);
				}
				if (request.method === "POST") {
					return handleAuthorizePost(
						request,
						env,
						env.OAUTH_PROVIDER,
						dependencies,
					);
				}
				return new Response("Method not allowed", {
					status: 405,
					headers: { Allow: "GET, POST" },
				});
			},
		},
		authorizeEndpoint: AUTHORIZE_PATH,
		tokenEndpoint: TOKEN_PATH,
		clientRegistrationEndpoint: REGISTER_PATH,
		clientIdMetadataDocumentEnabled: true,
		allowPlainPKCE: false,
		resourceMetadata: { resource_name: "Hevy MCP Server" },
	});
	return provider as unknown as HevyOAuthWorker<Env>;
}
