import { createPostgresDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';

/** @type {import('express').Express | null} */
let cachedApp = null;

/**
 * Lazily build and reuse the Express app across warm Vercel Serverless invocations.
 * @returns {import('express').Express}
 */
function getServerlessApp() {
  if (cachedApp) return cachedApp;
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      'Environment variable DATABASE_URL belum dikonfigurasi di Vercel Project Settings.',
    );
  }
  const db = createPostgresDatabase(connectionString);
  cachedApp = createApp({ db, enableRateLimit: true, serveStatic: false });
  return cachedApp;
}

/**
 * Vercel Serverless Function entrypoint for all `/api/*` routes.
 * @param {any} req
 * @param {any} res
 */
export default function handler(req, res) {
  try {
    const app = getServerlessApp();
    return app(req, res);
  } catch (err) {
    console.error('[vercel api init error]', err instanceof Error ? err.message : 'Unknown error');
    res.status(500).json({
      error: 'Konfigurasi database server belum lengkap. Periksa DATABASE_URL di Vercel.',
    });
    return undefined;
  }
}
