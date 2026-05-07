// node:sqlite está disponível nativamente no Node.js 22+ — sem compilação nativa
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'syncscreen.db'));

db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS tvs (
    id          TEXT PRIMARY KEY,
    name        TEXT    NOT NULL DEFAULT 'TV',
    last_seen   INTEGER NOT NULL DEFAULT 0,
    ip_address  TEXT    NOT NULL DEFAULT '',
    android_id  TEXT    NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS global_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS tv_config (
    tv_id          TEXT    PRIMARY KEY,
    mode           TEXT    NOT NULL DEFAULT 'slideshow',
    webview_url    TEXT    NOT NULL DEFAULT '',
    slide_interval INTEGER NOT NULL DEFAULT 5,
    updated_at     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS images (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    filename      TEXT    NOT NULL,
    original_name TEXT    NOT NULL,
    order_index   INTEGER NOT NULL DEFAULT 0,
    active        INTEGER NOT NULL DEFAULT 1,
    uploaded_at   INTEGER NOT NULL DEFAULT 0
  );
`);

// Seed default global config on first run
const seed = db.prepare(`INSERT OR IGNORE INTO global_config (key, value) VALUES (?, ?)`);
seed.run('mode', 'slideshow');
seed.run('webview_url', '');
seed.run('slide_interval', '5');

module.exports = db;
