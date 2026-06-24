// node:sqlite está disponível nativamente no Node.js 22+ — sem compilação nativa
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

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

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    DEFAULT (datetime('now'))
  );
`);

// Migração: adiciona coluna role se ainda não existir
const cols = db.prepare(`PRAGMA table_info(users)`).all();
if (!cols.some(c => c.name === 'role')) {
  db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
  // Garante que o usuário admin configurado em env tenha role admin
  const adminUsername = process.env.ADMIN_USER || 'admin';
  db.prepare(`UPDATE users SET role = 'admin' WHERE username = ?`).run(adminUsername);
}

// Seed default global config on first run
const seed = db.prepare(`INSERT OR IGNORE INTO global_config (key, value) VALUES (?, ?)`);
seed.run('mode', 'slideshow');
seed.run('webview_url', '');
seed.run('slide_interval', '5');

// ─── User helpers ────────────────────────────────────────────────────────────

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function createUser(username, passwordHash, role = 'user') {
  return db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, passwordHash, role);
}

function deleteUser(id) {
  return db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

function listUsers() {
  return db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id ASC').all();
}

function seedAdminUser() {
  const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (count > 0) return;

  const username = process.env.ADMIN_USER     || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  if (!process.env.ADMIN_PASSWORD) {
    console.warn('⚠  ADMIN_PASSWORD não definida — usando senha padrão "admin123". Troque em produção!');
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, 'admin');
  console.log(`✔ Usuário admin criado: ${username}`);
}

module.exports = { db, getUserByUsername, createUser, deleteUser, listUsers, seedAdminUser };
