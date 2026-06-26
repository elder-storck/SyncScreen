# Admin Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar usuários em dois tipos — `admin` (acessa painel + tela de administração `/admin`) e `user` (acessa só o painel) — com a tela de admin isolada em `panel/admin.html`.

**Architecture:** Coluna `role` na tabela `users` é incluída no JWT. Um novo middleware `requireAdmin` protege as rotas de gestão de usuários e a página `/admin`. O painel (`index.html`) exibe o botão "Admin" somente para admins; a tela de admin é standalone sem a seção de TVs/config/imagens.

**Tech Stack:** Node.js 22, Express 4, node:sqlite (nativo), bcryptjs, jsonwebtoken, cookie-parser, Bootstrap 5.3.8 CDN com SRI.

## Global Constraints

- Node nativo `node:sqlite` (não `better-sqlite3`) — API síncrona, `db.prepare(...).run/get/all`
- Cookies com `httpOnly: true`, `secure: true`, `sameSite: 'strict'`
- Bootstrap 5.3.2 via CDN — sem build step
- JWT payload: `{ id, username, role }` — expiração 8h
- Roles válidos: exatamente `'admin'` ou `'user'` (string lowercase)
- Username válido: `/^[A-Za-z0-9._-]{1,32}$/`
- Sem test framework — verificações via `curl` contra `http://localhost:3001`

---

### Task 1: Migração do banco — adicionar coluna `role`

**Files:**
- Modify: `server/db.js`

**Interfaces:**
- Produces:
  - `createUser(username, passwordHash, role = 'user')` — terceiro parâmetro obrigatório para o router
  - `listUsers()` — retorna `[{ id, username, role, created_at }]`
  - `seedAdminUser()` — cria com `role = 'admin'` e corrige usuário admin existente

- [ ] **Step 1: Adicionar migração da coluna `role` em `server/db.js`**

Após o bloco `db.exec(`` CREATE TABLE IF NOT EXISTS users ... ``)`, adicionar:

```js
// Migração: adiciona coluna role se ainda não existir
const cols = db.prepare(`PRAGMA table_info(users)`).all();
if (!cols.some(c => c.name === 'role')) {
  db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
  // Garante que o usuário admin configurado em env tenha role admin
  const adminUsername = process.env.ADMIN_USER || 'admin';
  db.prepare(`UPDATE users SET role = 'admin' WHERE username = ?`).run(adminUsername);
}
```

- [ ] **Step 2: Atualizar `createUser` para aceitar `role`**

Substituir:
```js
function createUser(username, passwordHash) {
  return db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
}
```
Por:
```js
function createUser(username, passwordHash, role = 'user') {
  return db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, passwordHash, role);
}
```

- [ ] **Step 3: Atualizar `listUsers` para retornar `role`**

Substituir:
```js
function listUsers() {
  return db.prepare('SELECT id, username, created_at FROM users ORDER BY id ASC').all();
}
```
Por:
```js
function listUsers() {
  return db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id ASC').all();
}
```

- [ ] **Step 4: Atualizar `seedAdminUser` para criar com `role = 'admin'`**

Substituir a linha de INSERT em `seedAdminUser`:
```js
db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
```
Por:
```js
db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, 'admin');
```

- [ ] **Step 5: Verificar sintaxe**

```bash
node --check server/db.js
```
Esperado: sem output (sem erros).

- [ ] **Step 6: Commit**

```bash
git add server/db.js
git commit -m "feat(db): add role column to users with admin migration"
```

---

### Task 2: Auth — incluir `role` no JWT e criar `requireAdmin`

**Files:**
- Modify: `server/auth.js`

**Interfaces:**
- Consumes: `req.user` populado pelo `requireAuth` existente com `{ id, username, role }`
- Produces:
  - `signToken({ id, username, role })` — inclui role no payload
  - `requireAdmin(req, res, next)` — 403 JSON para API, redirect `/` para páginas
  - `requireAdminPage(req, res, next)` — redireciona para `/` se não for admin

- [ ] **Step 1: Atualizar `signToken` — já recebe o objeto, nenhuma mudança na função em si**

`signToken` já faz `jwt.sign(payload, ...)` — o role será incluído automaticamente quando o caller passar `{ id, username, role }` no login. Confirmar que a assinatura está correta em `auth.js`:

