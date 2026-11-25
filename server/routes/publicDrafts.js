import express from 'express';
import { applyExternalApiCors, createRateLimiter } from '../middleware/security.js';
import {
  CreatePublicDraftSchema,
  createPublicDraft,
  getPublicDraft,
  resolveBaseUrl,
} from '../services/diagramService.js';

/**
 * Create public diagram draft router (/api/public/*) so any AI or user can generate
 * a shareable interactive FlowBoard diagram URL without requiring account login.
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

  router.post('/drafts', draftRateLimit, async (req, res, next) => {
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

  router.get('/drafts/:id', async (req, res, next) => {
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
