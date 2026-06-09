const WebSocket = require('ws');
const db = require('./db');

let broadcaster = null;
const tvClients    = new Map(); // tvId → WebSocket
const screencastTVs  = new Set(); // tvIds atualmente em screencast
const previousModes  = new Map(); // tvId → modo anterior

function getScreencastTVs() {
  return screencastTVs;
}

function attach(server, app) {
  const wss = new WebSocket.Server({ server, path: '/signal' });

  wss.on('connection', (ws) => {
    ws.on('error', () => { try { ws.close(); } catch (_) {} });

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }

      if (msg.type === 'broadcaster-hello') {
        handleBroadcasterHello(ws, msg, app);
        return;
      }

      if (msg.type === 'tv-hello') {
        handleTvHello(ws, msg);
        return;
      }

      // Roteia mensagens de sinalização WebRTC
      if (ws === broadcaster) {
        // Broadcaster → TV
        const tvWs = tvClients.get(msg.tvId);
        if (tvWs?.readyState === WebSocket.OPEN) tvWs.send(data.toString());
      } else {
        // TV → Broadcaster
        if (broadcaster?.readyState === WebSocket.OPEN) broadcaster.send(data.toString());
      }
    });

    ws.on('close', () => {
      if (ws === broadcaster) {
        handleBroadcasterDisconnect(app);
      } else {
        for (const [tvId, tvWs] of tvClients) {
          if (tvWs === ws) { tvClients.delete(tvId); break; }
        }
      }
    });
  });
}

function handleBroadcasterHello(ws, msg, app) {
  // Encerra sessão anterior se houver
  for (const tvWs of tvClients.values()) {
    try { tvWs.close(); } catch (_) {}
  }
  tvClients.clear();
  screencastTVs.clear();
  previousModes.clear();

  broadcaster = ws;

  for (const tvId of (msg.tvIds || [])) {
    const tvCfg    = db.prepare(`SELECT mode FROM tv_config WHERE tv_id = ?`).get(tvId);
    const globalRow = db.prepare(`SELECT value FROM global_config WHERE key = 'mode'`).get();
    previousModes.set(tvId, tvCfg?.mode || globalRow?.value || 'slideshow');
    screencastTVs.add(tvId);
  }
}

function handleTvHello(ws, msg) {
  const { tvId } = msg;
  tvClients.set(tvId, ws);
  if (broadcaster?.readyState === WebSocket.OPEN && screencastTVs.has(tvId)) {
    broadcaster.send(JSON.stringify({ type: 'tv-ready', tvId }));
  }
}

function handleBroadcasterDisconnect(app) {
  for (const tvWs of tvClients.values()) {
    try { tvWs.close(); } catch (_) {}
  }
  tvClients.clear();
  screencastTVs.clear();
  previousModes.clear();
  broadcaster = null;
  app.locals.broadcast({ type: 'config_updated' });
}

module.exports = { attach, getScreencastTVs };
