import { createDatabase } from './db.js';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT || 3001);
const DB_PATH = process.env.DB_PATH || './data/flowboard.sqlite';

const db = createDatabase(DB_PATH);
const app = createApp({ db });

app.listen(PORT, '127.0.0.1', () => {
  console.warn(`FlowBoard API listening on http://127.0.0.1:${PORT}`);
});
