import crypto from 'node:crypto';
import { z } from 'zod';
import { computeSceneBounds } from '../../src/engine/exporter.js';
import {
  MAX_PLANTTEXT_CHARS,
  PLANTTEXT_EXAMPLES,
  PLANT_KIND_LABELS,
  parsePlantText,
} from '../../src/engine/plantTextParser.js';

const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const DIAGRAM_KINDS = /** @type {const} */ ([
  'auto',
  'erd',
  'erd_chen',
  'dfd',
  'class',
  'usecase',
  'sequence',
  'flowchart',
]);

export const GenerateDiagramInputSchema = z.object({
  title: z.string().trim().max(120, 'Judul diagram maksimal 120 karakter.').optional(),
  code: z
    .string()
    .trim()
    .min(1, 'Kode PlantUML / PlantText wajib diisi.')
    .max(MAX_PLANTTEXT_CHARS, `Kode melebihi batas maksimum ${MAX_PLANTTEXT_CHARS} karakter.`),
  kind: z.enum(DIAGRAM_KINDS).optional().default('auto'),
  renderMode: z.enum(['clean', 'sketch']).optional().default('clean'),
  boardId: z.string().trim().max(128).optional(),
  mode: z.enum(['new_board', 'replace', 'append']).optional().default('new_board'),
});

export const CreatePublicDraftSchema = z.object({
  title: z.string().trim().max(120, 'Judul diagram maksimal 120 karakter.').optional(),
  code: z
    .string()
    .trim()
    .min(1, 'Kode PlantUML / PlantText wajib diisi.')
    .max(MAX_PLANTTEXT_CHARS, `Kode melebihi batas maksimum ${MAX_PLANTTEXT_CHARS} karakter.`),
  kind: z.enum(DIAGRAM_KINDS).optional().default('auto'),
  renderMode: z.enum(['clean', 'sketch']).optional().default('clean'),
});

/**
 * Derive external base URL safely from incoming HTTP request.
 * @param {import('express').Request} req
 * @returns {string}
 */
export function resolveBaseUrl(req) {
  const host = req.get('x-forwarded-host') || req.get('host');
  if (!host) return 'https://flow-board-dun.vercel.app';
  const protoHeader = req.get('x-forwarded-proto');
  const proto = protoHeader ? protoHeader.split(',')[0].trim() : req.protocol || 'https';
  const safeProto = proto === 'http' || proto === 'https' ? proto : 'https';
  return `${safeProto}://${host}`;
}

/**
 * Build default board settings JSON for generated diagrams.
 * @param {'clean' | 'sketch'} renderMode
 */
function buildDefaultSettings(renderMode) {
  return {
    renderMode,
    gridMode: /** @type {const} */ ('dots'),
    snapToGrid: true,
    autoCorrectShapes: true,
    syncSameType: true,
  };
}

/**
 * Create a public shareable diagram draft (no user account required).
 * @param {import('../db.js').FlowBoardDb} db
 * @param {z.infer<typeof CreatePublicDraftSchema>} input
 * @param {string} baseUrl
 */
