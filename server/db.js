import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    google_sub TEXT,
    plan TEXT NOT NULL DEFAULT 'free',
    plan_expires_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    settings_json TEXT NOT NULL,
    elements_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_boards_user_updated ON boards(user_id, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)`,
  `CREATE TABLE IF NOT EXISTS public_drafts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    source_code TEXT NOT NULL,
    elements_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id TEXT PRIMARY KEY,
    client_secret_hash TEXT,
    client_name TEXT NOT NULL,
    redirect_uris_json TEXT NOT NULL,
    token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
    grant_types_json TEXT NOT NULL,
    response_types_json TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'mcp:tools',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS oauth_auth_codes (
    code_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    scope TEXT NOT NULL,
    resource TEXT,
    code_challenge TEXT NOT NULL,
    code_challenge_method TEXT NOT NULL DEFAULT 'S256',
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_expires ON oauth_auth_codes(expires_at)`,
  `CREATE TABLE IF NOT EXISTS oauth_tokens (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    access_token_hash TEXT NOT NULL UNIQUE,
    refresh_token_hash TEXT UNIQUE,
    scope TEXT NOT NULL,
    resource TEXT,
    expires_at TEXT NOT NULL,
    refresh_expires_at TEXT,
    revoked_at TEXT,
    last_used_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_id ON oauth_tokens(user_id)`,
];

/**
 * @typedef {object} FlowBoardDb
 * @property {'postgres' | 'sqlite'} dialect
 * @property {(sql: string, params?: unknown[]) => Promise<Record<string, any> | undefined>} get
 * @property {(sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>} all
 * @property {(sql: string, params?: unknown[]) => Promise<void>} run
 * @property {() => Promise<void>} init
 * @property {() => Promise<void>} close
 */

/**
 * Convert `?` placeholders to PostgreSQL `$1, $2, ...` positional parameters.
 * @param {string} sql
 * @returns {string}
 */
function toPgParams(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

/**
 * Determine whether a PostgreSQL connection string requires SSL (true for Supabase/cloud hosts).
 * @param {string} connectionString
 */
function shouldUseSsl(connectionString) {
  if (process.env.DATABASE_SSL === 'false') return false;
  if (/localhost|127\.0\.0\.1/i.test(connectionString)) return false;
  return true;
}

/**
 * Create a Supabase / PostgreSQL database adapter backed by pg.Pool.
 * Optimized for Supabase Transaction Pooler (port 6543) & Vercel Serverless Functions.
 * @param {string} connectionString
 * @returns {FlowBoardDb}
 */
export function createPostgresDatabase(connectionString) {
  const pool = new Pool({
    connectionString,
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false,
    max: Number(process.env.PG_POOL_MAX || 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  /** @type {Promise<void> | null} */
  let initPromise = null;

  async function init() {
    if (!initPromise) {
      initPromise = (async () => {
        for (const stmt of SCHEMA_STATEMENTS) {
          await pool.query(stmt);
        }
        await pool.query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'`,
        );
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TEXT`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT`);
        await pool.query(
          `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub)`,
        );
      })().catch((err) => {
        initPromise = null;
        throw err;
      });
    }
    return initPromise;
  }

  return {
    dialect: 'postgres',
    init,
    async get(sql, params = []) {
      await init();
      const res = await pool.query(toPgParams(sql), params);
      return res.rows[0];
    },
    async all(sql, params = []) {
      await init();
      const res = await pool.query(toPgParams(sql), params);
      return res.rows;
    },
    async run(sql, params = []) {
      await init();
      await pool.query(toPgParams(sql), params);
    },
    async close() {
      await pool.end();
    },
  };
}

/**
 * Create a local SQLite database adapter using Node 22 built-in `node:sqlite` (dynamically imported
 * so cloud runtimes using Supabase PostgreSQL never load `node:sqlite`).
 * @param {string} [dbPath]
 * @returns {Promise<FlowBoardDb>}
 */
export async function createSqliteDatabase(dbPath = './data/flowboard.sqlite') {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(path.resolve(dbPath));
    fs.mkdirSync(dir, { recursive: true });
  }

  const { DatabaseSync } = await import('node:sqlite');
  const raw = new DatabaseSync(dbPath);
  raw.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') {
    raw.exec('PRAGMA journal_mode = WAL;');
  }
  for (const stmt of SCHEMA_STATEMENTS) {
    raw.exec(`${stmt};`);
  }
  const userCols = /** @type {Array<{ name: string }>} */ (raw.prepare('PRAGMA table_info(users)').all());
  const colNames = new Set(userCols.map((c) => c.name));
  if (!colNames.has('plan')) {
    raw.exec(`ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';`);
  }
  if (!colNames.has('plan_expires_at')) {
    raw.exec(`ALTER TABLE users ADD COLUMN plan_expires_at TEXT;`);
  }
  if (!colNames.has('google_sub')) {
    raw.exec(`ALTER TABLE users ADD COLUMN google_sub TEXT;`);
  }
  raw.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);`);

  return {
    dialect: 'sqlite',
    async init() {},
    async get(sql, params = []) {
      return /** @type {Record<string, any> | undefined} */ (raw.prepare(sql).get(...params));
    },
    async all(sql, params = []) {
      return /** @type {Array<Record<string, any>>} */ (raw.prepare(sql).all(...params));
    },
    async run(sql, params = []) {
      raw.prepare(sql).run(...params);
    },
    async close() {
      raw.close();
    },
  };
}

/**
 * Initialize FlowBoard database:
 * - Uses Supabase / PostgreSQL automatically when `connectionString` (or `process.env.DATABASE_URL`) is provided
 *   (unless `dbPath === ':memory:'` for isolated unit tests).
 * - Falls back to local SQLite otherwise.
 * @param {string} [dbPath]
 * @returns {Promise<FlowBoardDb>}
 */
export async function createDatabase(dbPath) {
  if (dbPath === ':memory:') {
    return createSqliteDatabase(':memory:');
  }
  const pgUrl = process.env.DATABASE_URL?.trim();
  if (pgUrl) {
    const db = createPostgresDatabase(pgUrl);
    await db.init();
    return db;
  }
  return createSqliteDatabase(dbPath || process.env.DB_PATH || './data/flowboard.sqlite');
}
