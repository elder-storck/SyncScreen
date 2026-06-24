const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  const s = crypto.randomBytes(32).toString('hex');
  console.warn('⚠  JWT_SECRET não definido — usando chave temporária. Tokens são invalidados a cada restart!');
  return s;
})();

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Para rotas de API: retorna 401 JSON
function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.auth_token;
    if (!token) throw new Error('no token');
    req.user = verifyToken(token);
    next();
  } catch {
    res.clearCookie('auth_token');
    res.status(401).json({ error: 'não autorizado' });
  }
}

// Para rotas de página: redireciona para /login
function requireAuthPage(req, res, next) {
  try {
    const token = req.cookies?.auth_token;
    if (!token) throw new Error('no token');
    req.user = verifyToken(token);
    next();
  } catch {
    res.clearCookie('auth_token');
    res.redirect('/login');
  }
}

// Para rotas de API: retorna 403 JSON se não for admin
function requireAdmin(req, res, next) {
  try {
    const token = req.cookies?.auth_token;
    if (!token) throw new Error('no token');
    req.user = verifyToken(token);
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'acesso restrito a administradores' });
    next();
  } catch {
    res.clearCookie('auth_token');
    res.status(401).json({ error: 'não autorizado' });
  }
}

// Para a página /admin: redireciona para / se autenticado mas não for admin
function requireAdminPage(req, res, next) {
  try {
    const token = req.cookies?.auth_token;
    if (!token) throw new Error('no token');
    req.user = verifyToken(token);
    if (req.user.role !== 'admin') return res.redirect('/');
    next();
  } catch {
    res.clearCookie('auth_token');
    res.redirect('/login');
  }
}

module.exports = { signToken, requireAuth, requireAuthPage, requireAdmin, requireAdminPage };
