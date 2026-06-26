const express = require('express');
const router = express.Router();
const { db } = require('../db');

// Lê configuração global
router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT key, value FROM global_config`).all();
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

// Atualiza configuração global e notifica painel
router.put('/', (req, res) => {
  const { mode, webview_url, slide_interval } = req.body;
  const set = db.prepare(`UPDATE global_config SET value = ? WHERE key = ?`);
  if (mode !== undefined)           set.run(String(mode), 'mode');
  if (webview_url !== undefined)    set.run(String(webview_url), 'webview_url');
  if (slide_interval !== undefined) set.run(String(slide_interval), 'slide_interval');

  req.app.locals.broadcast({ type: 'config_updated' });
  res.json({ success: true });
});

// Lê config específica de uma TV
router.get('/:tvId', (req, res) => {
  const cfg = db.prepare(`SELECT * FROM tv_config WHERE tv_id = ?`).get(req.params.tvId);
  res.json(cfg || null);
});

// Define config específica para uma TV
router.put('/:tvId', (req, res) => {
  const { tvId } = req.params;
  const { mode, webview_url, slide_interval, image_group } = req.body;

  const global = Object.fromEntries(
    db.prepare(`SELECT key, value FROM global_config`).all().map(r => [r.key, r.value])
  );

  const safeGroup = [1, 2, 3].includes(parseInt(image_group, 10))
    ? parseInt(image_group, 10)
    : 1;

  db.prepare(`
    INSERT INTO tv_config (tv_id, mode, webview_url, slide_interval, image_group, updated_at)
    VALUES (@tvId, @mode, @url, @interval, @group, @now)
    ON CONFLICT(tv_id) DO UPDATE SET
      mode           = excluded.mode,
      webview_url    = excluded.webview_url,
      slide_interval = excluded.slide_interval,
      image_group    = excluded.image_group,
      updated_at     = excluded.updated_at
  `).run({
    tvId,
    mode:     mode     ?? global.mode,
    url:      webview_url   !== undefined ? webview_url   : global.webview_url,
    interval: slide_interval !== undefined ? slide_interval : parseInt(global.slide_interval, 10),
    group:    safeGroup,
    now:      Date.now(),
  });

  req.app.locals.broadcast({ type: 'config_updated', tv_id: tvId });
  res.json({ success: true });
});

// Remove config específica da TV (volta a usar a global)
router.delete('/:tvId', (req, res) => {
  db.prepare(`DELETE FROM tv_config WHERE tv_id = ?`).run(req.params.tvId);
  req.app.locals.broadcast({ type: 'config_updated', tv_id: req.params.tvId });
  res.json({ success: true });
});

module.exports = router;
