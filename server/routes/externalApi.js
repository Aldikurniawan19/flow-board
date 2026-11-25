import express from 'express';
import { createRequireApiKey, requireAiAccess } from '../middleware/auth.js';
import { applyExternalApiCors, createRateLimiter } from '../middleware/security.js';
import {
  DIAGRAM_KINDS,
  GenerateDiagramInputSchema,
  generateDiagramForUser,
  getDiagramSyntaxGuide,
  resolveBaseUrl,
} from '../services/diagramService.js';

/**
 * Build OpenAPI 3.1.0 specification dynamically for ChatGPT Custom GPT Actions & external clients.
 * @param {string} baseUrl
 */
export function buildOpenApiSpec(baseUrl) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'FlowBoard AI Diagram API',
      version: '1.0.0',
      description:
        'Generate editable DFD (Gane-Sarson & Yourdon-DeMarco), Relational ERD (Crow Foot), Conceptual ERD (Peter Chen), UML Class, Use Case, Sequence, and Flowchart diagrams directly in FlowBoard.',
    },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Personal FlowBoard API Key (fbk_...) created in Menu -> Integrasi AI & MCP.',
        },
      },
      schemas: {
        GenerateDiagramRequest: {
          type: 'object',
          required: ['code'],
          properties: {
            title: { type: 'string', maxLength: 120, description: 'Board title in FlowBoard.' },
            code: { type: 'string', description: 'PlantUML / PlantText diagram source code.' },
            kind: {
              type: 'string',
              enum: [...DIAGRAM_KINDS],
              default: 'auto',
              description: 'Diagram notation standard (use erd_chen for Peter Chen conceptual ERD).',
            },
            renderMode: {
              type: 'string',
              enum: ['clean', 'sketch'],
              default: 'clean',
            },
            boardId: {
              type: 'string',
              description: 'Optional existing board ID to update when mode is replace or append.',
            },
            mode: {
              type: 'string',
              enum: ['new_board', 'replace', 'append'],
              default: 'new_board',
            },
          },
        },
      },
    },
    paths: {
      '/api/v1/diagrams': {
        post: {
          operationId: 'generateDiagram',
          summary: 'Generate a diagram directly inside the user FlowBoard workspace',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GenerateDiagramRequest' },
              },
            },
          },
          responses: {
            201: {
              description: 'Diagram created or updated successfully with a direct FlowBoard URL.',
            },
            400: { description: 'Invalid PlantUML syntax or request body.' },
            401: { description: 'Missing or invalid Bearer API Key.' },
          },
        },
      },
      '/api/v1/boards': {
        get: {
          operationId: 'listBoards',
          summary: 'List boards belonging to the authenticated FlowBoard account',
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'List of user boards with direct URLs.' },
            401: { description: 'Missing or invalid Bearer API Key.' },
          },
        },
      },
      '/api/public/drafts': {
        post: {
          operationId: 'createPublicDraft',
          summary: 'Create a shareable interactive FlowBoard draft link without requiring an API key',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['code'],
                  properties: {
                    title: { type: 'string', maxLength: 120 },
                    code: { type: 'string' },
                    kind: { type: 'string', enum: [...DIAGRAM_KINDS], default: 'auto' },
                    renderMode: { type: 'string', enum: ['clean', 'sketch'], default: 'clean' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Shareable draft URL returned.' },
            400: { description: 'Invalid PlantUML code.' },
          },
        },
      },
      '/api/v1/syntax-guide': {
        get: {
          operationId: 'getDiagramSyntaxGuide',
          summary: 'Get PlantUML syntax examples and supported diagram types for FlowBoard',
          responses: {
            200: { description: 'Syntax guide and preset examples.' },
          },
        },
      },
    },
  };
}

/**
 * Create Bearer-authenticated external REST API router (/api/v1/*) for AI Actions & integrations.
 * @param {import('../db.js').FlowBoardDb} db
 * @param {{ enableRateLimit?: boolean }} [options]
 */
export function createExternalApiRouter(db, options = {}) {
  const router = express.Router();
  const requireApiKey = createRequireApiKey(db);
  const apiRateLimit = createRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    enabled: options.enableRateLimit !== false,
  });

  router.use(applyExternalApiCors);
  router.use(apiRateLimit);

  router.get('/syntax-guide', (req, res) => {
    return res.status(200).json(getDiagramSyntaxGuide(resolveBaseUrl(req)));
  });

  router.get('/boards', requireApiKey, requireAiAccess, async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: 'API Key diperlukan.' });

      const baseUrl = resolveBaseUrl(req);
      const rows = /** @type {Array<{ id: string, title: string, created_at: string, updated_at: string }>} */ (
        await db.all(
          `SELECT id, title, created_at, updated_at
           FROM boards
           WHERE user_id = ?
           ORDER BY updated_at DESC
           LIMIT 100`,
          [user.id],
        )
      );

      return res.status(200).json({
        boards: rows.map((row) => ({
          id: row.id,
          title: row.title,
          boardUrl: `${baseUrl}/?board=${encodeURIComponent(row.id)}`,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/diagrams', requireApiKey, requireAiAccess, async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: 'API Key diperlukan.' });

      const parsed = GenerateDiagramInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message || 'Permintaan pembuatan diagram tidak valid.',
        });
      }

      const result = await generateDiagramForUser(db, user.id, parsed.data, resolveBaseUrl(req));
      const status = result.action === 'created' ? 201 : 200;
      return res.status(status).json(result);
    } catch (err) {
      const status = /** @type {any} */ (err)?.status;
      if (status === 400 || status === 403 || status === 404) {
        return res.status(status).json({ error: /** @type {Error} */ (err).message });
      }
      return next(err);
    }
  });

  return router;
}
