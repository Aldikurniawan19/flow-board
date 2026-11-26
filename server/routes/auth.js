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
import { resolveBaseUrl } from '../services/diagramService.js';

const GOOGLE_OAUTH_COOKIE = 'fb_google_oauth';
const GOOGLE_OAUTH_TTL_MS = 10 * 60 * 1000;
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const DEFAULT_BOARD_SETTINGS = JSON.stringify({
  renderMode: 'clean',
  gridMode: 'dots',
  snapToGrid: true,
  autoCorrectShapes: true,
  syncSameType: true,
});

/**
 * Constant-time UTF-8 string comparison.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Encode UTF-8 string to lowercase hex for cookie-safe transport.
 * @param {string} text
 * @returns {string}
 */
function utf8ToHex(text) {
  return Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
}

/**
 * Decode lowercase hex string back to UTF-8.
 * @param {string} hex
 * @returns {string | null}
 */
function hexToUtf8(hex) {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Validate relative same-origin returnTo path to prevent Open Redirects.
 * @param {unknown} raw
 * @returns {string}
 */
function sanitizeReturnTo(raw) {
  if (typeof raw !== 'string') return '/';
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed.length > 2048 ||
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    /[\r\n]/.test(trimmed)
  ) {
    return '/';
  }
  return trimmed;
}

/**
 * Append `auth_error` query parameter safely to a relative return path.
 * @param {string} returnTo
 * @param {string} code
 * @returns {string}
 */
function withAuthError(returnTo, code) {
  const safePath = sanitizeReturnTo(returnTo);
  const sep = safePath.includes('?') ? '&' : '?';
  return `${safePath}${sep}auth_error=${encodeURIComponent(code)}`;
}

/**
 * Read server-side Google OAuth configuration from environment variables.
 * @param {import('express').Request} req
 */
function getGoogleOAuthConfig(req) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() || `${resolveBaseUrl(req)}/api/auth/google/callback`;
  return {
    configured: Boolean(clientId && clientSecret),
    clientId,
    clientSecret,
    redirectUri,
  };
}

/**
 * Sign a short-lived Google OAuth state+PKCE payload with HMAC-SHA256.
 * @param {{ state: string, codeVerifier: string, returnTo: string, exp: number }} payload
 * @param {string} secret
 * @returns {string}
 */
