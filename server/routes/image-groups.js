const express = require('express');
const router = express.Router();
const { db } = require('../db');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT id, name FROM image_groups ORDER BY id ASC').all());
});

router.put('/:id', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name obrigatório' });
  }
  const result = db.prepare('UPDATE image_groups SET name = ? WHERE id = ?')
    .run(name.trim(), parseInt(req.params.id, 10));
  if (result.changes === 0) return res.status(404).json({ error: 'Grupo não encontrado' });
  res.json({ success: true });
});

module.exports = router;
