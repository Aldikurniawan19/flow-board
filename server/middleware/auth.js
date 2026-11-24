import crypto from 'node:crypto';

export const SESSION_COOKIE_NAME = 'fb_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Hash raw session token with SHA-256 before storing in SQLite.
 * @param {string} rawToken
 * @returns {string}
 */
export function hashSessionToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generate a secure random session token and persist its hash.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} userId
 * @returns {string}
 */
export function createSession(db, userId) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
  ).run(tokenHash, userId, expiresAt, now.toISOString());

  return rawToken;
}

/**
 * Remove a session by raw token.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} rawToken
 */
export function deleteSession(db, rawToken) {
  const tokenHash = hashSessionToken(rawToken);
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

/**
 * Build cookie flags for session token.
 * @returns {import('express').CookieOptions}
 */
export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}

/**
 * Middleware that validates session cookie and populates req.user.
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function createRequireAuth(db) {
  return function requireAuth(req, res, next) {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (!rawToken || typeof rawToken !== 'string') {
      return res.status(401).json({
        error: 'Autentikasi diperlukan. Silakan masuk terlebih dahulu.',
      });
    }

    const tokenHash = hashSessionToken(rawToken);
    const row = /** @type {{ id: string, name: string, email: string, expires_at: string } | undefined} */ (
      db
        .prepare(
          `SELECT u.id, u.name, u.email, s.expires_at
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ?`,
        )
        .get(tokenHash)
    );

    if (!row) {
      return res.status(401).json({
        error: 'Sesi tidak valid. Silakan masuk kembali.',
      });
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      return res.status(401).json({
        error: 'Sesi telah berakhir. Silakan masuk kembali.',
      });
    }

    req.user = { id: row.id, name: row.name, email: row.email };
    return next();
  };
}
