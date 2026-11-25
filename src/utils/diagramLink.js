import { MAX_PLANTTEXT_CHARS } from '../engine/plantTextParser.js';

const VALID_KINDS = new Set([
  'auto',
  'erd',
  'erd_chen',
  'dfd',
  'class',
  'usecase',
  'sequence',
  'flowchart',
]);

/**
 * Decode UTF-8 base64url string safely in browser/Node environments.
 * @param {string} encoded
 * @returns {string}
 */
export function decodeBase64UrlUtf8(encoded) {
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Encode UTF-8 string into compact URL-safe base64url.
 * @param {string} text
 * @returns {string}
 */
export function encodeBase64UrlUtf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Normalize diagram kind parameter to a valid PlantDiagramKind.
 * @param {string | null} raw
 * @returns {import('../engine/plantTextParser.js').PlantDiagramKind}
 */
function normalizeKind(raw) {
  const val = (raw || 'auto').trim().toLowerCase();
  return /** @type {import('../engine/plantTextParser.js').PlantDiagramKind} */ (
    VALID_KINDS.has(val) ? val : 'auto'
  );
}

/**
 * Parse incoming FlowBoard deep-link parameters from URL query string and hash.
 * Supports:
 * - `?board=<boardId>` (open specific board in user's workspace)
 * - `?draft=<draftId>` (load public draft from /api/public/drafts/:id)
 * - `?code=<percent-encoded PlantUML>&kind=...&title=...`
 * - `?code64=<base64url PlantUML>&kind=...&title=...`
 * - `#code=...` or `#code64=...` (hash params for extra-long diagrams)
 * @param {string} search
 * @param {string} [hash]
 * @returns {
 *   | { type: 'board', boardId: string }
 *   | { type: 'draft', draftId: string }
 *   | { type: 'planttext', code: string, kind: import('../engine/plantTextParser.js').PlantDiagramKind, title: string, renderMode: 'clean' | 'sketch' }
 *   | null
 * }
 */
export function parseIncomingDiagramLink(search, hash = '') {
  const queryParams = new URLSearchParams(search || '');
  const hashClean = (hash || '').replace(/^#/, '');
  const hashParams = hashClean.includes('=') ? new URLSearchParams(hashClean) : new URLSearchParams();

  /** @param {string} key */
  const pick = (key) => queryParams.get(key) ?? hashParams.get(key);

  const draftId = (pick('draft') || '').trim();
  if (draftId && draftId.length <= 64) {
    return { type: 'draft', draftId };
  }

  const rawCode = pick('code') || pick('planttext');
  const rawCode64 = pick('code64');
  if (rawCode || rawCode64) {
    let code = '';
    if (rawCode64) {
      try {
        code = decodeBase64UrlUtf8(rawCode64.trim());
      } catch {
        code = '';
      }
    } else if (rawCode) {
      code = rawCode;
    }

    const trimmed = code.trim();
    if (trimmed && trimmed.length <= MAX_PLANTTEXT_CHARS) {
      const renderMode = pick('renderMode') === 'sketch' ? 'sketch' : 'clean';
      const title = (pick('title') || '').trim().slice(0, 120);
      return {
        type: 'planttext',
        code: trimmed,
        kind: normalizeKind(pick('kind')),
        title,
        renderMode,
      };
    }
  }

  const boardId = (pick('board') || '').trim();
  if (boardId && boardId.length <= 128) {
    return { type: 'board', boardId };
  }

  return null;
}

/**
 * Build a shareable FlowBoard deep-link URL for a PlantUML diagram.
 * @param {string} origin
 * @param {{ code: string, kind?: string, title?: string, renderMode?: 'clean' | 'sketch' }} opts
 */
export function buildDiagramDeepLink(origin, opts) {
  const params = new URLSearchParams();
  if (opts.kind && opts.kind !== 'auto') params.set('kind', opts.kind);
  if (opts.title) params.set('title', opts.title);
  if (opts.renderMode === 'sketch') params.set('renderMode', 'sketch');
  params.set('code64', encodeBase64UrlUtf8(opts.code));
  return `${origin.replace(/\/$/, '')}/?${params.toString()}`;
}