```js
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}
```
Nenhuma mudança necessária aqui — o payload é passado pelo router de login.

- [ ] **Step 2: Adicionar `requireAdmin` e `requireAdminPage` em `server/auth.js`**

Após a função `requireAuthPage`, adicionar:

```js
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
```

- [ ] **Step 3: Exportar os novos middlewares**

Substituir a linha de exports:
```js
module.exports = { signToken, requireAuth, requireAuthPage };
```
Por:
```js
module.exports = { signToken, requireAuth, requireAuthPage, requireAdmin, requireAdminPage };
```

- [ ] **Step 4: Verificar sintaxe**

```bash
node --check server/auth.js
```
Esperado: sem output.

- [ ] **Step 5: Commit**

```bash
git add server/auth.js
git commit -m "feat(auth): add requireAdmin/requireAdminPage middlewares"
```

---

### Task 3: Rotas — role no login, /api/users com requireAdmin, /api/auth/me com role, rota /admin

**Files:**
- Modify: `server/routes/auth.js`
- Modify: `server/server.js`

**Interfaces:**
- Consumes:
  - `requireAdmin` de `server/auth.js`
  - `requireAdminPage` de `server/auth.js`
  - `createUser(username, hash, role)` de `server/db.js`
  - `listUsers()` retornando `role`
- Produces:
  - `POST /api/auth/login` — inclui `role` no token
  - `GET /api/auth/me` — retorna `{ id, username, role }`
  - `GET /api/users` — requer admin
  - `POST /api/users` — aceita `role` (`'admin'` | `'user'`), requer admin
  - `DELETE /api/users/:id` — requer admin
  - `GET /admin` — serve `admin.html`, requer admin

- [ ] **Step 1: Atualizar `POST /api/auth/login` para incluir `role` no token**

Em `server/routes/auth.js`, na linha do `signToken`, substituir:
```js
const token = signToken({ id: user.id, username: user.username });
```
Por:
```js
const token = signToken({ id: user.id, username: user.username, role: user.role });
```

- [ ] **Step 2: Atualizar `GET /api/auth/me` para retornar `role`**

Substituir:
```js
authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username });
});
```
Por:
```js
authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, role: req.user.role });
});
```

- [ ] **Step 3: Importar `requireAdmin` e atualizar `usersRouter`**

No topo de `server/routes/auth.js`, substituir:
```js
const { signToken, requireAuth } = require('../auth');
```
Por:
```js
const { signToken, requireAuth, requireAdmin } = require('../auth');
```

Substituir `usersRouter.use(requireAuth)` por `usersRouter.use(requireAdmin)`.

- [ ] **Step 4: Atualizar `POST /api/users` para aceitar e validar `role`**

Substituir o handler `usersRouter.post('/', ...)` inteiro:

```js
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
```

- [ ] **Step 5: Adicionar rota `GET /admin` em `server/server.js`**

Primeiro, atualizar o import de `auth.js` em `server/server.js`:
```js
const { requireAuth, requireAuthPage, requireAdmin, requireAdminPage } = require('./auth');
```

Depois, adicionar logo após a rota `GET /login`:
```js
app.get('/admin', requireAdminPage, (req, res) => {
  res.sendFile(path.join(panelDir, 'admin.html'));
});
```

- [ ] **Step 6: Verificar sintaxe dos dois arquivos**

```bash
node --check server/routes/auth.js && node --check server/server.js
```
Esperado: sem output.

- [ ] **Step 7: Verificação manual — reiniciar e testar as rotas**

```bash
# Rebuild e subir
docker compose down && docker compose build --no-cache && docker compose up -d
sleep 4

# Login admin → verificar que retorna role no /me
TOKEN=$(curl -sc /tmp/jar http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | grep -o 'ok.*true')
echo "Login: $TOKEN"

curl -sb /tmp/jar http://localhost:3001/api/auth/me
# Esperado: {"id":1,"username":"admin","role":"admin"}

# Criar usuário normal
curl -s -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{"username":"operador","password":"senha123","role":"user"}' \
  -b /tmp/jar
# Esperado: {"ok":true}

# role inválido → 400
curl -s -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{"username":"x","password":"y","role":"superuser"}' \
  -b /tmp/jar
# Esperado: {"error":"role inválido: use \"admin\" ou \"user\""}
```

