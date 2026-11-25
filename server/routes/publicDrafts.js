import express from 'express';
import {
  authenticateApiKey,
  authenticateSessionCookie,
  extractBearerToken,
} from '../middleware/auth.js';
import { applyExternalApiCors, createRateLimiter } from '../middleware/security.js';
import {
  CreatePublicDraftSchema,
  createPublicDraft,
  getPublicDraft,
  resolveBaseUrl,
} from '../services/diagramService.js';

/**
 * Create diagram draft router (/api/public/*) locked strictly to Pro / Owner accounts
 * (via either Bearer API key or authenticated browser session cookie).
 * @param {import('../db.js').FlowBoardDb} db
 * @param {{ enableRateLimit?: boolean }} [options]
 */
export function createPublicDraftsRouter(db, options = {}) {
  const router = express.Router();
  const draftRateLimit = createRateLimiter({
    windowMs: 60 * 1000,
    max: 30,
    enabled: options.enableRateLimit !== false,
  });

  router.use(applyExternalApiCors);

  /**
   * Resolve caller from Bearer API key or session cookie and enforce Pro/Owner access.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async function requireProCaller(req, res, next) {
    try {
      const bearer = extractBearerToken(req);
      let user = null;
      if (bearer !== null) {
        const auth = await authenticateApiKey(db, bearer);
        if (!auth) {
          return res.status(401).json({ error: 'API Key tidak valid atau telah dicabut.' });
        }
        user = auth.user;
      } else {
        user = await authenticateSessionCookie(db, req);
      }

      if (!user) {
        return res.status(401).json({
          error: 'Tautan draf AI memerlukan akun FlowBoard Pro. Silakan masuk atau sertakan API Key.',
        });
      }
      if (!user.hasAiAccess) {
        return res.status(403).json({
          code: 'PRO_REQUIRED',
          error: 'Fitur Tautan AI & Draf Diagram khusus untuk pelanggan FlowBoard Pro.',
        });
      }

      req.user = user;
      return next();
    } catch (err) {
      return next(err);
    }
  }

  router.post('/drafts', draftRateLimit, requireProCaller, async (req, res, next) => {
    try {
      const parsed = CreatePublicDraftSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Permintaan pembuatan draf tidak valid.',
        });
      }

      const result = await createPublicDraft(db, parsed.data, resolveBaseUrl(req));
      return res.status(201).json(result);
    } catch (err) {
      if (/** @type {any} */ (err)?.status === 400) {
        return res.status(400).json({ error: /** @type {Error} */ (err).message });
      }
      return next(err);
    }
  });

  router.get('/drafts/:id', requireProCaller, async (req, res, next) => {
    try {
      const draftId = String(req.params.id || '').trim();
      if (!draftId || draftId.length > 64) {
        return res.status(400).json({ error: 'ID draf diagram tidak valid.' });
      }

      const draft = await getPublicDraft(db, draftId);
      if (!draft) {
        return res.status(404).json({ error: 'Draf diagram tidak ditemukan atau sudah kedaluwarsa.' });
      }

      return res.status(200).json({ draft });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
