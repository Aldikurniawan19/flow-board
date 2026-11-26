import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createAuthRouter } from './routes/auth.js';
import { createBoardsRouter } from './routes/boards.js';
import { createApiKeysRouter } from './routes/apiKeys.js';
import { createPublicDraftsRouter } from './routes/publicDrafts.js';
import { buildOpenApiSpec, createExternalApiRouter } from './routes/externalApi.js';
import { createMcpRouter } from './routes/mcp.js';
import { createOAuthRouter, createOAuthWellKnownRouter } from './routes/oauth.js';
import { resolveBaseUrl } from './services/diagramService.js';
import {
  applyExternalApiCors,
  applySecurityHeaders,
  requireCsrfHeader,
} from './middleware/security.js';

/**
 * Create configured Express application.
 * @param {{ db: import('./db.js').FlowBoardDb, enableRateLimit?: boolean, serveStatic?: boolean, googleFetcher?: typeof fetch }} options
 */
export function createApp({ db, enableRateLimit = true, serveStatic = true, googleFetcher }) {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(applySecurityHeaders);
  app.use(cookieParser());
  app.use(express.json({ limit: '6mb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  app.use('/.well-known', createOAuthWellKnownRouter());

  app.get('/api/health', async (_req, res, next) => {
    try {
      await db.init();
      res.status(200).json({ status: 'ok', database: db.dialect });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/openapi.json', applyExternalApiCors, (req, res) => {
    return res.status(200).json(buildOpenApiSpec(resolveBaseUrl(req)));
  });

  app.use('/api', requireCsrfHeader);
  app.use('/api/auth', createAuthRouter(db, { enableRateLimit, googleFetcher }));
  app.use('/api/boards', createBoardsRouter(db));
  app.use('/api/keys', createApiKeysRouter(db));
  app.use('/api/public', createPublicDraftsRouter(db, { enableRateLimit }));
  app.use('/api/v1', createExternalApiRouter(db, { enableRateLimit }));
  app.use('/api/mcp', createMcpRouter(db, { enableRateLimit }));
  app.use('/api/oauth', createOAuthRouter(db, { enableRateLimit }));

  if (serveStatic) {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get(/^(?!\/(?:api|\.well-known)\/).*/, (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.use((err, _req, res, _next) => {
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Ukuran data papan kerja melebihi batas maksimum.' });
    }
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Format JSON tidak valid.' });
    }
    console.error('[server error]', err?.message || 'Unknown error');
    return res.status(500).json({
      error: 'Terjadi kesalahan pada server. Silakan coba lagi.',
    });
  });

  return app;
}
