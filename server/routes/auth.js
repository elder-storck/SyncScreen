const express = require('express');
const bcrypt = require('bcryptjs');
const { getUserByUsername, createUser, deleteUser, listUsers } = require('../db');
const { signToken, requireAuth, requireAdmin } = require('../auth');

// ─── Auth router: /api/auth ──────────────────────────────────────────────────

const authRouter = express.Router();

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'username e password obrigatórios' });

  const user = getUserByUsername(username);
  if (!user) return res.status(401).json({ error: 'credenciais inválidas' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'credenciais inválidas' });

  const token = signToken({ id: user.id, username: user.username, role: user.role });
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, role: req.user.role });
});

// ─── Users router: /api/users ────────────────────────────────────────────────

const usersRouter = express.Router();

usersRouter.use(requireAdmin);

usersRouter.get('/', (req, res) => {
  res.json(listUsers());
});

const USERNAME_RE = /^[A-Za-z0-9._-]{1,32}$/;
const VALID_ROLES = new Set(['admin', 'user']);

usersRouter.post('/', async (req, res) => {
  const { username, password, role = 'user' } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'username e password obrigatórios' });

  if (!USERNAME_RE.test(username))
    return res.status(400).json({ error: 'username inválido: use apenas letras, números, ponto, hífen ou underscore (máx. 32 caracteres)' });

  if (!VALID_ROLES.has(role))
    return res.status(400).json({ error: 'role inválido: use "admin" ou "user"' });

  if (getUserByUsername(username))
    return res.status(409).json({ error: 'usuário já existe' });

  const hash = await bcrypt.hash(password, 10);
  createUser(username, hash, role);
  res.status(201).json({ ok: true });
});

usersRouter.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0)
    return res.status(400).json({ error: 'id inválido' });

  if (!req.user || id === req.user.id)
    return res.status(400).json({ error: 'não é possível remover o próprio usuário' });

  deleteUser(id);
  res.json({ ok: true });
});

module.exports = { authRouter, usersRouter };
