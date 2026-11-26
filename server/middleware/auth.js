import crypto from 'node:crypto';

export const SESSION_COOKIE_NAME = 'fb_session';
export const API_KEY_PREFIX = 'fbk_';
export const OAUTH_ACCESS_TOKEN_PREFIX = 'fbo_';
export const OAUTH_REFRESH_TOKEN_PREFIX = 'fbr_';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Parse comma-separated server-only environment variable list.
 * @param {string | undefined} raw
 * @param {boolean} [lowercase]
 * @returns {Set<string>}
 */
function parseEnvAllowlist(raw, lowercase = false) {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((item) => (lowercase ? item.trim().toLowerCase() : item.trim()))
      .filter(Boolean),
  );
}

/**
 * Resolve server-side user entitlement flags (never trusted from client input).
 * Owner accounts are configured exclusively via server-side env vars:
 * - `OWNER_EMAILS` (comma-separated emails)
 * - `OWNER_USER_IDS` (comma-separated user UUIDs)
 * @param {{ id: string, name: string, email: string, plan?: string | null, plan_expires_at?: string | null }} row
 */
export function buildAuthUser(row) {
  const ownerEmails = parseEnvAllowlist(process.env.OWNER_EMAILS, true);
  const ownerIds = parseEnvAllowlist(process.env.OWNER_USER_IDS, false);
  const isOwner =
    ownerIds.has(row.id) || ownerEmails.has(String(row.email || '').trim().toLowerCase());

  const rawPlan = row.plan === 'pro' ? 'pro' : 'free';
  const expiresMs = row.plan_expires_at ? new Date(row.plan_expires_at).getTime() : null;
  const planActive =
    rawPlan === 'pro' && (expiresMs === null || !Number.isFinite(expiresMs) || expiresMs > Date.now());
  const effectivePlan = isOwner || planActive ? /** @type {const} */ ('pro') : /** @type {const} */ ('free');

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    plan: effectivePlan,
    isOwner,
    hasAiAccess: isOwner || planActive,
  };
}

/**
 * Express middleware that enforces Pro/Owner entitlement after authentication.
 * Prevents free users from bypassing the UI paywall via direct API calls.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requireAiAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Autentikasi diperlukan. Silakan masuk terlebih dahulu.',
    });
  }
  if (!req.user.hasAiAccess) {
    return res.status(403).json({
      code: 'PRO_REQUIRED',
      error: 'Fitur Integrasi AI, MCP Server, dan Tautan AI khusus untuk akun FlowBoard Pro.',
    });
  }
  return next();
}

/**
 * Generate a cryptographically random personal API key and its SHA-256 hash.
 * Raw keys are returned only once at creation time and never persisted.
 * @returns {{ rawKey: string, keyPrefix: string, keyHash: string }}
 */
export function generateApiKey() {
  const rawKey = `${API_KEY_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
  const keyPrefix = rawKey.slice(0, 12);
  const keyHash = hashSessionToken(rawKey);
  return { rawKey, keyPrefix, keyHash };
}

/**
 * Extract Bearer token from Authorization header if present.
 * @param {import('express').Request} req
 * @returns {string | null}
 */
export function extractBearerToken(req) {
  const authHeader = req.get('Authorization');
  if (!authHeader || typeof authHeader !== 'string') return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Validate a personal API key against the database and return its owning user.
 * @param {import('../db.js').FlowBoardDb} db
 * @param {string} rawKey
 * @returns {Promise<{ user: { id: string, name: string, email: string, plan: 'free' | 'pro', isOwner: boolean, hasAiAccess: boolean }, keyId: string } | null>}
 */
export async function authenticateApiKey(db, rawKey) {
  if (!rawKey || !rawKey.startsWith(API_KEY_PREFIX) || rawKey.length < 20) {
    return null;
  }
  const keyHash = hashSessionToken(rawKey);
  const row = /** @type {{ key_id: string, id: string, name: string, email: string, plan?: string, plan_expires_at?: string | null } | undefined} */ (
    await db.get(
      `SELECT k.id AS key_id, u.id, u.name, u.email, u.plan, u.plan_expires_at
       FROM api_keys k
       JOIN users u ON u.id = k.user_id
       WHERE k.key_hash = ?`,
      [keyHash],
    )
  );
  if (!row) return null;

  await db
    .run('UPDATE api_keys SET last_used_at = ? WHERE id = ?', [
      new Date().toISOString(),
      row.key_id,
    ])
    .catch(() => {});

  return {
    keyId: row.key_id,
    user: buildAuthUser(row),
  };
}

/**
 * Normalize an OAuth resource URI for strict RFC 8707 audience comparison.
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function normalizeResourceUri(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const cleanPath = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.origin.toLowerCase()}${cleanPath === '/' ? '' : cleanPath}`;
  } catch {
    return null;
  }
}

