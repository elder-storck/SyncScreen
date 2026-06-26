# Image Groups, TV Aliases & Panel Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar grupos de imagens nomeáveis, aliases de TV no admin, exibir modo nos cards, e limpar a UI removendo a seção de configuração global.

**Architecture:** Backend SQLite recebe duas novas tabelas (`image_groups`, `tv_aliases`) e migrações em `images` e `tv_config`. Dois novos arquivos de rota são registrados no `server.js`. O frontend (`index.html`) é refatorado para usar abas por grupo e dropdown combinado de modo+grupo. A página `admin.html` ganha uma segunda aba para gerenciar aliases de TV.

**Tech Stack:** Node.js 22+, Express, SQLite (`node:sqlite`), Bootstrap 5.3.8, Vanilla JS

## Global Constraints

- SQLite via `node:sqlite` (built-in Node 22+) — sem ORM, sem driver externo
- Sem framework de testes — verificação via `curl` e browser manual
- Bootstrap 5.3.8 com SRI hashes já no HTML — não alterar os CDN links
- Commits frequentes após cada task
- Nenhum campo de formulário deve usar `value=""` como fallback para config global — cada TV tem sua própria config explícita

---

## File Map

| Arquivo | Mudança |
|---------|---------|
| `server/db.js` | Novas tabelas + migrações |
| `server/routes/image-groups.js` | **NOVO** — GET lista, PUT renomeia |
| `server/routes/tv-aliases.js` | **NOVO** — GET lista, PUT upsert, DELETE remove |
| `server/routes/images.js` | POST aceita `group_id`; GET já retorna tudo |
| `server/routes/config.js` | PUT aceita `image_group`; GET já retorna tudo |
| `server/routes/tvs.js` | `buildConfig()` filtra por grupo; GET `/` inclui `effective_mode` |
| `server/server.js` | Registra as 2 novas rotas |
| `server/panel/index.html` | Remove global config, adiciona tabs de grupo, dropdown combinado, modo nos cards |
| `server/panel/admin.html` | Converte para abas; adiciona aba de mapeamento de TVs |

---

## Task 1: Migrações e novas tabelas no banco

**Files:**
- Modify: `server/db.js`

**Interfaces:**
- Produz: tabelas `image_groups` (3 linhas seed) e `tv_aliases`; colunas `images.group_id` e `tv_config.image_group`

- [ ] **Step 1: Adicionar tabelas e seed em `db.js`**

Após o bloco `db.exec(` que cria as tabelas existentes (linha 14), e após a migração de `role` já existente (linhas 54-58), adicionar:

