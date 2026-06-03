const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const tvRoutes     = require('./routes/tvs');
const configRoutes = require('./routes/config');
const imageRoutes  = require('./routes/images');

const app    = express();
const server = http.createServer(app);

// WebSocket usado pelo painel para receber atualizações em tempo real
const wss = new WebSocket.Server({ server, path: '/ws' });
const panelClients = new Set();

wss.on('connection', (ws) => {
  panelClients.add(ws);
  ws.on('close', () => panelClients.delete(ws));
  ws.on('error', () => panelClients.delete(ws));
});

// Função compartilhada com as rotas para notificar o painel
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
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());

// Arquivos de imagens enviados pelo admin
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Painel administrativo (pasta ../panel relativa ao backend)
app.use('/', express.static(path.join(__dirname, '../panel')));

// Rotas da API
app.use('/api/tvs',    tvRoutes);
app.use('/api/config', configRoutes);
app.use('/api/images', imageRoutes);

// Tratamento de erro do multer (arquivo inválido, tamanho, etc.)
app.use((err, req, res, next) => {
  if (err.message) return res.status(400).json({ error: err.message });
  next(err);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SyncScreen backend rodando em http://localhost:${PORT}`);
  console.log(`Painel:    http://localhost:${PORT}`);
  console.log(`API:       http://localhost:${PORT}/api`);
});
