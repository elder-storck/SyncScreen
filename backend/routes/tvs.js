const express = require('express');
const router = express.Router();
const db = require('../db');
const signal = require('../signal');

// TV registra-se e recebe sua configuração atual
router.post('/register', (req, res) => {
  const { id, name, ip_address, android_id } = req.body;
  if (!id) return res.status(400).json({ error: 'id obrigatório' });

  db.prepare(`
    INSERT INTO tvs (id, name, last_seen, ip_address, android_id)
    VALUES (@id, @name, @now, @ip, @aid)
    ON CONFLICT(id) DO UPDATE SET
      name       = excluded.name,
      last_seen  = excluded.last_seen,
      ip_address = excluded.ip_address,
      android_id = excluded.android_id
  `).run({
    id,
    name: name || id,
    now: Date.now(),
    ip: ip_address || '',
    aid: android_id || '',
  });

  req.app.locals.broadcast({ type: 'tv_updated', tv_id: id });
  res.json({ success: true, config: buildConfig(id) });
});

// Heartbeat — TV reporta que está viva e recebe config atualizada
router.post('/heartbeat', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id obrigatório' });

  const updated = db.prepare(`UPDATE tvs SET last_seen = ? WHERE id = ?`).run(Date.now(), id);
  if (updated.changes === 0) {
    // TV ainda não registrada (reinicialização rápida), registra automaticamente
    db.prepare(`INSERT OR IGNORE INTO tvs (id, name, last_seen) VALUES (?, ?, ?)`).run(id, id, Date.now());
  }

  req.app.locals.broadcast({ type: 'tv_updated', tv_id: id });
  res.json({ config: buildConfig(id) });
});

// Lista todas as TVs com status online/offline
router.get('/', (req, res) => {
  const now = Date.now();
  const tvs = db.prepare(`SELECT * FROM tvs ORDER BY last_seen DESC`).all()
    .map(tv => ({ ...tv, online: (now - tv.last_seen) < 60_000 }));
  res.json(tvs);
});

// Remove uma TV da lista
router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM tvs WHERE id = ?`).run(req.params.id);
  db.prepare(`DELETE FROM tv_config WHERE tv_id = ?`).run(req.params.id);
  req.app.locals.broadcast({ type: 'tv_removed', tv_id: req.params.id });
  res.json({ success: true });
});

// Monta a config efetiva de uma TV (específica > global)
function buildConfig(tvId) {
  const tvCfg = db.prepare(`SELECT * FROM tv_config WHERE tv_id = ?`).get(tvId);
  const global = getGlobal();

  const images = db.prepare(`
    SELECT id, filename, order_index
    FROM images
    WHERE active = 1
    ORDER BY order_index ASC, id ASC
  `).all();

  const config = {
    mode:           tvCfg?.mode           ?? global.mode,
    webview_url:    tvCfg?.webview_url    ?? global.webview_url,
    slide_interval: tvCfg?.slide_interval ?? parseInt(global.slide_interval, 10),
    updated_at:     tvCfg?.updated_at     ?? 0,
    images,
  };

  if (signal.getScreencastTVs().has(tvId)) {
    config.mode = 'screencast';
  }

  return config;
}

function getGlobal() {
  return Object.fromEntries(
    db.prepare(`SELECT key, value FROM global_config`).all().map(r => [r.key, r.value])
  );
}

module.exports = router;