/**
 * Validate an OAuth 2.1 Bearer access token (`fbo_...`) against the database,
 * checking expiration, revocation, and optional RFC 8707 resource audience binding.
 * @param {import('../db.js').FlowBoardDb} db
 * @param {string} rawToken
 * @param {string} [expectedResource]
 * @returns {Promise<{ user: { id: string, name: string, email: string, plan: 'free' | 'pro', isOwner: boolean, hasAiAccess: boolean }, tokenId: string, clientId: string, scope: string } | null>}
 */
export async function authenticateOAuthAccessToken(db, rawToken, expectedResource) {
  if (!rawToken || !rawToken.startsWith(OAUTH_ACCESS_TOKEN_PREFIX) || rawToken.length < 24) {
    return null;
  }
  const tokenHash = hashSessionToken(rawToken);
  const row = /** @type {{ token_id: string, client_id: string, scope: string, resource: string | null, expires_at: string, revoked_at: string | null, id: string, name: string, email: string, plan?: string, plan_expires_at?: string | null } | undefined} */ (
    await db.get(
      `SELECT t.id AS token_id, t.client_id, t.scope, t.resource, t.expires_at, t.revoked_at,
              u.id, u.name, u.email, u.plan, u.plan_expires_at
       FROM oauth_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.access_token_hash = ?`,
      [tokenHash],
    )
  );
  if (!row || row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  if (row.resource && expectedResource) {
    const bound = normalizeResourceUri(row.resource);
    const target = normalizeResourceUri(expectedResource);
    const targetOrigin = target ? normalizeResourceUri(new URL(target).origin) : null;
    if (bound && target && bound !== target && bound !== targetOrigin) {
      return null;
    }
  }

  await db
    .run('UPDATE oauth_tokens SET last_used_at = ? WHERE id = ?', [
      new Date().toISOString(),
      row.token_id,
    ])
    .catch(() => {});

  return {
    tokenId: row.token_id,
    clientId: row.client_id,
    scope: row.scope,
    user: buildAuthUser(row),
  };
}

/**
 * Authenticate any supported FlowBoard Bearer credential:
 * - Personal API key (`fbk_...`)
 * - OAuth 2.1 access token (`fbo_...`)
 * @param {import('../db.js').FlowBoardDb} db
 * @param {string} rawToken
 * @param {string} [expectedResource]
 * @returns {Promise<{ user: { id: string, name: string, email: string, plan: 'free' | 'pro', isOwner: boolean, hasAiAccess: boolean }, authType: 'api_key' | 'oauth', credentialId: string } | null>}
 */
export async function authenticateBearerToken(db, rawToken, expectedResource) {
  if (!rawToken) return null;
  if (rawToken.startsWith(OAUTH_ACCESS_TOKEN_PREFIX)) {
    const oauth = await authenticateOAuthAccessToken(db, rawToken, expectedResource);
    if (!oauth) return null;
    return { user: oauth.user, authType: 'oauth', credentialId: oauth.tokenId };
  }
  const apiKey = await authenticateApiKey(db, rawToken);
  if (!apiKey) return null;
  return { user: apiKey.user, authType: 'api_key', credentialId: apiKey.keyId };
}

/**
 * Authenticate a browser session cookie and return the resolved user if valid.
 * @param {import('../db.js').FlowBoardDb} db
 * @param {import('express').Request} req
 */
export async function authenticateSessionCookie(db, req) {
  const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (!rawToken || typeof rawToken !== 'string') return null;

  const tokenHash = hashSessionToken(rawToken);
  const row = /** @type {{ id: string, name: string, email: string, plan?: string, plan_expires_at?: string | null, expires_at: string } | undefined} */ (
    await db.get(
      `SELECT u.id, u.name, u.email, u.plan, u.plan_expires_at, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
      [tokenHash],
    )
  );
  if (!row) return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await db.run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
    return null;
  }

  return buildAuthUser(row);
}

/**
 * Middleware that requires a valid Bearer API key (`Authorization: Bearer fbk_...`).
 * Never accepts cookies so external API clients are immune to browser CSRF.
 * @param {import('../db.js').FlowBoardDb} db
 */
export function createRequireApiKey(db) {
  return async function requireApiKey(req, res, next) {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        return res.status(401).json({
          error: 'API Key diperlukan. Sertakan header Authorization: Bearer fbk_...',
        });
      }
      const auth = await authenticateApiKey(db, token);
      if (!auth) {
        return res.status(401).json({
          error: 'API Key tidak valid atau telah dicabut.',
        });
      }
      req.user = auth.user;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Hash raw session token with SHA-256 before storing in the database.
 * @param {string} rawToken
 * @returns {string}
 */
export function hashSessionToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generate a secure random session token and persist its hash.
 * @param {import('../db.js').FlowBoardDb} db
 * @param {string} userId
 * @returns {Promise<string>}
 */
export async function createSession(db, userId) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  await db.run(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    [tokenHash, userId, expiresAt, now.toISOString()],
  );

  return rawToken;
}

/**
 * Remove a session by raw token.
 * @param {import('../db.js').FlowBoardDb} db
 * @param {string} rawToken
 */
export async function deleteSession(db, rawToken) {
  const tokenHash = hashSessionToken(rawToken);
  await db.run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
}

/**
 * Build cookie flags for session token.
 * Automatically enables `secure: true` on Vercel/HTTPS production environments.
 * @returns {import('express').CookieOptions}
 */
export function getSessionCookieOptions() {
  const isSecure =
    process.env.COOKIE_SECURE === 'true' ||
    Boolean(process.env.VERCEL) ||
    process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure,
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}

/**
 * Middleware that validates session cookie and populates req.user.
 * @param {import('../db.js').FlowBoardDb} db
 */
export function createRequireAuth(db) {
  return async function requireAuth(req, res, next) {
    try {
      const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
      if (!rawToken || typeof rawToken !== 'string') {
        return res.status(401).json({
          error: 'Autentikasi diperlukan. Silakan masuk terlebih dahulu.',
        });
      }

      const tokenHash = hashSessionToken(rawToken);
      const row = /** @type {{ id: string, name: string, email: string, plan?: string, plan_expires_at?: string | null, expires_at: string } | undefined} */ (
        await db.get(
          `SELECT u.id, u.name, u.email, u.plan, u.plan_expires_at, s.expires_at
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ?`,
          [tokenHash],
        )
      );

      if (!row) {
        return res.status(401).json({
          error: 'Sesi tidak valid. Silakan masuk kembali.',
        });
      }

      if (new Date(row.expires_at).getTime() <= Date.now()) {
        await db.run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
        return res.status(401).json({
          error: 'Sesi telah berakhir. Silakan masuk kembali.',
        });
      }

      req.user = buildAuthUser(row);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