```js
// Novas tabelas
db.exec(`
  CREATE TABLE IF NOT EXISTS image_groups (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS tv_aliases (
    tv_id        TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT ''
  );
`);

// Seed dos 3 grupos (idempotente)
const seedGroup = db.prepare(`INSERT OR IGNORE INTO image_groups (id, name) VALUES (?, ?)`);
seedGroup.run(1, 'Grupo 1');
seedGroup.run(2, 'Grupo 2');
seedGroup.run(3, 'Grupo 3');

// Migração: group_id em images
const imgCols = db.prepare(`PRAGMA table_info(images)`).all();
if (!imgCols.some(c => c.name === 'group_id')) {
  db.exec(`ALTER TABLE images ADD COLUMN group_id INTEGER NOT NULL DEFAULT 1`);
}

// Migração: image_group em tv_config
const tvCfgCols = db.prepare(`PRAGMA table_info(tv_config)`).all();
if (!tvCfgCols.some(c => c.name === 'image_group')) {
  db.exec(`ALTER TABLE tv_config ADD COLUMN image_group INTEGER NOT NULL DEFAULT 1`);
}
```

Inserir logo após o bloco de migração `role` (depois da linha `db.prepare(\`UPDATE users SET role = 'admin' ...\`).run();`).

- [ ] **Step 2: Verificar que o servidor sobe sem erros**

```bash
cd server && node server.js
```

Esperado: servidor sobe nas portas 3001/3002 sem stack trace. `Ctrl+C` para parar.

- [ ] **Step 3: Commit**

```bash
git add server/db.js
git commit -m "feat(db): add image_groups, tv_aliases tables and column migrations"
```

---

## Task 2: Rota `/api/image-groups`

**Files:**
- Create: `server/routes/image-groups.js`
- Modify: `server/server.js`

**Interfaces:**
- Produz: `GET /api/image-groups` → `[{ id: number, name: string }]`
- Produz: `PUT /api/image-groups/:id` body `{ name: string }` → `{ success: true }`

- [ ] **Step 1: Criar `server/routes/image-groups.js`**

```js
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
```

- [ ] **Step 2: Registrar a rota em `server/server.js`**

Após a linha `const imageRoutes = require('./routes/images');` (linha 11), adicionar:

```js
const imageGroupRoutes = require('./routes/image-groups');
const tvAliasRoutes    = require('./routes/tv-aliases');
```

Após a linha `app.use('/api/images', imageRoutes);` (linha 95), adicionar:

```js
app.use('/api/image-groups', imageGroupRoutes);
app.use('/api/tv-aliases',   tvAliasRoutes);
```

*(A rota `tv-aliases` será criada na Task 3 — o require não quebra se o arquivo não existir ainda, mas para evitar erro de startup, criar o arquivo na Task 3 antes de reiniciar o servidor.)*

- [ ] **Step 3: Verificar com curl**

```bash
# Listar grupos
curl -b "token=SEU_TOKEN" http://localhost:3001/api/image-groups
# Esperado: [{"id":1,"name":"Grupo 1"},{"id":2,"name":"Grupo 2"},{"id":3,"name":"Grupo 3"}]

# Renomear grupo 1
curl -b "token=SEU_TOKEN" -X PUT http://localhost:3001/api/image-groups/1 \
  -H "Content-Type: application/json" -d '{"name":"Promoções"}'
# Esperado: {"success":true}

# Confirmar mudança
curl -b "token=SEU_TOKEN" http://localhost:3001/api/image-groups
# Esperado: primeiro item com name "Promoções"

# Restaurar
curl -b "token=SEU_TOKEN" -X PUT http://localhost:3001/api/image-groups/1 \
  -H "Content-Type: application/json" -d '{"name":"Grupo 1"}'
```

*(Para obter token: faça login via `POST /api/auth/login` e copie o cookie `token` da resposta.)*

- [ ] **Step 4: Commit**

```bash
git add server/routes/image-groups.js server/server.js
git commit -m "feat(api): add /api/image-groups route (list + rename)"
```

---

## Task 3: Rota `/api/tv-aliases`

**Files:**
- Create: `server/routes/tv-aliases.js`

**Interfaces:**
- Produz: `GET /api/tv-aliases` → `[{ tv_id: string, display_name: string }]`
- Produz: `PUT /api/tv-aliases/:tvId` body `{ display_name: string }` → `{ success: true }`
- Produz: `DELETE /api/tv-aliases/:tvId` → `{ success: true }`

- [ ] **Step 1: Criar `server/routes/tv-aliases.js`**

```js
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
```

- [ ] **Step 2: Iniciar o servidor e verificar com curl**

```bash
# Criar alias para uma TV
curl -b "token=SEU_TOKEN" -X PUT http://localhost:3001/api/tv-aliases/TV_ID_AQUI \
  -H "Content-Type: application/json" -d '{"display_name":"Financeiro"}'
# Esperado: {"success":true}

# Listar aliases
curl -b "token=SEU_TOKEN" http://localhost:3001/api/tv-aliases
# Esperado: [{"tv_id":"TV_ID_AQUI","display_name":"Financeiro"}]

# Remover alias
curl -b "token=SEU_TOKEN" -X DELETE http://localhost:3001/api/tv-aliases/TV_ID_AQUI
# Esperado: {"success":true}
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/tv-aliases.js
git commit -m "feat(api): add /api/tv-aliases route (list + upsert + delete)"
```

---

## Task 4: Suporte a `group_id` em `/api/images`

**Files:**
- Modify: `server/routes/images.js`

**Interfaces:**
- Modifica: `POST /api/images` — campo `group_id` no multipart (inteiro 1-3, default 1)
- Não muda: `GET /api/images` já retorna `group_id` via `SELECT *`

- [ ] **Step 1: Modificar o handler POST em `server/routes/images.js`**

Localizar o handler `router.post('/', upload.single('image'), ...)` (linha 41). Substituir o conteúdo de `router.post` para extrair `group_id` do body:

```js
router.post('/', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

  const groupId = parseInt(req.body.group_id, 10);
  const safeGroupId = [1, 2, 3].includes(groupId) ? groupId : 1;

  const { m } = db.prepare(
    `SELECT COALESCE(MAX(order_index), -1) AS m FROM images WHERE active = 1 AND group_id = ?`
  ).get(safeGroupId);

  const result = db.prepare(`
    INSERT INTO images (filename, original_name, order_index, active, uploaded_at, group_id)
    VALUES (?, ?, ?, 1, ?, ?)
  `).run(req.file.filename, req.file.originalname, m + 1, Date.now(), safeGroupId);

  req.app.locals.broadcast({ type: 'images_updated' });
  res.json({ id: result.lastInsertRowid, filename: req.file.filename });
});
```

- [ ] **Step 2: Verificar upload com group_id**

```bash
# Upload de uma imagem para o grupo 2
curl -b "token=SEU_TOKEN" -X POST http://localhost:3001/api/images \
  -F "image=@/caminho/para/imagem.jpg" -F "group_id=2"
# Esperado: {"id":N,"filename":"img_...jpg"}

# Confirmar group_id na listagem
curl -b "token=SEU_TOKEN" http://localhost:3001/api/images
# Esperado: o objeto da imagem recém-enviada tem "group_id":2
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/images.js
git commit -m "feat(api): images upload now accepts group_id field"
```

---

## Task 5: Suporte a `image_group` em `/api/config/:tvId`

**Files:**
- Modify: `server/routes/config.js`

**Interfaces:**
- Modifica: `PUT /api/config/:tvId` — aceita `image_group` (inteiro 1-3) no body
- Não muda: `GET /api/config/:tvId` já retorna `image_group` via `SELECT *`

- [ ] **Step 1: Modificar o handler PUT em `server/routes/config.js`**

Localizar o handler `router.put('/:tvId', ...)` (linha 30). Adicionar `image_group` nos parâmetros desestruturados e no INSERT/UPDATE:

```js
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
```

- [ ] **Step 2: Verificar com curl**

```bash
# Salvar config com image_group=2
curl -b "token=SEU_TOKEN" -X PUT http://localhost:3001/api/config/TV_ID_AQUI \
  -H "Content-Type: application/json" \
  -d '{"mode":"slideshow","image_group":2,"slide_interval":5}'
# Esperado: {"success":true}

# Ler config
curl -b "token=SEU_TOKEN" http://localhost:3001/api/config/TV_ID_AQUI
# Esperado: objeto com "image_group":2
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/config.js
git commit -m "feat(api): tv_config now stores image_group"
```

---

## Task 6: `buildConfig()` filtra imagens por grupo; GET `/api/tvs` inclui `effective_mode`

**Files:**
- Modify: `server/routes/tvs.js`

**Interfaces:**
- Modifica: `buildConfig(tvId)` — filtra `images` por `image_group`; webview retorna `images: []`
- Modifica: `GET /api/tvs` — cada TV tem campo `effective_mode: 'slideshow' | 'webview'`

- [ ] **Step 1: Atualizar `buildConfig()` em `server/routes/tvs.js`**

Substituir a função `buildConfig` (linhas 63-87) inteira:

```js
function buildConfig(tvId) {
  const tvCfg = db.prepare(`SELECT * FROM tv_config WHERE tv_id = ?`).get(tvId);
  const global = getGlobal();

  const mode = tvCfg?.mode ?? global.mode;
  const imageGroup = tvCfg?.image_group ?? 1;

  const images = mode === 'slideshow'
    ? db.prepare(`
        SELECT id, filename, order_index FROM images
        WHERE active = 1 AND group_id = ?
        ORDER BY order_index ASC, id ASC
      `).all(imageGroup)
    : [];

  const config = {
    mode,
    webview_url:    tvCfg?.webview_url    ?? global.webview_url,
    slide_interval: tvCfg?.slide_interval ?? parseInt(global.slide_interval, 10),
    image_group:    imageGroup,
    updated_at:     tvCfg?.updated_at     ?? 0,
    images,
  };

  if (signal.getScreencastTVs().has(tvId)) {
    config.mode = 'screencast';
    config.images = [];
  }

  return config;
}
```

- [ ] **Step 2: Atualizar `GET /` para incluir `effective_mode`**

Substituir o handler `router.get('/', ...)` (linhas 47-52):

```js
router.get('/', (req, res) => {
  const now = Date.now();
  const globalMode = db.prepare(`SELECT value FROM global_config WHERE key = 'mode'`).get()?.value || 'slideshow';
  const tvs = db.prepare(`
    SELECT t.*, COALESCE(tc.mode, ?) AS effective_mode
    FROM tvs t
    LEFT JOIN tv_config tc ON tc.tv_id = t.id
    ORDER BY t.last_seen DESC
  `).all(globalMode)
    .map(tv => ({ ...tv, online: (now - tv.last_seen) < 60_000 }));
  res.json(tvs);
});
```

- [ ] **Step 3: Verificar com curl**

```bash
# Listar TVs — deve conter campo effective_mode em cada objeto
curl -b "token=SEU_TOKEN" http://localhost:3001/api/tvs
# Esperado: cada TV tem "effective_mode":"slideshow" ou "webview"

# Heartbeat de uma TV e verificar que buildConfig retorna imagens filtradas
# (verificação funcional: a TV Android receberá só imagens do grupo configurado)
```

- [ ] **Step 4: Commit**

```bash
git add server/routes/tvs.js
git commit -m "feat(api): tvs list includes effective_mode; buildConfig filters images by group"
```

---

## Task 7: Refatorar `index.html` — remoções, cards, abas de grupo, modal

**Files:**
- Modify: `server/panel/index.html`

Esta task tem muitas mudanças no mesmo arquivo. Execute cada step antes de passar ao próximo.

---

### Step 7.1 — Remover card "Configuração Global" e funções JS associadas

- [ ] **Remover o bloco HTML do card "Config Global" (linhas 53-81)**

Deletar do HTML:
```html
  <!-- Config Global -->
  <div class="card shadow-sm mb-4">
    <div class="card-header py-2">
      <h6 class="mb-0 fw-semibold">Configuração Global</h6>
    </div>
    <div class="card-body">
      <div class="row g-3 align-items-end">
        <div class="col-sm-3">
          <label class="form-label small fw-semibold mb-1">Modo de exibição</label>
          <select class="form-select form-select-sm" id="g-mode" onchange="toggleUrlRow()">
            <option value="slideshow">🖼 Slideshow</option>
            <option value="webview">🌐 Site (WebView)</option>
          </select>
        </div>
        <div class="col-sm-5" id="url-row">
          <label class="form-label small fw-semibold mb-1">URL do site</label>
          <input class="form-control form-control-sm" id="g-url" type="url" placeholder="https://exemplo.com.br">
        </div>
        <div class="col-sm-2">
          <label class="form-label small fw-semibold mb-1">Intervalo slides (s)</label>
          <input class="form-control form-control-sm" id="g-interval" type="number" min="1" max="3600" value="5">
        </div>
        <div class="col-sm-2">
          <button class="btn btn-primary btn-sm w-100" onclick="saveGlobal()">Aplicar a todas</button>
        </div>
      </div>
      <div id="global-msg" class="mt-2"></div>
    </div>
  </div>
```

- [ ] **Remover no `<style>` a regra `#url-row { display: none; }`**

Deletar a linha:
```css
    #url-row { display: none; }
```

- [ ] **Remover variável `globalCfg` e funções JS: `loadGlobal`, `saveGlobal`, `toggleUrlRow`**

Deletar:
```js
let globalCfg = {};
```

Deletar bloco completo `// ─── Configuração global` (de `async function loadGlobal()` até o final de `saveGlobal()`).

Deletar a chamada `loadGlobal();` dentro de `loadAll()`.

- [ ] **Remover `TV_NAME_MAP` hardcoded**

Deletar:
```js
const TV_NAME_MAP = {
  'I2HRN53R2C62T': 'Financeiro',
  'TDX4Z7PER3YGJ': 'Comunicação',
  'K3TKNZZ5TXYQZ': 'Comercial',
  'WMJOBRUD5SAZ3':  'Operacional',
};
```

- [ ] **Atualizar `displayName()` para usar aliases carregados da API**

Adicionar variável no topo do `<script>` (junto com `let allTVs = [];`):
```js
let tvAliasMap = {};   // tv_id → display_name
```

Substituir a função `displayName`:
```js
function displayName(tv) {
  return tvAliasMap[tv.id] || tv.name;
}
```

Adicionar função de carregamento de aliases:
```js
async function loadAliases() {
  const aliases = await api('/api/tv-aliases') ?? [];
  tvAliasMap = Object.fromEntries(aliases.map(a => [a.tv_id, a.display_name]));
}
```

Adicionar chamada `loadAliases()` em `loadAll()`:
```js
function loadAll() {
  loadAliases();
  loadTVs();
  loadImages();
}
```

---

### Step 7.2 — Mostrar modo nos cards de TV

- [ ] **Atualizar o template HTML dos cards em `loadTVs()`**

Localizar a linha:
```js
<small class="text-muted">${esc(tv.ip_address || 'IP desconhecido')} · ${ago(tv.last_seen)}</small>
```

Substituir por:
```js
<small class="text-muted">${esc(tv.ip_address || 'IP desconhecido')} · ${ago(tv.last_seen)} · ${tv.effective_mode === 'webview' ? '🌐 Site' : '🖼 Slideshow'}</small>
```

---

### Step 7.3 — Modal com dropdown combinado (modo + grupo)

- [ ] **Substituir o `<select id="m-mode">` no modal**

Localizar no HTML do modal:
```html
        <div class="mb-3">
          <label class="form-label small fw-semibold">Modo</label>
          <select class="form-select form-select-sm" id="m-mode">
            <option value="slideshow">🖼 Slideshow</option>
            <option value="webview">🌐 Site (WebView)</option>
          </select>
        </div>
```

Substituir por:
```html
        <div class="mb-3">
          <label class="form-label small fw-semibold">Modo</label>
          <select class="form-select form-select-sm" id="m-mode" onchange="onModalModeChange()">
            <option value="webview">🌐 Site (WebView)</option>
            <option value="slideshow_1">🖼 Grupo 1</option>
            <option value="slideshow_2">🖼 Grupo 2</option>
            <option value="slideshow_3">🖼 Grupo 3</option>
          </select>
        </div>
```

- [ ] **Remover botão "Usar config. global" e texto de ajuda do modal**

Deletar do footer do modal:
```html
        <button class="btn btn-sm btn-outline-secondary" onclick="resetTV()">Usar config. global</button>
```

Deletar do body do modal:
```html
        <p class="text-muted small mb-0">Campos em branco usam a configuração global.</p>
```

- [ ] **Remover a função `resetTV()` do JS** (que chamava `DELETE /api/config/:tvId`)

- [ ] **Adicionar função `onModalModeChange()` que controla visibilidade da URL**

```js
function onModalModeChange() {
  const val = document.getElementById('m-mode').value;
  document.getElementById('m-url-row').style.display = val === 'webview' ? '' : 'none';
}
```

- [ ] **Adicionar `id="m-url-row"` ao div que envolve o campo de URL no modal**

Localizar:
```html
        <div class="mb-3">
          <label class="form-label small fw-semibold">URL do site</label>
          <input class="form-control form-control-sm" id="m-url" type="url" placeholder="https://...">
        </div>
```

Substituir por:
```html
        <div class="mb-3" id="m-url-row" style="display:none">
          <label class="form-label small fw-semibold">URL do site</label>
          <input class="form-control form-control-sm" id="m-url" type="url" placeholder="https://...">
        </div>
```

- [ ] **Atualizar `openTV()` para carregar grupos e reconstruir valor composto**

Substituir a função `openTV`:
```js
async function openTV(id, name) {
  document.getElementById('modal-tv-id').value = id;
  document.getElementById('modal-tv-name').textContent = name;

  // Atualiza nomes dos grupos no select
  const groups = await api('/api/image-groups') ?? [];
  const select = document.getElementById('m-mode');
  groups.forEach(g => {
    const opt = select.querySelector(`option[value="slideshow_${g.id}"]`);
    if (opt) opt.textContent = `🖼 ${g.name}`;
  });

  const cfg = await api(`/api/config/${id}`);
  let modeVal = 'slideshow_1';
  if (cfg) {
    if (cfg.mode === 'webview') {
      modeVal = 'webview';
    } else {
      modeVal = `slideshow_${cfg.image_group ?? 1}`;
    }
    document.getElementById('m-url').value      = cfg.webview_url || '';
    document.getElementById('m-interval').value = cfg.slide_interval || 5;
  }
  select.value = modeVal;
  onModalModeChange();
  tvModal.show();
}
```

- [ ] **Atualizar `saveTV()` para decompor o valor composto**

Substituir a função `saveTV`:
```js
async function saveTV() {
  const id  = document.getElementById('modal-tv-id').value;
  const val = document.getElementById('m-mode').value;

  const mode        = val === 'webview' ? 'webview' : 'slideshow';
  const image_group = val === 'webview' ? 1 : parseInt(val.replace('slideshow_', ''), 10);

  await api(`/api/config/${id}`, {
    method: 'PUT',
    json: {
      mode,
      image_group,
      webview_url:    document.getElementById('m-url').value,
      slide_interval: parseInt(document.getElementById('m-interval').value) || 5,
    },
  });
  tvModal.hide();
  loadTVs();
}
```

---

### Step 7.4 — Seção de imagens com abas por grupo

- [ ] **Substituir o HTML da seção "Imagens do Slideshow"**

Localizar o card completo (linhas 83-105):
```html
  <!-- Imagens -->
  <div class="card shadow-sm mb-4">
    <div class="card-header py-2">
      <h6 class="mb-0 fw-semibold">Imagens do Slideshow</h6>
    </div>
    <div class="card-body">
      <div id="dropzone" ...>...</div>
      <div id="upload-msg" class="mt-2"></div>
      <hr class="my-3">
      <div id="img-grid" class="img-grid">
        <p class="text-muted small">Nenhuma imagem cadastrada.</p>
      </div>
    </div>
  </div>
```

Substituir por:
```html
  <!-- Imagens -->
  <div class="card shadow-sm mb-4">
    <div class="card-header py-2">
      <h6 class="mb-0 fw-semibold">Imagens do Slideshow</h6>
    </div>
    <div class="card-body p-0">
      <ul class="nav nav-tabs px-3 pt-2" id="group-tabs" role="tablist"></ul>
      <div class="tab-content p-3" id="group-tab-content"></div>
    </div>
  </div>
```

- [ ] **Adicionar CSS para o rename inline no `<style>`**

```css
    .group-name-input { border: none; background: transparent; font-weight: 600; font-size: .9rem; width: auto; min-width: 60px; max-width: 180px; padding: 0; }
    .group-name-input:focus { outline: 1px solid #0d6efd; border-radius: 3px; background: #fff; }
```

- [ ] **Substituir a função `loadImages()` no JS**

```js
let imageGroups = [];

async function loadImages() {
  imageGroups = await api('/api/image-groups') ?? [];
  const images  = await api('/api/images') ?? [];

  const tabsEl   = document.getElementById('group-tabs');
  const contentEl = document.getElementById('group-tab-content');

  tabsEl.innerHTML   = '';
  contentEl.innerHTML = '';

  imageGroups.forEach((group, i) => {
    const isActive = i === 0;
    const groupImgs = images.filter(img => img.group_id === group.id);

    // Tab pill
    const li = document.createElement('li');
    li.className = 'nav-item';
    li.innerHTML = `
      <button class="nav-link${isActive ? ' active' : ''}" id="tab-g${group.id}"
              data-bs-toggle="tab" data-bs-target="#pane-g${group.id}" type="button">
        <input class="group-name-input" id="gname-${group.id}" value="${esc(group.name)}"
               title="Clique para renomear"
               onblur="renameGroup(${group.id})"
               onkeydown="if(event.key==='Enter'){this.blur()}">
      </button>`;
    tabsEl.appendChild(li);

    // Pane
    const pane = document.createElement('div');
    pane.className = `tab-pane fade${isActive ? ' show active' : ''}`;
    pane.id = `pane-g${group.id}`;
    pane.innerHTML = `
      <div id="dropzone-${group.id}"
           onclick="document.getElementById('file-input-${group.id}').click()"
           ondragover="onDragOver(event,${group.id})"
           ondragleave="onDragLeave(${group.id})"
           ondrop="onDrop(event,${group.id})"
           style="border:2px dashed #adb5bd;border-radius:8px;padding:28px 20px;text-align:center;cursor:pointer;transition:all .2s">
        <div class="fs-5 mb-1">⬆️</div>
        <div class="small">Clique ou arraste imagens aqui</div>
        <small class="text-muted">JPG, PNG, GIF, WEBP · máx. 20 MB</small>
        <input type="file" id="file-input-${group.id}" multiple accept="image/*" class="d-none"
               onchange="uploadFiles(this.files,${group.id})">
      </div>
      <div id="upload-msg-${group.id}" class="mt-2"></div>
      <hr class="my-3">
      <div id="img-grid-${group.id}" class="img-grid">
        ${groupImgs.length
          ? groupImgs.map(img => `
            <div class="img-item" data-id="${img.id}">
              <img src="/uploads/${esc(img.filename)}" alt="${esc(img.original_name)}" loading="lazy">
              <button class="btn btn-danger del" onclick="deleteImg(${img.id})">✕</button>
              <small title="${esc(img.original_name)}">${esc(img.original_name)}</small>
            </div>`).join('')
          : '<p class="text-muted small">Nenhuma imagem neste grupo.</p>'
        }
      </div>`;
    contentEl.appendChild(pane);
  });
}
```

- [ ] **Adicionar função `renameGroup()` no JS**

```js
async function renameGroup(groupId) {
  const input = document.getElementById(`gname-${groupId}`);
  const name  = input.value.trim();
  if (!name) { input.value = imageGroups.find(g => g.id === groupId)?.name || ''; return; }
  const ok = await api(`/api/image-groups/${groupId}`, { method: 'PUT', json: { name } });
  if (ok) {
    const g = imageGroups.find(g => g.id === groupId);
    if (g) g.name = name;
  } else {
    input.value = imageGroups.find(g => g.id === groupId)?.name || '';
  }
}
```

- [ ] **Atualizar as funções de drag-and-drop para aceitar `groupId`**

Substituir as funções existentes:
```js
function onDragOver(e, groupId) {
  e.preventDefault();
  document.getElementById(`dropzone-${groupId}`).style.borderColor = '#0d6efd';
  document.getElementById(`dropzone-${groupId}`).style.background  = '#f0f4ff';
}
function onDragLeave(groupId) {
  document.getElementById(`dropzone-${groupId}`).style.borderColor = '#adb5bd';
  document.getElementById(`dropzone-${groupId}`).style.background  = '';
}
function onDrop(e, groupId) {
  e.preventDefault();
  onDragLeave(groupId);
  uploadFiles(e.dataTransfer.files, groupId);
}
```

- [ ] **Atualizar `uploadFiles()` para enviar `group_id` e usar o msg correto por grupo**

```js
async function uploadFiles(files, groupId) {
  if (!files?.length) return;
  const msgEl = document.getElementById(`upload-msg-${groupId}`);
  msgEl.innerHTML = '<div class="alert alert-info py-1 small">Enviando...</div>';

  let ok = 0, fail = 0;
  for (const file of Array.from(files)) {
    const fd = new FormData();
    fd.append('image', file);
    fd.append('group_id', groupId);
    const res = await fetch('/api/images', { method: 'POST', body: fd });
    if (res.ok) ok++; else fail++;
  }

  const msgType = fail ? 'warning' : 'success';
  const msgText = `${ok} imagem(ns) enviada(s)${fail ? ` · ${fail} com erro` : ''}.`;
  msgEl.innerHTML = `<div class="alert alert-${msgType} py-1 small">${msgText}</div>`;
  setTimeout(() => msgEl.innerHTML = '', 4000);

  const input = document.getElementById(`file-input-${groupId}`);
  if (input) input.value = '';
  loadImages();
}
```

- [ ] **Remover referências ao antigo `#dropzone`, `#upload-msg`, `#img-grid` e `#file-input`**

Verificar que não restam chamadas a `document.getElementById('dropzone')`, `document.getElementById('upload-msg')`, `document.getElementById('img-grid')`, `document.getElementById('file-input')`.

- [ ] **Verificar no browser**

1. Abrir o painel em `https://localhost:3002`
2. Confirmar que a seção "Configuração Global" desapareceu
3. Confirmar que a seção de imagens tem 3 abas ("Grupo 1", "Grupo 2", "Grupo 3")
4. Renomear "Grupo 1" → nome novo → clicar fora → confirmar que salvou (recarregar)
5. Upload de imagem numa aba → confirmar que aparece só naquela aba
6. Abrir config de uma TV → confirmar que o select tem "Site", "Grupo 1", "Grupo 2", "Grupo 3"
7. Selecionar "Grupo 2" → salvar → verificar que o card da TV mostra "🖼 Slideshow"
8. Selecionar "Site" → campo URL aparece → selecionar Grupo → campo URL some

- [ ] **Step 7 — Commit**

```bash
git add server/panel/index.html
git commit -m "feat(panel): image group tabs, combined mode dropdown, effective_mode in TV cards, remove global config"
```

---

## Task 8: Aba "Mapeamento de TVs" no `admin.html`

**Files:**
- Modify: `server/panel/admin.html`

**Interfaces:**
- Consome: `GET /api/tvs`, `GET /api/tv-aliases`, `PUT /api/tv-aliases/:tvId`, `DELETE /api/tv-aliases/:tvId`

- [ ] **Step 1: Converter o container do admin em sistema de abas**

Substituir o `<div class="container ...>` e seu conteúdo interno (linhas 24-58) por:

```html
<div class="container py-4" style="max-width:900px">
  <ul class="nav nav-tabs mb-3" id="admin-tabs" role="tablist">
    <li class="nav-item">
      <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#pane-users">Usuários</button>
    </li>
    <li class="nav-item">
      <button class="nav-link" data-bs-toggle="tab" data-bs-target="#pane-aliases" onclick="loadAliases()">Mapeamento de TVs</button>
    </li>
  </ul>

  <div class="tab-content">

    <!-- Aba Usuários -->
    <div class="tab-pane fade show active" id="pane-users">
      <div class="card shadow-sm">
        <div class="card-header py-2 d-flex justify-content-between align-items-center">
          <h6 class="mb-0 fw-semibold">Usuários</h6>
          <button class="btn btn-sm btn-outline-secondary" onclick="loadUsers()">↻ Atualizar</button>
        </div>
        <div class="card-body">
          <div id="users-list" class="mb-3">
            <p class="text-muted small mb-0">Carregando...</p>
          </div>
          <hr class="my-3">
          <div class="row g-2 align-items-end">
            <div class="col-sm-3">
              <label class="form-label small fw-semibold mb-1">Usuário</label>
              <input class="form-control form-control-sm" id="new-username" type="text" placeholder="nome">
            </div>
            <div class="col-sm-3">
              <label class="form-label small fw-semibold mb-1">Senha</label>
              <input class="form-control form-control-sm" id="new-password" type="password" placeholder="senha">
            </div>
            <div class="col-sm-3">
              <label class="form-label small fw-semibold mb-1">Tipo</label>
              <select class="form-select form-select-sm" id="new-role">
                <option value="user">Usuário</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div class="col-sm-3">
              <button class="btn btn-sm btn-primary w-100" onclick="createUser()">Criar</button>
            </div>
          </div>
          <div id="users-msg" class="mt-2"></div>
        </div>
      </div>
    </div>

    <!-- Aba Mapeamento de TVs -->
    <div class="tab-pane fade" id="pane-aliases">
      <div class="card shadow-sm">
        <div class="card-header py-2 d-flex justify-content-between align-items-center">
          <h6 class="mb-0 fw-semibold">Mapeamento de TVs</h6>
          <button class="btn btn-sm btn-outline-secondary" onclick="loadAliases()">↻ Atualizar</button>
        </div>
        <div class="card-body">
          <p class="text-muted small mb-3">Defina um nome de exibição para cada TV. Sem alias, o nome original do dispositivo é usado.</p>
          <div id="aliases-list">
            <p class="text-muted small mb-0">Carregando...</p>
          </div>
          <div id="aliases-msg" class="mt-2"></div>
        </div>
      </div>
    </div>

  </div>
</div>
```

- [ ] **Step 2: Adicionar funções JS para aliases no final do `<script>` do `admin.html`**

```js
async function loadAliases() {
  const [tvs, aliases] = await Promise.all([
    api('/api/tvs') ?? [],
    api('/api/tv-aliases') ?? [],
  ]);

  const aliasMap = Object.fromEntries((aliases ?? []).map(a => [a.tv_id, a.display_name]));
  const el = document.getElementById('aliases-list');

  if (!tvs.length) {
    el.innerHTML = '<p class="text-muted small mb-0">Nenhuma TV registrada.</p>';
    return;
  }

  const sorted = [...tvs].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const table = document.createElement('table');
  table.className = 'table table-sm table-hover mb-0';
  table.innerHTML = `<thead><tr>
    <th class="small">ID da TV</th>
    <th class="small">Nome Original</th>
    <th class="small">Nome de Exibição</th>
    <th></th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');

  for (const tv of sorted) {
    const tr = document.createElement('tr');
    const currentAlias = aliasMap[tv.id] || '';

    tr.innerHTML = `
      <td class="small align-middle text-muted font-monospace">${esc(tv.id)}</td>
      <td class="small align-middle">${esc(tv.name)}</td>
      <td class="align-middle">
        <input class="form-control form-control-sm" id="alias-${esc(tv.id)}"
               type="text" value="${esc(currentAlias)}" placeholder="Nome de exibição...">
      </td>
      <td class="text-end align-middle" style="white-space:nowrap">
        <button class="btn btn-sm btn-primary py-0 px-2 me-1" onclick="saveAlias('${esc(tv.id)}')">Salvar</button>
        ${currentAlias
          ? `<button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="removeAlias('${esc(tv.id)}')">Remover</button>`
          : ''}
      </td>`;
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  el.innerHTML = '';
  el.appendChild(table);
}

async function saveAlias(tvId) {
  const display_name = document.getElementById(`alias-${tvId}`).value.trim();
  if (!display_name) {
    flashMsg('aliases-msg', 'warning', 'Digite um nome de exibição.');
    return;
  }
  const ok = await api(`/api/tv-aliases/${tvId}`, { method: 'PUT', json: { display_name } });
  if (ok) {
    flashMsg('aliases-msg', 'success', 'Alias salvo.');
    loadAliases();
  } else {
    flashMsg('aliases-msg', 'danger', 'Erro ao salvar alias.');
  }
}

async function removeAlias(tvId) {
  if (!confirm('Remover alias desta TV?')) return;
  const ok = await api(`/api/tv-aliases/${tvId}`, { method: 'DELETE' });
  if (ok) {
    flashMsg('aliases-msg', 'success', 'Alias removido.');
    loadAliases();
  } else {
    flashMsg('aliases-msg', 'danger', 'Erro ao remover alias.');
  }
}
```

- [ ] **Step 3: Verificar no browser**

1. Abrir `https://localhost:3002/admin`
2. Confirmar que existem duas abas: "Usuários" e "Mapeamento de TVs"
3. Aba "Usuários" deve funcionar igual a antes
4. Clicar em "Mapeamento de TVs" → deve listar todas as TVs registradas
5. Digitar um nome de exibição para uma TV → Salvar → confirmar mensagem de sucesso
6. Recarregar o painel principal (`/`) → o card da TV deve exibir o novo nome
7. Voltar ao admin → aba "Mapeamento de TVs" → botão "Remover" deve aparecer para TVs com alias → clicar Remover → confirmar

- [ ] **Step 4: Commit**

```bash
git add server/panel/admin.html
git commit -m "feat(admin): add TV name aliases tab with upsert and delete"
```

---

## Self-Review

**Cobertura do spec:**
- ✅ Seção 1 DB: Task 1
- ✅ Seção 2 API image-groups: Task 2
- ✅ Seção 2 API tv-aliases: Task 3
- ✅ Seção 2 images group_id: Task 4
- ✅ Seção 2 config image_group: Task 5
- ✅ Seção 2 buildConfig + effective_mode: Task 6
- ✅ Seção 5 UI index.html (remoções, cards, abas, modal): Task 7
- ✅ Seção 6 UI admin.html: Task 8
- ✅ Seção 7 comportamentos (grupo vazio → images:[], migração segura, global_config permanece): Tasks 1, 6

**Consistência de tipos:**
- `image_group` é sempre inteiro 1/2/3 — validado no config.js e images.js
- `effective_mode` é `'slideshow'` ou `'webview'` — produzido em tvs.js, consumido em index.html
- `tvAliasMap` é `Record<string, string>` — populado por `loadAliases()` antes de `loadTVs()`
- Select value `"slideshow_1"` → `openTV()` lê `cfg.image_group` → reconstrói; `saveTV()` decompõe

**Placeholders:** Nenhum. Todas as steps têm código completo.