- [ ] **Step 8: Commit**

```bash
git add server/routes/auth.js server/server.js
git commit -m "feat(routes): role in JWT, requireAdmin on users, GET /admin"
```

---

### Task 4: Criar `panel/admin.html`

**Files:**
- Create: `server/panel/admin.html`

**Interfaces:**
- Consumes: `GET /api/auth/me` → `{ id, username, role }`; `GET /api/users`; `POST /api/users`; `DELETE /api/users/:id`
- Produces: página standalone em `/admin` com gestão completa de usuários

- [ ] **Step 1: Criar `server/panel/admin.html`**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SyncScreen — Admin</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" integrity="sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB" crossorigin="anonymous">
  <style>
    body { background: #f0f2f5; }
  </style>
</head>
<body>

<nav class="navbar navbar-dark bg-dark px-4 py-2">
  <span class="navbar-brand fw-bold fs-5">📺 SyncScreen <span class="badge bg-secondary ms-1 fs-6">Admin</span></span>
  <div class="d-flex align-items-center gap-3">
    <span class="text-secondary small" id="nav-user"></span>
    <a href="/" class="btn btn-sm btn-outline-light">← Painel</a>
    <button class="btn btn-sm btn-outline-secondary" onclick="logout()">Sair</button>
  </div>
</nav>

<div class="container py-4" style="max-width:800px">
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

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js" integrity="sha384-FKyoEForCGlyvwx9Hj09JcYn3nv7wiPVlz7YYwJrWVcXK/BmnVDxM+D2scQbITxI" crossorigin="anonymous"></script>
<script>
document.addEventListener('DOMContentLoaded', async () => {
  const me = await api('/api/auth/me');
  if (!me) return;
  document.getElementById('nav-user').textContent = me.username;
  loadUsers();
});

async function loadUsers() {
  const users = await api('/api/users') ?? [];
  const el = document.getElementById('users-list');
  if (!users.length) {
    el.innerHTML = '<p class="text-muted small mb-0">Nenhum usuário cadastrado.</p>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'table table-sm table-hover mb-0';
  table.innerHTML = '<thead><tr><th class="small">Usuário</th><th class="small">Tipo</th><th class="small">Criado em</th><th></th></tr></thead>';
  const tbody = document.createElement('tbody');

  for (const u of users) {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.className = 'small align-middle';
    tdName.textContent = u.username;

    const tdRole = document.createElement('td');
    tdRole.className = 'small align-middle';
    const badge = document.createElement('span');
    badge.className = u.role === 'admin' ? 'badge bg-danger' : 'badge bg-secondary';
    badge.textContent = u.role === 'admin' ? 'Admin' : 'Usuário';
    tdRole.appendChild(badge);

    const tdDate = document.createElement('td');
    tdDate.className = 'small align-middle text-muted';
    tdDate.textContent = u.created_at;

    const tdAction = document.createElement('td');
    tdAction.className = 'text-end';
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-outline-danger py-0 px-2';
    btn.textContent = '✕';
    btn.onclick = () => removeUser(u.id, u.username);
    tdAction.appendChild(btn);

    tr.appendChild(tdName);
    tr.appendChild(tdRole);
    tr.appendChild(tdDate);
    tr.appendChild(tdAction);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  el.innerHTML = '';
  el.appendChild(table);
}

async function createUser() {
  const username = document.getElementById('new-username').value.trim();
  const password = document.getElementById('new-password').value;
  const role     = document.getElementById('new-role').value;
  if (!username || !password) {
    flashMsg('users-msg', 'warning', 'Preencha usuário e senha.');
    return;
  }
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role }),
  });
  if (res.status === 401) { location.href = '/login'; return; }
  if (res.status === 403) { location.href = '/'; return; }
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    document.getElementById('new-username').value = '';
    document.getElementById('new-password').value = '';
    flashMsg('users-msg', 'success', `Usuário "${esc(username)}" criado.`);
    loadUsers();
  } else {
    flashMsg('users-msg', 'danger', data.error || 'Erro ao criar usuário.');
  }
}

