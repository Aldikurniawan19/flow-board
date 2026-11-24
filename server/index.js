import fs from 'node:fs';
import path from 'node:path';
import { createDatabase } from './db.js';
import { createApp } from './app.js';

/**
 * Load local .env variables if present (without overriding existing shell env vars).
 */
function loadLocalEnv() {
  const envFile = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envFile)) return;
  const raw = fs.readFileSync(envFile, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

loadLocalEnv();

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';
const DB_PATH = process.env.DB_PATH || './data/flowboard.sqlite';

const db = await createDatabase(DB_PATH);
const app = createApp({ db });

app.listen(PORT, HOST, () => {
  console.warn(`FlowBoard API (${db.dialect}) listening on http://${HOST}:${PORT}`);
});
