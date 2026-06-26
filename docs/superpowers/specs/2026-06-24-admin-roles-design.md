# Design: Roles de Usuário e Tela de Admin — SyncScreen

**Data:** 2026-06-24  
**Status:** Aprovado

---

## Objetivo

Separar o acesso ao painel em dois tipos de usuário:

- **admin** — acessa o painel normal + tela de administração de usuários (`/admin`)
- **user** — acessa somente o painel normal (`/`)

---

## Banco de Dados

### Alteração na tabela `users`

```sql
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
```

Aplicada via `db.exec()` condicional no boot (usando `PRAGMA table_info` para checar se a coluna já existe).

> **Migração de dados:** após adicionar a coluna, rodar imediatamente:
> ```sql
> UPDATE users SET role = 'admin' WHERE username = ?
> ```
> com o valor de `ADMIN_USER` (env var), para garantir que o usuário admin já existente receba `role = 'admin'`. Sem isso, o admin perde acesso ao `/admin` após a migração.

### Funções afetadas em `db.js`

- `seedAdminUser()` — cria usuário inicial com `role = 'admin'`
- `createUser(username, passwordHash, role)` — recebe o role como parâmetro; default `'user'`
- `listUsers()` — passa a retornar o campo `role`

---

## Backend

### JWT

O payload do token passa a incluir `role`:

```json
{ "id": 1, "username": "admin", "role": "admin" }
```

### `auth.js` — novo middleware

```js
function requireAdmin(req, res, next) {
  // chama requireAuth internamente; se role !== 'admin', retorna 403
}
```

### Rotas afetadas em `server.js`

| Rota | Antes | Depois |
|---|---|---|
| `GET /admin` | não existia | nova, requer `requireAdmin` (redireciona para `/` se não for admin) |
| `/api/users/*` | `requireAuth` | `requireAdmin` |

### `GET /api/auth/me`

Passa a retornar `role` além de `id` e `username`:

```json
{ "id": 1, "username": "admin", "role": "admin" }
```

### `POST /api/users`

Aceita campo opcional `role` (`'admin'` ou `'user'`). Qualquer valor fora desses dois é rejeitado com 400. Default: `'user'`.

---

## Telas

### `panel/admin.html` — nova página

- Acesso restrito a admins (`/admin`)
- Navbar igual ao painel, com botão "← Painel" e botão "Sair"
- Seção única: lista de usuários com username, role, data de criação, botão remover
- Formulário de criação: username, senha, selector de role (admin / usuário)
- Sem dependências externas além do Bootstrap CDN já usado

### `panel/index.html` — alterações

- **Remove** a seção "Usuários do Painel" e todas as funções JS relacionadas (`loadUsers`, `createUser`, `removeUser`)
- **Navbar**: admin vê botão "⚙ Admin" que leva para `/admin`; usuário normal não vê esse botão
- Lógica de boot: `GET /api/auth/me` retorna `role`; se `role === 'admin'`, exibe o botão de admin

---

## Fluxo de acesso

```
GET /          → requireAuthPage  → index.html (qualquer usuário autenticado)
GET /admin     → requireAdmin     → admin.html (só admin; user normal → redirect /)
GET /login     → público          → login.html
GET /api/auth/me → requireAuth    → {id, username, role}
/api/users/*   → requireAdmin     → CRUD de usuários (só admin)
```

---

## O que NÃO muda

- Fluxo de login e logout
- Rotas públicas das TVs (`/api/tvs/register`, `/api/tvs/heartbeat`)
- WebSockets (`/ws`, `/signal`)
- Toda a funcionalidade do painel normal (TVs, config, imagens, screencast)