async function removeUser(id, username) {
  if (!confirm(`Remover usuário "${username}"?`)) return;
  const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
  if (res.status === 401) { location.href = '/login'; return; }
  if (res.status === 403) { location.href = '/'; return; }
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    flashMsg('users-msg', 'success', `Usuário "${esc(username)}" removido.`);
    loadUsers();
  } else {
    flashMsg('users-msg', 'danger', data.error || 'Erro ao remover.');
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/login';
}

async function api(url, opts = {}) {
  try {
    const options = { method: opts.method || 'GET', headers: {} };
    if (opts.json) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(opts.json);
    }
    const res = await fetch(url, options);
    if (res.status === 401) { location.href = '/login'; return null; }
    if (res.status === 403) { location.href = '/'; return null; }
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function flashMsg(elId, type, msg) {
  const el = document.getElementById(elId);
  el.innerHTML = `<div class="alert alert-${type} py-1 small">${msg}</div>`;
  setTimeout(() => el.innerHTML = '', 4000);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}
</script>

</body>
</html>
```

- [ ] **Step 2: Verificar que o arquivo foi criado**

```bash
ls server/panel/
```
Esperado: `admin.html  index.html  login.html`

- [ ] **Step 3: Commit**

```bash
git add server/panel/admin.html
git commit -m "feat(panel): add admin.html for user management"
```

---

### Task 5: Atualizar `panel/index.html` — remover seção usuários, adicionar botão Admin

**Files:**
- Modify: `server/panel/index.html`

**Interfaces:**
- Consumes: `GET /api/auth/me` retornando `{ id, username, role }` (definido na Task 3)

- [ ] **Step 1: Remover o card "Usuários do Painel" de `panel/index.html`**

Localizar e remover o bloco inteiro (do comentário ao `</div>` de fechamento do card):

```html
  <!-- Usuários -->
  <div class="card shadow-sm mb-4">
    ...
  </div>
```

- [ ] **Step 2: Adicionar botão "Admin" no navbar — visível somente para admins**

Substituir o navbar atual:
```html
<nav class="navbar navbar-dark bg-dark px-4 py-2">
  <span class="navbar-brand fw-bold fs-5">📺 SyncScreen</span>
  <div class="d-flex align-items-center gap-3">
    <span class="text-secondary small" id="refresh-time"></span>
    <span class="text-secondary small" id="nav-user"></span>
    <button class="btn btn-sm btn-outline-secondary" onclick="logout()">Sair</button>
  </div>
</nav>
```
Por:
```html
<nav class="navbar navbar-dark bg-dark px-4 py-2">
  <span class="navbar-brand fw-bold fs-5">📺 SyncScreen</span>
  <div class="d-flex align-items-center gap-3">
    <span class="text-secondary small" id="refresh-time"></span>
    <span class="text-secondary small" id="nav-user"></span>
    <a id="btn-admin" href="/admin" class="btn btn-sm btn-outline-warning" hidden>⚙ Admin</a>
    <button class="btn btn-sm btn-outline-secondary" onclick="logout()">Sair</button>
  </div>
</nav>
```

- [ ] **Step 3: Atualizar o boot do DOMContentLoaded para mostrar botão Admin se role === 'admin'**

Substituir:
```js
document.addEventListener('DOMContentLoaded', async () => {
  // Verificar sessão antes de qualquer coisa
  const me = await api('/api/auth/me');
  if (!me) return; // api() já redireciona para /login em caso de 401

  document.getElementById('nav-user').textContent = me.username;

  tvModal = new bootstrap.Modal(document.getElementById('tvModal'));
  loadAll();
  connectWS();
  setInterval(loadTVs, 10_000);
});
```
Por:
```js
document.addEventListener('DOMContentLoaded', async () => {
  const me = await api('/api/auth/me');
  if (!me) return;

  document.getElementById('nav-user').textContent = me.username;
  if (me.role === 'admin') {
    document.getElementById('btn-admin').hidden = false;
  }

  tvModal = new bootstrap.Modal(document.getElementById('tvModal'));
  loadAll();
  connectWS();
  setInterval(loadTVs, 10_000);
});
```

- [ ] **Step 4: Atualizar Bootstrap para 5.3.8 com SRI em `index.html` e `login.html`**

Em `server/panel/index.html`, substituir:
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">
```
Por:
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" integrity="sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB" crossorigin="anonymous">
```

E substituir:
```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
```
Por:
```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js" integrity="sha384-FKyoEForCGlyvwx9Hj09JcYn3nv7wiPVlz7YYwJrWVcXK/BmnVDxM+D2scQbITxI" crossorigin="anonymous"></script>
```

Repetir as mesmas substituições em `server/panel/login.html`.

- [ ] **Step 5: Remover funções JS de usuários de `panel/index.html`**

Remover as funções `loadUsers`, `createUser` e `removeUser` e o call `loadUsers()` dentro de `loadAll()`.

Substituir:
```js
function loadAll() {
  loadTVs();
  loadGlobal();
  loadImages();
  loadUsers();
}
```
Por:
```js
function loadAll() {
  loadTVs();
  loadGlobal();
  loadImages();
}
```

- [ ] **Step 6: Verificação manual completa — rebuild e testar**

```bash
docker compose down && docker compose build --no-cache && docker compose up -d
sleep 5

# Login admin → /me deve retornar role admin
curl -sc /tmp/jar http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' -o /dev/null
curl -sb /tmp/jar http://localhost:3001/api/auth/me
# Esperado: {"id":1,"username":"admin","role":"admin"}

# GET /admin com cookie admin → 200
curl -sI -b /tmp/jar http://localhost:3001/admin | head -2
# Esperado: HTTP/1.1 200 OK

# Criar usuário normal
curl -s -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{"username":"operador","password":"senha123","role":"user"}' \
  -b /tmp/jar
# Esperado: {"ok":true}

# Login como operador
curl -sc /tmp/jar2 http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"operador","password":"senha123"}' -o /dev/null
curl -sb /tmp/jar2 http://localhost:3001/api/auth/me
# Esperado: {"id":2,"username":"operador","role":"user"}

