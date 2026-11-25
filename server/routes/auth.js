import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import { LoginSchema, RegisterSchema } from '../../src/types/schema.js';
import {
  SESSION_COOKIE_NAME,
  buildAuthUser,
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
  autoCorrectShapes: true,
});

/**
 * Create authentication router (/api/auth/*).
 * @param {import('../db.js').FlowBoardDb} db
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
      const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) {
        return res.status(409).json({
          error: 'Email sudah terdaftar. Silakan masuk atau gunakan email lain.',
        });
      }

      const userId = crypto.randomUUID();
      const passwordHash = await bcrypt.hash(password, 10);
      const now = new Date().toISOString();

      await db.run(
        'INSERT INTO users (id, name, email, password_hash, plan, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, name, email, passwordHash, 'free', now],
      );

      const firstBoardId = crypto.randomUUID();
      await db.run(
        `INSERT INTO boards (id, user_id, title, settings_json, elements_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [firstBoardId, userId, 'Papan Kerja Pertama', DEFAULT_BOARD_SETTINGS, '[]', now, now],
      );

      const token = await createSession(db, userId);
      res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

      return res.status(201).json({
        user: buildAuthUser({ id: userId, name, email, plan: 'free', plan_expires_at: null }),
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
      const user = /** @type {{ id: string, name: string, email: string, password_hash: string, plan?: string, plan_expires_at?: string | null } | undefined} */ (
        await db.get(
          'SELECT id, name, email, password_hash, plan, plan_expires_at FROM users WHERE email = ?',
          [email],
        )
      );

      if (!user) {
        return res.status(401).json({ error: 'Email atau kata sandi salah.' });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Email atau kata sandi salah.' });
      }

      const token = await createSession(db, user.id);
      res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

      return res.status(200).json({
        user: buildAuthUser(user),
      });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
      if (rawToken && typeof rawToken === 'string') {
        await deleteSession(db, rawToken);
      }
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/me', requireAuth, (req, res) => {
    return res.status(200).json({ user: req.user });
  });

  return router;
}