export async function createPublicDraft(db, input, baseUrl) {
  const parsed = parsePlantText(input.code, {
    kind: input.kind,
    renderMode: input.renderMode,
  });
  if (parsed.ok === false) {
    const err = new Error(parsed.error);
    /** @type {any} */ (err).status = 400;
    throw err;
  }

  const draftId = crypto.randomBytes(9).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DRAFT_TTL_MS).toISOString();
  const title = (input.title || '').trim() || parsed.kindLabel;

  await db.run(
    `INSERT INTO public_drafts (id, title, kind, source_code, elements_json, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      draftId,
      title,
      parsed.kind,
      input.code,
      JSON.stringify(parsed.elements),
      now.toISOString(),
      expiresAt,
    ],
  );

  return {
    draftId,
    url: `${baseUrl}/?draft=${encodeURIComponent(draftId)}`,
    title,
    kind: parsed.kind,
    kindLabel: parsed.kindLabel,
    summary: parsed.summary,
    expiresAt,
  };
}

/**
 * Fetch a non-expired public diagram draft by ID.
 * @param {import('../db.js').FlowBoardDb} db
 * @param {string} draftId
 */
export async function getPublicDraft(db, draftId) {
  const row = /** @type {{ id: string, title: string, kind: string, source_code: string, elements_json: string, created_at: string, expires_at: string } | undefined} */ (
    await db.get(
      `SELECT id, title, kind, source_code, elements_json, created_at, expires_at
       FROM public_drafts
       WHERE id = ?`,
      [draftId],
    )
  );
  if (!row) return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await db.run('DELETE FROM public_drafts WHERE id = ?', [draftId]).catch(() => {});
    return null;
  }

  let elements = [];
  try {
    elements = JSON.parse(row.elements_json);
  } catch {
    elements = [];
  }

  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    sourceCode: row.source_code,
    elements,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Generate a FlowBoard diagram directly inside an authenticated user's workspace
 * (creating a new board or updating an owned board).
 * @param {import('../db.js').FlowBoardDb} db
 * @param {string} userId
 * @param {z.infer<typeof GenerateDiagramInputSchema>} input
 * @param {string} baseUrl
 */
export async function generateDiagramForUser(db, userId, input, baseUrl) {
  const parsed = parsePlantText(input.code, {
    kind: input.kind,
    renderMode: input.renderMode,
  });
  if (parsed.ok === false) {
    const err = new Error(parsed.error);
    /** @type {any} */ (err).status = 400;
    throw err;
  }

  const now = new Date().toISOString();
  const title = (input.title || '').trim() || parsed.kindLabel;

  if (input.boardId && input.mode !== 'new_board') {
    const existing = /** @type {{ id: string, user_id: string, title: string, settings_json: string, elements_json: string } | undefined} */ (
      await db.get(
        'SELECT id, user_id, title, settings_json, elements_json FROM boards WHERE id = ?',
        [input.boardId],
      )
    );
    if (!existing) {
      const err = new Error('Papan kerja target tidak ditemukan.');
      /** @type {any} */ (err).status = 404;
      throw err;
    }
    if (existing.user_id !== userId) {
      const err = new Error('Anda tidak memiliki izin mengubah papan kerja ini.');
      /** @type {any} */ (err).status = 403;
      throw err;
    }

    let nextElements = parsed.elements;
    if (input.mode === 'append') {
      /** @type {import('../../src/types/schema.js').BoardElement[]} */
      let prevElements = [];
      try {
        prevElements = JSON.parse(existing.elements_json);
      } catch {
        prevElements = [];
      }
      if (prevElements.length > 0) {
        const bounds = computeSceneBounds(prevElements);
        const offsetX = Math.round(bounds.x + bounds.width + 80);
        const shifted = parsed.elements.map((el) => ({
          ...el,
          x: el.x + offsetX,
          waypoints: el.waypoints?.map((pt) => ({ x: pt.x + offsetX, y: pt.y })),
        }));
        nextElements = [...prevElements, ...shifted];
      }
    }

    const nextTitle = (input.title || '').trim() || existing.title;
    await db.run(
      `UPDATE boards
       SET title = ?, elements_json = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [nextTitle, JSON.stringify(nextElements), now, existing.id, userId],
    );

    return {
      boardId: existing.id,
      boardUrl: `${baseUrl}/?board=${encodeURIComponent(existing.id)}`,
      title: nextTitle,
      kind: parsed.kind,
      kindLabel: parsed.kindLabel,
      summary: parsed.summary,
      action: input.mode === 'append' ? 'appended' : 'replaced',
    };
  }

  const boardId = crypto.randomUUID();
  const settings = buildDefaultSettings(input.renderMode);
  await db.run(
    `INSERT INTO boards (id, user_id, title, settings_json, elements_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [boardId, userId, title, JSON.stringify(settings), JSON.stringify(parsed.elements), now, now],
  );

  return {
    boardId,
    boardUrl: `${baseUrl}/?board=${encodeURIComponent(boardId)}`,
    title,
    kind: parsed.kind,
    kindLabel: parsed.kindLabel,
    summary: parsed.summary,
    action: 'created',
  };
}

/**
 * Return structured diagram syntax guide & examples for AI agents.
 * @param {string} baseUrl
 */
export function getDiagramSyntaxGuide(baseUrl) {
  return {
    baseUrl,
    deepLinkTemplate: `${baseUrl}/?kind=<auto|dfd|erd|erd_chen|class|usecase|sequence|flowchart>&title=<URL-encoded title>&code=<URL-encoded PlantUML>`,
    supportedKinds: PLANT_KIND_LABELS,
    tips: [
      'Wrap PlantUML code inside @startuml ... @enduml.',
      'For DFD (Gane-Sarson or Yourdon-DeMarco), declare external entities with `rectangle "Name" as E1 <<External>>`, numbered processes with `usecase "1.0\\nProcess" as P1 <<Process>>`, and data stores with `database "D1 Store" as D1`. Include "Yourdon" in title for Yourdon-DeMarco circular processes.',
      'For Relational ERD (Crow Foot), use `entity "TABLE" as t { * id : INT <<PK>> -- * col : VARCHAR(100) }` and `a ||--o{ b : "rel"`.',
      'For Conceptual ERD (Peter Chen: rectangle entities, diamond relations, oval attributes with underlined PK), set `kind: "erd_chen"` or include `Peter Chen` in the title. Supports both `A "1" -- "N" B : "REL"` and Crow Foot `||--o{`.',
      'Avoid unsupported PlantUML layout hacks; FlowBoard computes clean zero-overlap auto-layout automatically.',
    ],
    examples: PLANTTEXT_EXAMPLES.map((ex) => ({
      id: ex.id,
      label: ex.label,
      kind: ex.kind,
      code: ex.code,
    })),
  };
}
