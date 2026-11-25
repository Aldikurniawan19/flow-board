import express from 'express';
import { z } from 'zod';
import { authenticateApiKey, extractBearerToken } from '../middleware/auth.js';
import { applyExternalApiCors, createRateLimiter } from '../middleware/security.js';
import {
  DIAGRAM_KINDS,
  GenerateDiagramInputSchema,
  generateDiagramForUser,
  getDiagramSyntaxGuide,
  resolveBaseUrl,
} from '../services/diagramService.js';

const MCP_PROTOCOL_VERSION = '2025-03-26';

const MCP_TOOLS = [
  {
    name: 'generate_diagram',
    description:
      'Generate an editable FlowBoard diagram from PlantUML / PlantText code (DFD Gane-Sarson & Yourdon-DeMarco, Relational ERD Crow Foot, Conceptual ERD Peter Chen, UML Class, Use Case, Sequence, or Flowchart). When authenticated with a Bearer API key, saves directly into the user FlowBoard account and returns the board URL; without an API key, creates a shareable public draft URL.',
    inputSchema: {
      type: 'object',
      required: ['code'],
      properties: {
        title: {
          type: 'string',
          description: 'Title for the generated diagram board (max 120 chars).',
        },
        code: {
          type: 'string',
          description:
            'PlantUML / PlantText source code wrapped in @startuml ... @enduml. Call get_diagram_syntax_guide first if unsure about notation.',
        },
        kind: {
          type: 'string',
          enum: [...DIAGRAM_KINDS],
          default: 'auto',
          description:
            'Diagram standard: auto, erd (Relational Crow Foot), erd_chen (Conceptual Peter Chen), dfd, class, usecase, sequence, or flowchart.',
        },
        renderMode: {
          type: 'string',
          enum: ['clean', 'sketch'],
          default: 'clean',
          description: 'Visual style: clean (technical) or sketch (hand-drawn).',
        },
        boardId: {
          type: 'string',
          description:
            'Optional board ID to update (requires Bearer API key and mode set to replace or append).',
        },
        mode: {
          type: 'string',
          enum: ['new_board', 'replace', 'append'],
          default: 'new_board',
          description: 'Whether to create a new board or replace/append to boardId.',
        },
      },
    },
  },
  {
    name: 'list_boards',
    description:
      'List all boards in the authenticated user FlowBoard workspace (requires Authorization: Bearer fbk_... API key).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_board',
    description:
      'Get metadata and element breakdown of a specific board owned by the authenticated user (requires Bearer API key).',
    inputSchema: {
      type: 'object',
      required: ['boardId'],
      properties: {
        boardId: { type: 'string', description: 'Target board UUID.' },
      },
    },
  },
  {
    name: 'delete_board',
    description:
      'Delete a specific board owned by the authenticated user (requires Bearer API key).',
    inputSchema: {
      type: 'object',
      required: ['boardId'],
      properties: {
        boardId: { type: 'string', description: 'Board UUID to delete.' },
      },
    },
  },
  {
    name: 'get_diagram_syntax_guide',
    description:
      'Get PlantUML syntax examples, deep-link URL format, and layout tips for all 7 diagram notations supported by FlowBoard.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

const BoardIdArgSchema = z.object({
  boardId: z.string().trim().min(1, 'boardId wajib diisi.').max(128),
});

/**
 * Format a JSON-RPC 2.0 success payload.
 * @param {string | number | null} id
 * @param {any} result
 */
function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

/**
 * Format a JSON-RPC 2.0 error payload.
 * @param {string | number | null} id
 * @param {number} code
 * @param {string} message
 */
function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/**
 * Format a tool execution response in MCP content format.
 * @param {any} payload
 * @param {boolean} [isError]
 */
function toolContent(payload, isError = false) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return {
    content: [{ type: 'text', text }],
    ...(typeof payload === 'object' && payload !== null ? { structuredContent: payload } : {}),
    ...(isError ? { isError: true } : {}),
  };
}

/**
 * Create Streamable HTTP MCP Server router mounted at /api/mcp.
 * Supports optional Bearer API key auth:
 * - Valid Bearer key: full workspace access (generate_diagram saves directly into user boards, list/get/delete boards).
 * - No Authorization header: public mode (generate_diagram creates shareable public draft URLs, syntax guide accessible).
 * - Invalid Bearer key: rejected with 401.
 * @param {import('../db.js').FlowBoardDb} db
 * @param {{ enableRateLimit?: boolean }} [options]
 */
export function createMcpRouter(db, options = {}) {
  const router = express.Router();
  const mcpRateLimit = createRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    enabled: options.enableRateLimit !== false,
  });

  router.use(applyExternalApiCors);
  router.use(mcpRateLimit);

  router.get('/', (req, res) => {
    const baseUrl = resolveBaseUrl(req);
    return res.status(200).json({
      name: 'flowboard-mcp',
      version: '1.0.0',
      protocol: 'MCP Streamable HTTP (JSON-RPC 2.0 via POST)',
      endpoint: `${baseUrl}/api/mcp`,
      openApiUrl: `${baseUrl}/api/openapi.json`,
      llmsTxtUrl: `${baseUrl}/llms.txt`,
      tools: MCP_TOOLS.map((t) => t.name),
    });
  });

  router.post('/', async (req, res, next) => {
    try {
      const body = /** @type {Record<string, any> | null} */ (
        req.body && typeof req.body === 'object' ? req.body : null
      );

      const token = extractBearerToken(req);
      /** @type {{ id: string, name: string, email: string, plan: 'free' | 'pro', isOwner: boolean, hasAiAccess: boolean } | null} */
      let authUser = null;
      if (token !== null) {
        const auth = await authenticateApiKey(db, token);
        if (!auth) {
          return res.status(401).json(
            rpcError(body?.id ?? null, -32001, 'API Key tidak valid atau telah dicabut.'),
          );
        }
        if (!auth.user.hasAiAccess) {
          return res.status(403).json(
            rpcError(
              body?.id ?? null,
              -32003,
              'Fitur Integrasi AI & MCP khusus untuk pelanggan FlowBoard Pro.',
            ),
          );
        }
        authUser = auth.user;
      }

      if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
        return res
          .status(400)
          .json(rpcError(body?.id ?? null, -32600, 'Permintaan JSON-RPC 2.0 tidak valid.'));
      }

      const id = body.id !== undefined ? body.id : null;
      const method = body.method;
      const params = body.params && typeof body.params === 'object' ? body.params : {};
      const baseUrl = resolveBaseUrl(req);

      // JSON-RPC notifications (no id) return 202 Accepted
      if (method.startsWith('notifications/')) {
        return res.status(202).end();
      }

      if (method === 'initialize') {
        const clientVersion =
          typeof params.protocolVersion === 'string' ? params.protocolVersion : MCP_PROTOCOL_VERSION;
        return res.status(200).json(
          rpcResult(id, {
            protocolVersion: clientVersion,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'flowboard-mcp', version: '1.0.0' },
            instructions:
              'Use FlowBoard MCP tools to generate editable DFD, ERD (Crow Foot & Peter Chen), UML, and Flowchart diagrams from PlantUML syntax. Always share the returned boardUrl or draft url with the user.',
          }),
        );
      }

      if (method === 'ping') {
        return res.status(200).json(rpcResult(id, {}));
      }

      if (method === 'tools/list') {
        return res.status(200).json(rpcResult(id, { tools: MCP_TOOLS }));
      }

      if (method === 'tools/call') {
        const toolName = typeof params.name === 'string' ? params.name : '';
        const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};

        if (toolName === 'get_diagram_syntax_guide') {
          return res.status(200).json(rpcResult(id, toolContent(getDiagramSyntaxGuide(baseUrl))));
        }

        if (toolName === 'generate_diagram') {
          if (!authUser || !authUser.hasAiAccess) {
            return res.status(200).json(
              rpcResult(
                id,
                toolContent(
                  {
                    code: 'PRO_REQUIRED',
                    error:
                      'Fitur generate_diagram memerlukan API Key dari akun FlowBoard Pro (Authorization: Bearer fbk_...).',
                  },
                  true,
                ),
              ),
            );
          }

          const parsed = GenerateDiagramInputSchema.safeParse(args);
          if (!parsed.success) {
            return res.status(200).json(
              rpcResult(
                id,
                toolContent(
                  { error: parsed.error.issues[0]?.message || 'Argumen generate_diagram tidak valid.' },
                  true,
                ),
              ),
            );
          }
          try {
            const out = await generateDiagramForUser(db, authUser.id, parsed.data, baseUrl);
            return res.status(200).json(
              rpcResult(
                id,
                toolContent({
                  ...out,
                  storage: 'user_workspace',
                  message: `Diagram "${out.title}" (${out.kindLabel}) berhasil dibuat di akun FlowBoard Anda. Buka: ${out.boardUrl}`,
                }),
              ),
            );
          } catch (err) {
            return res.status(200).json(
              rpcResult(
                id,
                toolContent({ error: /** @type {Error} */ (err).message }, true),
              ),
            );
          }
        }

        if (toolName === 'list_boards') {
          if (!authUser) {
            return res.status(200).json(
              rpcResult(
                id,
                toolContent(
                  { error: 'Tool list_boards memerlukan header Authorization: Bearer fbk_... (API Key FlowBoard).' },
                  true,
                ),
              ),
            );
          }
          const rows = /** @type {Array<{ id: string, title: string, created_at: string, updated_at: string }>} */ (
            await db.all(
              `SELECT id, title, created_at, updated_at
               FROM boards
               WHERE user_id = ?
               ORDER BY updated_at DESC
               LIMIT 100`,
              [authUser.id],
            )
          );
          return res.status(200).json(
            rpcResult(
              id,
              toolContent({
                boards: rows.map((row) => ({
                  id: row.id,
                  title: row.title,
                  boardUrl: `${baseUrl}/?board=${encodeURIComponent(row.id)}`,
                  createdAt: row.created_at,
                  updatedAt: row.updated_at,
                })),
              }),
            ),
          );
        }

        if (toolName === 'get_board') {
          if (!authUser) {
            return res.status(200).json(
              rpcResult(
                id,
                toolContent(
                  { error: 'Tool get_board memerlukan header Authorization: Bearer fbk_... (API Key FlowBoard).' },
                  true,
                ),
              ),
            );
          }
          const parsedArg = BoardIdArgSchema.safeParse(args);
          if (!parsedArg.success) {
            return res.status(200).json(
              rpcResult(
                id,
                toolContent({ error: parsedArg.error.issues[0]?.message || 'boardId tidak valid.' }, true),
              ),
            );
          }
          const row = /** @type {{ id: string, user_id: string, title: string, elements_json: string, updated_at: string } | undefined} */ (
            await db.get(
              'SELECT id, user_id, title, elements_json, updated_at FROM boards WHERE id = ?',
              [parsedArg.data.boardId],
            )
          );
          if (!row) {
            return res
              .status(200)
              .json(rpcResult(id, toolContent({ error: 'Papan kerja tidak ditemukan.' }, true)));
          }
          if (row.user_id !== authUser.id) {
            return res.status(200).json(
              rpcResult(
                id,
                toolContent({ error: 'Anda tidak memiliki akses ke papan kerja ini.' }, true),
              ),
            );
          }
          /** @type {Array<{ type?: string, text?: string }>} */
          let elements = [];
          try {
            elements = JSON.parse(row.elements_json);
          } catch {
            elements = [];
          }
          const nodes = elements.filter((e) => e.type !== 'connector');
          const connectors = elements.filter((e) => e.type === 'connector');
          return res.status(200).json(
            rpcResult(
              id,
              toolContent({
                id: row.id,
                title: row.title,
                boardUrl: `${baseUrl}/?board=${encodeURIComponent(row.id)}`,
                updatedAt: row.updated_at,
                summary: { totalElements: elements.length, nodes: nodes.length, connectors: connectors.length },
                nodeLabels: nodes.slice(0, 60).map((n) => ({ type: n.type, text: n.text || '' })),
              }),
            ),
          );
        }

        if (toolName === 'delete_board') {
          if (!authUser) {
            return res.status(200).json(
              rpcResult(
                id,
                toolContent(
                  { error: 'Tool delete_board memerlukan header Authorization: Bearer fbk_... (API Key FlowBoard).' },
                  true,
                ),
              ),
            );
          }
          const parsedArg = BoardIdArgSchema.safeParse(args);
          if (!parsedArg.success) {
            return res.status(200).json(
              rpcResult(
                id,
                toolContent({ error: parsedArg.error.issues[0]?.message || 'boardId tidak valid.' }, true),
              ),
            );
          }
          const row = /** @type {{ id: string, user_id: string } | undefined} */ (
            await db.get('SELECT id, user_id FROM boards WHERE id = ?', [parsedArg.data.boardId])
          );
          if (!row) {
            return res
              .status(200)
              .json(rpcResult(id, toolContent({ error: 'Papan kerja tidak ditemukan.' }, true)));
          }
          if (row.user_id !== authUser.id) {
            return res.status(200).json(
              rpcResult(
                id,
                toolContent({ error: 'Anda tidak memiliki izin menghapus papan kerja ini.' }, true),
              ),
            );
          }
          await db.run('DELETE FROM boards WHERE id = ? AND user_id = ?', [row.id, authUser.id]);
          return res.status(200).json(rpcResult(id, toolContent({ ok: true, deletedBoardId: row.id })));
        }

        return res
          .status(200)
          .json(rpcError(id, -32601, `Tool MCP tidak dikenal: ${toolName}`));
      }

      return res.status(200).json(rpcError(id, -32601, `Metode MCP tidak didukung: ${method}`));
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
