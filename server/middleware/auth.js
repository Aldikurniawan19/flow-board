import crypto from 'node:crypto';

export const SESSION_COOKIE_NAME = 'fb_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
