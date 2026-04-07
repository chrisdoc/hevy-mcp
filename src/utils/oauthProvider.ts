import { randomBytes, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type {
	OAuthClientInformationFull,
	OAuthTokenRevocationRequest,
	OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Response } from "express";
import {
	InvalidGrantError,
	InvalidScopeError,
	InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
	AuthorizationParams,
	OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

const ACCESS_TOKEN_TTL = 3600;
const REFRESH_TOKEN_TTL = 30 * 86400;
const AUTH_CODE_TTL = 300;
// Pending sessions expire after 10 minutes; cleaned up lazily on each authorize()
const PENDING_SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_SESSIONS = 1000;

type PendingSession = {
	client: OAuthClientInformationFull;
	params: AuthorizationParams;
	expiresAt: number;
};

export class SQLiteOAuthProvider implements OAuthServerProvider {
	private _db: Database.Database | null = null;
	private readonly dbPath: string;
	private readonly issuerUrl: string;
	private readonly pendingSessions = new Map<string, PendingSession>();

	constructor(issuerUrl: string) {
		this.issuerUrl = issuerUrl;
		this.dbPath = process.env.OAUTH_DB_PATH ?? "./oauth.db";
	}

	private get db(): Database.Database {
		if (!this._db) {
			this._db = new Database(this.dbPath);
			this._db.pragma("journal_mode = WAL");
			this._db.exec(`
				CREATE TABLE IF NOT EXISTS clients (
					client_id TEXT PRIMARY KEY,
					data_json TEXT NOT NULL
				);
				CREATE TABLE IF NOT EXISTS auth_codes (
					code TEXT PRIMARY KEY,
					client_id TEXT NOT NULL,
					scopes TEXT NOT NULL,
					expires_at REAL NOT NULL,
					code_challenge TEXT NOT NULL,
					redirect_uri TEXT NOT NULL,
					resource TEXT
				);
				CREATE TABLE IF NOT EXISTS access_tokens (
					token TEXT PRIMARY KEY,
					client_id TEXT NOT NULL,
					scopes TEXT NOT NULL,
					expires_at INTEGER NOT NULL,
					resource TEXT,
					family_id TEXT NOT NULL
				);
				CREATE TABLE IF NOT EXISTS refresh_tokens (
					token TEXT PRIMARY KEY,
					client_id TEXT NOT NULL,
					scopes TEXT NOT NULL,
					expires_at INTEGER NOT NULL,
					family_id TEXT NOT NULL
				);
			`);
		}
		return this._db;
	}

	get clientsStore(): OAuthRegisteredClientsStore {
		return {
			getClient: (clientId: string) => {
				const row = this.db
					.prepare("SELECT data_json FROM clients WHERE client_id = ?")
					.get(clientId) as { data_json: string } | undefined;
				if (!row) return undefined;
				return JSON.parse(row.data_json) as OAuthClientInformationFull;
			},
			registerClient: (
				client: Omit<
					OAuthClientInformationFull,
					"client_id" | "client_id_issued_at"
				>,
			) => {
				const full: OAuthClientInformationFull = {
					...client,
					client_id: randomUUID(),
					client_id_issued_at: Math.floor(Date.now() / 1000),
				};
				this.db
					.prepare("INSERT INTO clients (client_id, data_json) VALUES (?, ?)")
					.run(full.client_id, JSON.stringify(full));
				return full;
			},
		};
	}

	async authorize(
		client: OAuthClientInformationFull,
		params: AuthorizationParams,
		res: Response,
	): Promise<void> {
		this.evictExpiredSessions();
		if (this.pendingSessions.size >= MAX_PENDING_SESSIONS) {
			// Evict the oldest entry to enforce the size cap
			const oldest = this.pendingSessions.keys().next().value;
			if (oldest) this.pendingSessions.delete(oldest);
		}
		const sessionId = randomBytes(16).toString("hex");
		this.pendingSessions.set(sessionId, {
			client,
			params,
			expiresAt: Date.now() + PENDING_SESSION_TTL_MS,
		});
		res.redirect(`${this.issuerUrl}/consent?session=${sessionId}`);
	}

	private evictExpiredSessions(): void {
		const now = Date.now();
		for (const [id, session] of this.pendingSessions) {
			if (session.expiresAt <= now) this.pendingSessions.delete(id);
		}
	}

	popPendingSession(id: string): PendingSession | undefined {
		const session = this.pendingSessions.get(id);
		this.pendingSessions.delete(id);
		if (!session || session.expiresAt <= Date.now()) return undefined;
		return session;
	}

	createAuthorizationCode(
		clientId: string,
		params: AuthorizationParams,
	): string {
		const code = randomBytes(32).toString("hex");
		const expiresAt = Date.now() / 1000 + AUTH_CODE_TTL;
		this.db
			.prepare(
				`INSERT INTO auth_codes
				(code, client_id, scopes, expires_at, code_challenge, redirect_uri, resource)
				VALUES (?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				code,
				clientId,
				JSON.stringify(params.scopes ?? []),
				expiresAt,
				params.codeChallenge,
				params.redirectUri,
				params.resource?.toString() ?? null,
			);
		return code;
	}

	async challengeForAuthorizationCode(
		_client: OAuthClientInformationFull,
		authorizationCode: string,
	): Promise<string> {
		const row = this.db
			.prepare("SELECT code_challenge FROM auth_codes WHERE code = ?")
			.get(authorizationCode) as { code_challenge: string } | undefined;
		if (!row) throw new InvalidGrantError("Authorization code not found");
		return row.code_challenge;
	}

	async exchangeAuthorizationCode(
		client: OAuthClientInformationFull,
		authorizationCode: string,
		_codeVerifier?: string,
		redirectUri?: string,
		resource?: URL,
	): Promise<OAuthTokens> {
		const row = this.db
			.prepare(
				`SELECT client_id, scopes, expires_at, redirect_uri, resource
				FROM auth_codes WHERE code = ?`,
			)
			.get(authorizationCode) as
			| {
					client_id: string;
					scopes: string;
					expires_at: number;
					redirect_uri: string;
					resource: string | null;
			  }
			| undefined;

		if (!row) throw new InvalidGrantError("Authorization code not found");
		if (row.expires_at < Date.now() / 1000)
			throw new InvalidGrantError("Authorization code expired");
		if (row.client_id !== client.client_id)
			throw new InvalidGrantError("Client mismatch");
		if (redirectUri && redirectUri !== row.redirect_uri)
			throw new InvalidGrantError("Redirect URI mismatch");

		// All validations pass — consume code and mint tokens atomically
		const storedScopes: string[] = JSON.parse(row.scopes);
		const resourceStr = resource?.toString() ?? row.resource ?? null;

		return this.db.transaction((): OAuthTokens => {
			const deleted = this.db
				.prepare("DELETE FROM auth_codes WHERE code = ?")
				.run(authorizationCode);
			if (deleted.changes === 0)
				throw new InvalidGrantError("Authorization code already used");

			const familyId = randomUUID();
			const accessTok = randomBytes(32).toString("hex");
			const refreshTok = randomBytes(32).toString("hex");
			const now = Math.floor(Date.now() / 1000);

			this.db
				.prepare(
					`INSERT INTO access_tokens (token, client_id, scopes, expires_at, resource, family_id)
					VALUES (?, ?, ?, ?, ?, ?)`,
				)
				.run(
					accessTok,
					client.client_id,
					JSON.stringify(storedScopes),
					now + ACCESS_TOKEN_TTL,
					resourceStr,
					familyId,
				);
			this.db
				.prepare(
					`INSERT INTO refresh_tokens (token, client_id, scopes, expires_at, family_id)
					VALUES (?, ?, ?, ?, ?)`,
				)
				.run(
					refreshTok,
					client.client_id,
					JSON.stringify(storedScopes),
					now + REFRESH_TOKEN_TTL,
					familyId,
				);

			return {
				access_token: accessTok,
				token_type: "bearer",
				expires_in: ACCESS_TOKEN_TTL,
				scope: storedScopes.join(" "),
				refresh_token: refreshTok,
			};
		})();
	}

	async exchangeRefreshToken(
		client: OAuthClientInformationFull,
		refreshToken: string,
		scopes?: string[],
		_resource?: URL,
	): Promise<OAuthTokens> {
		// Load, validate, rotate — all inside one transaction to prevent
		// concurrent use of the same refresh token producing multiple new tokens.
		return this.db.transaction((): OAuthTokens => {
			const row = this.db
				.prepare(
					`SELECT client_id, scopes, expires_at, family_id
					FROM refresh_tokens WHERE token = ?`,
				)
				.get(refreshToken) as
				| {
						client_id: string;
						scopes: string;
						expires_at: number;
						family_id: string;
				  }
				| undefined;

			if (!row) throw new InvalidGrantError("Refresh token not found");
			if (row.expires_at < Math.floor(Date.now() / 1000))
				throw new InvalidGrantError("Refresh token expired");
			if (row.client_id !== client.client_id)
				throw new InvalidGrantError("Client mismatch");

			const storedScopes: string[] = JSON.parse(row.scopes);
			if (scopes?.length) {
				const invalid = scopes.filter((s) => !storedScopes.includes(s));
				if (invalid.length)
					throw new InvalidScopeError(
						`Requested scopes exceed granted scopes: ${invalid.join(", ")}`,
					);
			}

			const effectiveScopes = scopes?.length ? scopes : storedScopes;
			const now = Math.floor(Date.now() / 1000);
			const familyId = row.family_id;
			const accessTok = randomBytes(32).toString("hex");
			const refreshTok = randomBytes(32).toString("hex");

			const deleted = this.db
				.prepare("DELETE FROM refresh_tokens WHERE token = ?")
				.run(refreshToken);
			if (deleted.changes === 0)
				throw new InvalidGrantError("Refresh token already used");

			this.db
				.prepare(
					`INSERT INTO access_tokens (token, client_id, scopes, expires_at, resource, family_id)
					VALUES (?, ?, ?, ?, ?, ?)`,
				)
				.run(
					accessTok,
					client.client_id,
					JSON.stringify(effectiveScopes),
					now + ACCESS_TOKEN_TTL,
					null,
					familyId,
				);
			this.db
				.prepare(
					`INSERT INTO refresh_tokens (token, client_id, scopes, expires_at, family_id)
					VALUES (?, ?, ?, ?, ?)`,
				)
				.run(
					refreshTok,
					client.client_id,
					JSON.stringify(effectiveScopes),
					now + REFRESH_TOKEN_TTL,
					familyId,
				);

			return {
				access_token: accessTok,
				token_type: "bearer",
				expires_in: ACCESS_TOKEN_TTL,
				scope: effectiveScopes.join(" "),
				refresh_token: refreshTok,
			};
		})();
	}

	async verifyAccessToken(token: string): Promise<AuthInfo> {
		const row = this.db
			.prepare(
				`SELECT client_id, scopes, expires_at, resource
				FROM access_tokens WHERE token = ?`,
			)
			.get(token) as
			| {
					client_id: string;
					scopes: string;
					expires_at: number;
					resource: string | null;
			  }
			| undefined;

		if (!row) throw new InvalidTokenError("Access token not found");
		if (row.expires_at < Math.floor(Date.now() / 1000))
			throw new InvalidTokenError("Access token expired");

		const scopes: string[] = JSON.parse(row.scopes);
		return {
			token,
			clientId: row.client_id,
			scopes,
			expiresAt: row.expires_at,
		};
	}

	async revokeToken(
		_client: OAuthClientInformationFull,
		request: OAuthTokenRevocationRequest,
	): Promise<void> {
		const token = request.token;

		// Check access_tokens first, then refresh_tokens
		const atRow = this.db
			.prepare("SELECT family_id FROM access_tokens WHERE token = ?")
			.get(token) as { family_id: string } | undefined;
		const rtRow = !atRow
			? (this.db
					.prepare("SELECT family_id FROM refresh_tokens WHERE token = ?")
					.get(token) as { family_id: string } | undefined)
			: undefined;

		const familyId = (atRow ?? rtRow)?.family_id;
		if (!familyId) return; // no-op

		this.db
			.prepare("DELETE FROM access_tokens WHERE family_id = ?")
			.run(familyId);
		this.db
			.prepare("DELETE FROM refresh_tokens WHERE family_id = ?")
			.run(familyId);
	}
}
