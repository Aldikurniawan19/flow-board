import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { LoginSchema, RegisterSchema } from '../../src/types/schema.js';
import {
  SESSION_COOKIE_NAME,
  createRequireAuth,
  createSession,
  deleteSession,
  getSessionCookieOptions,
} from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/security.js';

const DEFAULT_BOARD_SETTINGS = JSON.stringify({
  renderMode: 'clean',
  gridMode: 'dots',
  snapToGrid: true,
});

/**
 * Create authentication router (/api/auth/*).
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ enableRateLimit?: boolean }} [options]
 */
export function createAuthRouter(db, options = {}) {
  const router = express.Router();
  const requireAuth = createRequireAuth(db);
  const authRateLimit = createRateLimiter({
    windowMs: 60 * 1000,
    max: 30,
    enabled: options.enableRateLimit !== false,
  });

  router.post('/register', authRateLimit, async (req, res, next) => {
    try {
      const parsed = RegisterSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Data pendaftaran tidak valid.',
        });
      }

      const { name, email, password } = parsed.data;
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existing) {
        return res.status(409).json({
          error: 'Email sudah terdaftar. Silakan masuk atau gunakan email lain.',
        });
      }

      const userId = crypto.randomUUID();
      const passwordHash = await bcrypt.hash(password, 10);
      const now = new Date().toISOString();

      db.prepare(
        'INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(userId, name, email, passwordHash, now);

      const firstBoardId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO boards (id, user_id, title, settings_json, elements_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(firstBoardId, userId, 'Papan Kerja Pertama', DEFAULT_BOARD_SETTINGS, '[]', now, now);

      const token = createSession(db, userId);
      res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

      return res.status(201).json({
        user: { id: userId, name, email },
      });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/login', authRateLimit, async (req, res, next) => {
    try {
      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Data masuk tidak valid.',
        });
      }

      const { email, password } = parsed.data;
      const user = /** @type {{ id: string, name: string, email: string, password_hash: string } | undefined} */ (
        db
          .prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?')
          .get(email)
      );

      if (!user) {
        return res.status(401).json({ error: 'Email atau kata sandi salah.' });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Email atau kata sandi salah.' });
      }

      const token = createSession(db, user.id);
      res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

      return res.status(200).json({
        user: { id: user.id, name: user.name, email: user.email },
      });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/logout', (req, res) => {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (rawToken && typeof rawToken === 'string') {
      deleteSession(db, rawToken);
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return res.status(200).json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => {
    return res.status(200).json({ user: req.user });
  });

  return router;
}
