const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const path = require('path');
const cookieParser = require('cookie-parser');

const tvRoutes     = require('./routes/tvs');
const configRoutes = require('./routes/config');
const imageRoutes  = require('./routes/images');
const { authRouter, usersRouter } = require('./routes/auth');
const { requireAuth, requireAuthPage, requireAdminPage } = require('./auth');
const { seedAdminUser } = require('./db');
const signal       = require('./signal');

const app = express();

// HTTP — TVs e acesso local (localhost é sempre contexto seguro)
const httpServer = http.createServer(app);

// HTTPS — painel acessado de outros PCs (getDisplayMedia exige contexto seguro)
const tlsOptions = {
  key:  fs.readFileSync('/app/certs/key.pem'),
  cert: fs.readFileSync('/app/certs/cert.pem'),
};
const httpsServer = https.createServer(tlsOptions, app);

// WebSocket do painel (/ws) — notificações em tempo real, em ambos os servidores
const wss = new WebSocket.Server({ noServer: true });
const panelClients = new Set();

wss.on('connection', (ws) => {
  panelClients.add(ws);
  ws.on('close', () => panelClients.delete(ws));
  ws.on('error', () => panelClients.delete(ws));
});

function attachPanelWs(server) {
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, 'http://x').pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
    }
  });
}
attachPanelWs(httpServer);
attachPanelWs(httpsServer);

// Sinalização WebRTC (/signal) — TVs via HTTP, painel via HTTPS, mesmo estado compartilhado
signal.attach([httpServer, httpsServer], app);

function broadcast(event) {
  const msg = JSON.stringify(event);
  panelClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

app.locals.broadcast = broadcast;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(cookieParser());

// Arquivos estáticos (uploads de imagens)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Auth middleware para todas as rotas /api exceto as públicas das TVs e login
app.use('/api', (req, res, next) => {
  const pub = [
    ['POST', '/auth/login'],
    ['POST', '/auth/logout'],
    ['POST', '/tvs/register'],
    ['POST', '/tvs/heartbeat'],
  ];
  const isPublic = pub.some(([m, p]) => req.method === m && req.path === p);
  if (isPublic) return next();
  requireAuth(req, res, next);
});

// Rotas públicas de auth (login/logout/me)
app.use('/api/auth', authRouter);

// Rotas protegidas (o middleware /api acima já verificou o token)
app.use('/api/tvs',    tvRoutes);
app.use('/api/config', configRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/users',  usersRouter);

// Páginas do painel
const panelDir = path.join(__dirname, '../panel');

app.get('/login', (req, res) => {
  res.sendFile(path.join(panelDir, 'login.html'));
});

app.get('/admin', requireAdminPage, (req, res) => {
  res.sendFile(path.join(panelDir, 'admin.html'));
});

app.get('/', requireAuthPage, (req, res) => {
  res.sendFile(path.join(panelDir, 'index.html'));
});

app.use((err, req, res, next) => {
  if (err.message) return res.status(400).json({ error: err.message });
  next(err);
});

const HTTP_PORT  = process.env.PORT       || 3001;
const HTTPS_PORT = process.env.PANEL_PORT || 3002;

httpServer.listen(HTTP_PORT, () => {
  console.log(`HTTP  (TVs + local): http://localhost:${HTTP_PORT}`);
});

httpsServer.listen(HTTPS_PORT, () => {
  console.log(`HTTPS (painel remoto): https://localhost:${HTTPS_PORT}`);
  console.log(`⚠  Certificado autoassinado: aceite o aviso no navegador (só na primeira vez).`);
});

seedAdminUser().catch(err => console.error('Erro ao criar usuário admin:', err));
