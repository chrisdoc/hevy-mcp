import { timingSafeEqual } from "node:crypto";
import express from "express";
import type { SQLiteOAuthProvider } from "./oauthProvider.js";

const SESSION_ID_RE = /^[0-9a-f]{32}$/i;

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#x27;");
}

function renderForm(sessionId: string, title: string, error?: string): string {
	const errorHtml = error
		? `<p style="color:#dc2626;margin:0 0 12px;">${escapeHtml(error)}</p>`
		: "";
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.card{background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1);
padding:32px;width:100%;max-width:380px}
h1{margin:0 0 24px;font-size:1.25rem;font-weight:600;color:#111}
label{display:block;margin-bottom:6px;font-size:.875rem;color:#374151}
input[type=password]{width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;
font-size:1rem;outline:none}
input[type=password]:focus{border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,.25)}
button{margin-top:16px;width:100%;padding:10px;background:#3b82f6;color:#fff;border:none;
border-radius:6px;font-size:1rem;cursor:pointer}
button:hover{background:#2563eb}
</style>
</head>
<body>
<div class="card">
<h1>${escapeHtml(title)}</h1>
${errorHtml}
<form method="POST" action="/consent">
<input type="hidden" name="session" value="${escapeHtml(sessionId)}"/>
<label for="password">Password</label>
<input type="password" id="password" name="password" autofocus/>
<button type="submit">Authorize</button>
</form>
</div>
</body>
</html>`;
}

export function createConsentRouter(
	provider: SQLiteOAuthProvider,
	title: string,
): express.Router {
	const router = express.Router();

	router.get("/consent", (req, res) => {
		const session = req.query["session"];
		if (
			!session ||
			typeof session !== "string" ||
			!SESSION_ID_RE.test(session)
		) {
			res.status(400).send("Invalid or missing session parameter");
			return;
		}
		res.send(renderForm(session, title));
	});

	router.post(
		"/consent",
		express.urlencoded({ extended: false }),
		(req, res) => {
			const session =
				typeof req.body?.session === "string" ? req.body.session : "";
			const provided =
				typeof req.body?.password === "string" ? req.body.password : "";

			if (!session || !SESSION_ID_RE.test(session)) {
				res.status(400).send("Invalid or missing session parameter");
				return;
			}

			const expected = process.env.MCP_AUTH_PASSWORD ?? "";
			if (!expected) {
				res.send(renderForm(session, title, "Incorrect password"));
				return;
			}

			// Exact-length constant-time comparison — different lengths always fail
			const a = Buffer.from(expected);
			const b = Buffer.from(provided);
			if (a.length !== b.length || !timingSafeEqual(a, b)) {
				res.send(renderForm(session, title, "Incorrect password"));
				return;
			}

			const pending = provider.popPendingSession(session);
			if (!pending) {
				res.status(400).send("Session expired or not found");
				return;
			}

			const { client, params } = pending;
			const code = provider.createAuthorizationCode(client.client_id, params);

			const redirectUrl = new URL(params.redirectUri);
			redirectUrl.searchParams.set("code", code);
			if (params.state) redirectUrl.searchParams.set("state", params.state);

			res.redirect(302, redirectUrl.toString());
		},
	);

	return router;
}
