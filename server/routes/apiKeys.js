import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { createRequireAuth, generateApiKey, requireAiAccess } from '../middleware/auth.js';

const MAX_KEYS_PER_USER = 10;

const CreateKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nama API Key wajib diisi.')
    .max(60, 'Nama API Key maksimal 60 karakter.'),
});

/**
 * Create personal API key management router (/api/keys/*).
 * Protected by browser session cookie + CSRF header.
 * @param {import('../db.js').FlowBoardDb} db
 */
export function createApiKeysRouter(db) {
  const router = express.Router();
  const requireAuth = createRequireAuth(db);

  router.use(requireAuth);
  router.use(requireAiAccess);

  router.get('/', async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: 'Autentikasi diperlukan.' });

      const rows = /** @type {Array<{ id: string, name: string, key_prefix: string, created_at: string, last_used_at: string | null }>} */ (
        await db.all(
          `SELECT id, name, key_prefix, created_at, last_used_at
           FROM api_keys
           WHERE user_id = ?
           ORDER BY created_at DESC`,
          [user.id],
        )
      );

      return res.status(200).json({
        keys: rows.map((row) => ({
          id: row.id,
          name: row.name,
          keyPrefix: row.key_prefix,
          createdAt: row.created_at,
          lastUsedAt: row.last_used_at,
        })),
      });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: 'Autentikasi diperlukan.' });

      const parsed = CreateKeySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Nama API Key tidak valid.',
        });
      }

      const existingKeys = await db.all('SELECT id FROM api_keys WHERE user_id = ?', [user.id]);
      if (existingKeys.length >= MAX_KEYS_PER_USER) {
        return res.status(400).json({
          error: `Maksimal ${MAX_KEYS_PER_USER} API Key per akun. Hapus kunci lama terlebih dahulu.`,
        });
      }

      const id = crypto.randomUUID();
      const { rawKey, keyPrefix, keyHash } = generateApiKey();
      const now = new Date().toISOString();

      await db.run(
        `INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash, created_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        [id, user.id, parsed.data.name, keyPrefix, keyHash, now],
      );

      return res.status(201).json({
        apiKey: {
          id,
          name: parsed.data.name,
          keyPrefix,
          createdAt: now,
          lastUsedAt: null,
        },
        secret: rawKey,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: 'Autentikasi diperlukan.' });

      const existing = /** @type {{ id: string, user_id: string } | undefined} */ (
        await db.get('SELECT id, user_id FROM api_keys WHERE id = ?', [req.params.id])
      );
      if (!existing) {
        return res.status(404).json({ error: 'API Key tidak ditemukan.' });
      }
      if (existing.user_id !== user.id) {
        return res.status(403).json({ error: 'Anda tidak memiliki izin mencabut API Key ini.' });
      }

      await db.run('DELETE FROM api_keys WHERE id = ? AND user_id = ?', [existing.id, user.id]);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
