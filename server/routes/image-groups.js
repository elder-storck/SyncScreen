const express = require('express');
const router = express.Router();
const { db } = require('../db');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT id, name FROM image_groups ORDER BY id ASC').all());
});

router.post('/', (req, res) => {
  const name = (typeof req.body.name === 'string' ? req.body.name.trim() : '') || 'Novo Grupo';
  const result = db.prepare('INSERT INTO image_groups (name) VALUES (?)').run(name);
  res.json({ id: result.lastInsertRowid, name });
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

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);

  const count = db.prepare('SELECT COUNT(*) AS c FROM image_groups').get().c;
  if (count <= 1) {
    return res.status(400).json({ error: 'Não é possível remover o único grupo restante' });
  }

  // Grupo destino das imagens e configs: o menor id que sobra
  const fallback = db.prepare(
    'SELECT id FROM image_groups WHERE id != ? ORDER BY id ASC LIMIT 1'
  ).get(id);

  db.prepare('UPDATE images    SET group_id    = ? WHERE group_id    = ?').run(fallback.id, id);
  db.prepare('UPDATE tv_config SET image_group = ? WHERE image_group = ?').run(fallback.id, id);
  db.prepare('DELETE FROM image_groups WHERE id = ?').run(id);

  req.app.locals.broadcast({ type: 'images_updated' });
  res.json({ success: true });
});

module.exports = router;
