import crypto from 'node:crypto';
import express from 'express';
import {
  BoardSettingsSchema,
  CreateBoardSchema,
  UpdateBoardSchema,
} from '../../src/types/schema.js';
import { createRequireAuth } from '../middleware/auth.js';

/** @type {import('../../src/types/schema.js').BoardSettings} */
const DEFAULT_SETTINGS = {
  renderMode: 'clean',
  gridMode: 'dots',
  snapToGrid: true,
  autoCorrectShapes: true,
};

/**
 * Safely parse JSON column with fallback.
 * @template T
 * @param {string} raw
 * @param {T} fallback
 * @returns {T}
 */
function safeParseJson(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Map SQLite board row to API DTO.
 * @param {{ id: string, title: string, settings_json: string, elements_json: string, created_at: string, updated_at: string }} row
 */
function serializeBoard(row) {
  return {
    id: row.id,
    title: row.title,
    settings: BoardSettingsSchema.catch(DEFAULT_SETTINGS).parse(
      safeParseJson(row.settings_json, DEFAULT_SETTINGS),
    ),
    elements: safeParseJson(row.elements_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create boards router (/api/boards/*) with strict ownership checks.
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function createBoardsRouter(db) {
  const router = express.Router();
  const requireAuth = createRequireAuth(db);

  router.use(requireAuth);

  router.get('/', (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Autentikasi diperlukan.' });

    const rows = /** @type {Array<{ id: string, title: string, created_at: string, updated_at: string }>} */ (
      db
        .prepare(
          `SELECT id, title, created_at, updated_at
           FROM boards
           WHERE user_id = ?
           ORDER BY updated_at DESC
           LIMIT 100`,
        )
        .all(user.id)
    );

    return res.status(200).json({
      boards: rows.map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  });

  router.post('/', (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Autentikasi diperlukan.' });

    const parsed = CreateBoardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Data papan kerja tidak valid.',
      });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = parsed.data.title;
    const settings = parsed.data.settings || DEFAULT_SETTINGS;
    const elements = parsed.data.elements || [];

    db.prepare(
      `INSERT INTO boards (id, user_id, title, settings_json, elements_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, user.id, title, JSON.stringify(settings), JSON.stringify(elements), now, now);

    return res.status(201).json({
      board: {
        id,
        title,
        settings,
        elements,
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  router.get('/:id', (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Autentikasi diperlukan.' });

    const row = /** @type {{ id: string, user_id: string, title: string, settings_json: string, elements_json: string, created_at: string, updated_at: string } | undefined} */ (
      db
        .prepare(
          'SELECT id, user_id, title, settings_json, elements_json, created_at, updated_at FROM boards WHERE id = ?',
        )
        .get(req.params.id)
    );

    if (!row) {
      return res.status(404).json({ error: 'Papan kerja tidak ditemukan.' });
    }
    if (row.user_id !== user.id) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses ke papan kerja ini.' });
    }

    return res.status(200).json({ board: serializeBoard(row) });
  });

  router.put('/:id', (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Autentikasi diperlukan.' });

    const parsed = UpdateBoardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Perubahan papan kerja tidak valid.',
      });
    }

    const existing = /** @type {{ id: string, user_id: string, title: string, settings_json: string, elements_json: string, created_at: string } | undefined} */ (
      db
        .prepare(
          'SELECT id, user_id, title, settings_json, elements_json, created_at FROM boards WHERE id = ?',
        )
        .get(req.params.id)
    );

    if (!existing) {
      return res.status(404).json({ error: 'Papan kerja tidak ditemukan.' });
    }
    if (existing.user_id !== user.id) {
      return res.status(403).json({ error: 'Anda tidak memiliki izin mengubah papan kerja ini.' });
    }

    const nextTitle = parsed.data.title ?? existing.title;
    const nextSettingsJson = parsed.data.settings
      ? JSON.stringify(parsed.data.settings)
      : existing.settings_json;
    const nextElementsJson = parsed.data.elements
      ? JSON.stringify(parsed.data.elements)
      : existing.elements_json;
    const updatedAt = new Date().toISOString();

    db.prepare(
      `UPDATE boards
       SET title = ?, settings_json = ?, elements_json = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).run(nextTitle, nextSettingsJson, nextElementsJson, updatedAt, existing.id, user.id);

    return res.status(200).json({
      board: serializeBoard({
        id: existing.id,
        title: nextTitle,
        settings_json: nextSettingsJson,
        elements_json: nextElementsJson,
        created_at: existing.created_at,
        updated_at: updatedAt,
      }),
    });
  });

  router.delete('/:id', (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Autentikasi diperlukan.' });

    const existing = /** @type {{ id: string, user_id: string } | undefined} */ (
      db.prepare('SELECT id, user_id FROM boards WHERE id = ?').get(req.params.id)
    );

    if (!existing) {
      return res.status(404).json({ error: 'Papan kerja tidak ditemukan.' });
    }
    if (existing.user_id !== user.id) {
      return res.status(403).json({ error: 'Anda tidak memiliki izin menghapus papan kerja ini.' });
    }

    db.prepare('DELETE FROM boards WHERE id = ? AND user_id = ?').run(existing.id, user.id);
    return res.status(200).json({ ok: true });
  });

  return router;
}
