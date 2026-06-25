const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');

const UPLOADS_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `img_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Somente imagens são permitidas (JPG, PNG, GIF, WEBP)'));
    }
  },
});

// Lista imagens ativas
router.get('/', (req, res) => {
  const images = db.prepare(`
    SELECT * FROM images WHERE active = 1 ORDER BY order_index ASC, id ASC
  `).all();
  res.json(images);
});

// Upload de nova imagem
router.post('/', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

  const { m } = db.prepare(
    `SELECT COALESCE(MAX(order_index), -1) AS m FROM images WHERE active = 1`
  ).get();

  const result = db.prepare(`
    INSERT INTO images (filename, original_name, order_index, active, uploaded_at)
    VALUES (?, ?, ?, 1, ?)
  `).run(req.file.filename, req.file.originalname, m + 1, Date.now());

  req.app.locals.broadcast({ type: 'images_updated' });
  res.json({ id: result.lastInsertRowid, filename: req.file.filename });
});

// Reordena imagens (recebe array de IDs na nova ordem)
router.put('/reorder', (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order deve ser array de IDs' });

  const update = db.prepare(`UPDATE images SET order_index = ? WHERE id = ?`);
  db.exec('BEGIN');
  order.forEach((id, i) => update.run(i, id));
  db.exec('COMMIT');

  req.app.locals.broadcast({ type: 'images_updated' });
  res.json({ success: true });
});

// Remove imagem (soft delete + remove arquivo)
router.delete('/:id', (req, res) => {
  const img = db.prepare(`SELECT * FROM images WHERE id = ?`).get(req.params.id);
  if (!img) return res.status(404).json({ error: 'Imagem não encontrada' });

  db.prepare(`UPDATE images SET active = 0 WHERE id = ?`).run(req.params.id);

  const filePath = path.join(UPLOADS_DIR, img.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  req.app.locals.broadcast({ type: 'images_updated' });
  res.json({ success: true });
});

module.exports = router;
