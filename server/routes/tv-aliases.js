const express = require('express');
const router = express.Router();
const { db } = require('../db');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT tv_id, display_name FROM tv_aliases').all());
});

router.put('/:tvId', (req, res) => {
  const { display_name } = req.body;
  if (!display_name || typeof display_name !== 'string') {
    return res.status(400).json({ error: 'display_name obrigatório' });
  }
  db.prepare(`
    INSERT INTO tv_aliases (tv_id, display_name) VALUES (?, ?)
    ON CONFLICT(tv_id) DO UPDATE SET display_name = excluded.display_name
  `).run(req.params.tvId, display_name.trim());
  res.json({ success: true });
});

router.delete('/:tvId', (req, res) => {
  db.prepare('DELETE FROM tv_aliases WHERE tv_id = ?').run(req.params.tvId);
  res.json({ success: true });
});

module.exports = router;
