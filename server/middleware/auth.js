import crypto from 'node:crypto';

export const SESSION_COOKIE_NAME = 'fb_session';
export const API_KEY_PREFIX = 'fbk_';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
 * @returns {Promise<{ user: { id: string, name: string, email: string }, keyId: string } | null>}
 */
export async function authenticateApiKey(db, rawKey) {
  if (!rawKey || !rawKey.startsWith(API_KEY_PREFIX) || rawKey.length < 20) {
    return null;
  }
  const keyHash = hashSessionToken(rawKey);
  const row = /** @type {{ key_id: string, id: string, name: string, email: string } | undefined} */ (
    await db.get(
      `SELECT k.id AS key_id, u.id, u.name, u.email
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
    user: { id: row.id, name: row.name, email: row.email },
  };
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
      const row = /** @type {{ id: string, name: string, email: string, expires_at: string } | undefined} */ (
        await db.get(
          `SELECT u.id, u.name, u.email, s.expires_at
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

      req.user = { id: row.id, name: row.name, email: row.email };
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