function signGoogleOAuthCookie(payload, secret) {
  const hex = utf8ToHex(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(hex).digest('hex');
  return `${hex}.${sig}`;
}

/**
 * Verify and decode the signed Google OAuth state+PKCE cookie.
 * @param {unknown} rawCookie
 * @param {string} secret
 * @returns {{ state: string, codeVerifier: string, returnTo: string, exp: number } | null}
 */
function verifyGoogleOAuthCookie(rawCookie, secret) {
  if (typeof rawCookie !== 'string') return null;
  const dot = rawCookie.indexOf('.');
  if (dot <= 0) return null;
  const hex = rawCookie.slice(0, dot);
  const sig = rawCookie.slice(dot + 1);
  const expectedSig = crypto.createHmac('sha256', secret).update(hex).digest('hex');
  if (!safeEqual(sig, expectedSig)) return null;

  const decoded = hexToUtf8(hex);
  if (!decoded) return null;
  try {
    const parsed = JSON.parse(decoded);
    if (
      !parsed ||
      typeof parsed.state !== 'string' ||
      typeof parsed.codeVerifier !== 'string' ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= Date.now()
    ) {
      return null;
    }
    return {
      state: parsed.state,
      codeVerifier: parsed.codeVerifier,
      returnTo: sanitizeReturnTo(parsed.returnTo),
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

/**
 * Create authentication router (/api/auth/*).
 * @param {import('../db.js').FlowBoardDb} db
 * @param {{ enableRateLimit?: boolean, googleFetcher?: typeof fetch }} [options]
 */
export function createAuthRouter(db, options = {}) {
  const router = express.Router();
  const requireAuth = createRequireAuth(db);
  const httpFetch = options.googleFetcher || fetch;
  const authRateLimit = createRateLimiter({
    windowMs: 60 * 1000,
    max: 30,
    enabled: options.enableRateLimit !== false,
  });

  router.get('/providers', (req, res) => {
    const { configured } = getGoogleOAuthConfig(req);
    return res.status(200).json({ google: configured });
  });

  router.get('/google', authRateLimit, (req, res) => {
    const returnTo = sanitizeReturnTo(req.query?.returnTo);
    const cfg = getGoogleOAuthConfig(req);
    if (!cfg.configured) {
      return res.redirect(302, withAuthError(returnTo, 'google_not_configured'));
    }

    const state = crypto.randomBytes(24).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const signedCookie = signGoogleOAuthCookie(
      {
        state,
        codeVerifier,
        returnTo,
        exp: Date.now() + GOOGLE_OAUTH_TTL_MS,
      },
      cfg.clientSecret,
    );

    const sessionOpts = getSessionCookieOptions();
    res.cookie(GOOGLE_OAUTH_COOKIE, signedCookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: sessionOpts.secure,
      path: '/api/auth/google',
      maxAge: GOOGLE_OAUTH_TTL_MS,
    });

    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return res.redirect(302, `${GOOGLE_AUTH_URL}?${params.toString()}`);
  });

  router.get('/google/callback', authRateLimit, async (req, res, next) => {
    const cfg = getGoogleOAuthConfig(req);
    res.clearCookie(GOOGLE_OAUTH_COOKIE, { path: '/api/auth/google' });

    if (!cfg.configured) {
      return res.redirect(302, withAuthError('/', 'google_not_configured'));
    }

    const cookiePayload = verifyGoogleOAuthCookie(
      req.cookies?.[GOOGLE_OAUTH_COOKIE],
      cfg.clientSecret,
    );
    const returnTo = cookiePayload?.returnTo || '/';

    if (typeof req.query?.error === 'string' && req.query.error) {
      return res.redirect(302, withAuthError(returnTo, 'google_cancelled'));
    }

    const code = typeof req.query?.code === 'string' ? req.query.code.trim() : '';
    const returnedState = typeof req.query?.state === 'string' ? req.query.state.trim() : '';

    if (!cookiePayload || !code || !returnedState || !safeEqual(returnedState, cookiePayload.state)) {
      return res.redirect(302, withAuthError(returnTo, 'google_invalid_state'));
    }

    try {
      const tokenResponse = await httpFetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: cfg.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: cookiePayload.codeVerifier,
        }).toString(),
      });

      const tokenJson = /** @type {{ access_token?: string, error?: string }} */ (
        await tokenResponse.json().catch(() => ({}))
      );
      if (!tokenResponse.ok || !tokenJson.access_token) {
        return res.redirect(302, withAuthError(returnTo, 'google_exchange_failed'));
      }

      const profileResponse = await httpFetch(GOOGLE_USERINFO_URL, {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      const profile = /** @type {{ sub?: string, email?: string, email_verified?: boolean, name?: string }} */ (
        await profileResponse.json().catch(() => ({}))
      );

      const googleSub = typeof profile.sub === 'string' ? profile.sub.trim() : '';
      const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '';
      const emailVerified = profile.email_verified === true;
      if (!profileResponse.ok || !googleSub || !email) {
        return res.redirect(302, withAuthError(returnTo, 'google_profile_failed'));
      }
      if (!emailVerified) {
        return res.redirect(302, withAuthError(returnTo, 'google_email_unverified'));
      }

      const displayName =
        (typeof profile.name === 'string' && profile.name.trim().slice(0, 80)) ||
        email.split('@')[0].slice(0, 80) ||
        'Pengguna Google';

      let userRow = /** @type {{ id: string, name: string, email: string, google_sub?: string | null, plan?: string, plan_expires_at?: string | null } | undefined} */ (
        await db.get(
          'SELECT id, name, email, google_sub, plan, plan_expires_at FROM users WHERE google_sub = ?',
          [googleSub],
        )
      );

      if (!userRow) {
        const byEmail = /** @type {{ id: string, name: string, email: string, google_sub?: string | null, plan?: string, plan_expires_at?: string | null } | undefined} */ (
          await db.get(
            'SELECT id, name, email, google_sub, plan, plan_expires_at FROM users WHERE email = ?',
            [email],
          )
        );
        if (byEmail) {
          await db.run('UPDATE users SET google_sub = ? WHERE id = ?', [googleSub, byEmail.id]);
          userRow = { ...byEmail, google_sub: googleSub };
        }
      }

      if (!userRow) {
        const userId = crypto.randomUUID();
        const now = new Date().toISOString();
        const oauthPlaceholderHash = `!oauth:google:${crypto.randomBytes(16).toString('hex')}`;

        await db.run(
          'INSERT INTO users (id, name, email, password_hash, google_sub, plan, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [userId, displayName, email, oauthPlaceholderHash, googleSub, 'free', now],
        );

        const firstBoardId = crypto.randomUUID();
        await db.run(
          `INSERT INTO boards (id, user_id, title, settings_json, elements_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [firstBoardId, userId, 'Papan Kerja Pertama', DEFAULT_BOARD_SETTINGS, '[]', now, now],
        );

        userRow = {
          id: userId,
          name: displayName,
          email,
          google_sub: googleSub,
          plan: 'free',
          plan_expires_at: null,
        };
      }

      const sessionToken = await createSession(db, userRow.id);
      res.cookie(SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions());
      return res.redirect(302, returnTo);
    } catch (err) {
      return next(err);
    }
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

      if (user.password_hash.startsWith('!oauth:')) {
        return res.status(401).json({
          error: 'Akun ini terdaftar menggunakan Google. Silakan klik "Masuk dengan Google".',
        });
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