# GET /admin com cookie de usuário normal → redirect para /
curl -sI -b /tmp/jar2 http://localhost:3001/admin | head -3
# Esperado: HTTP/1.1 302 Found + Location: /

# /api/users com usuário normal → 403
curl -s http://localhost:3001/api/users -b /tmp/jar2
# Esperado: {"error":"acesso restrito a administradores"}
```

- [ ] **Step 7: Commit**

```bash
git add server/panel/index.html server/panel/login.html
git commit -m "feat(panel): remove users section, add conditional admin button, update Bootstrap to 5.3.8 with SRI"
```

---

## Self-Review

**Spec coverage:**
- ✅ Coluna `role` na tabela com migração e correção do admin existente (Task 1)
- ✅ `createUser` aceita role (Task 1), `listUsers` retorna role (Task 1)
- ✅ `seedAdminUser` cria com role admin (Task 1)
- ✅ JWT inclui role (Task 3, Step 1)
- ✅ `requireAdmin` e `requireAdminPage` criados (Task 2)
- ✅ `GET /api/auth/me` retorna role (Task 3, Step 2)
- ✅ `/api/users/*` protegido por `requireAdmin` (Task 3, Step 3)
- ✅ `POST /api/users` aceita e valida campo `role` (Task 3, Step 4)
- ✅ `GET /admin` com `requireAdminPage` (Task 3, Step 5)
- ✅ `panel/admin.html` standalone com lista + criar com selector de role + remover (Task 4)
- ✅ `panel/index.html`: seção usuários removida, botão Admin condicional (Task 5)
- ✅ Usuário normal não vê botão Admin, não acessa `/admin`, não acessa `/api/users`

**Placeholder scan:** Nenhum TBD ou TODO encontrado. Todos os steps têm código completo.

**Type consistency:**
- `createUser(username, passwordHash, role)` — definido Task 1, usado em Task 3 Step 4 ✅
- `listUsers()` retorna `role` — definido Task 1, consumido em admin.html Task 4 ✅
- `requireAdmin` — exportado Task 2, importado Task 3 ✅
- `requireAdminPage` — exportado Task 2, usado em server.js Task 3 Step 5 ✅
- JWT payload `{ id, username, role }` — Task 3 Step 1 → verificado em requireAdmin Task 2 ✅
