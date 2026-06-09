# Docker SyncScreen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dockerizar o backend SyncScreen (API + painel estático) com docker-compose, mapeando volumes para SQLite e uploads de imagens.

**Architecture:** Container único `node:22-alpine` servindo API REST, WebSocket e painel estático na porta 3000. O `docker-compose.yml` fica na raiz `APP-TV/` com contexto de build abrangendo `backend/` e `panel/`. Dois bind mounts preservam dados entre restarts: `backend/data/` (SQLite) e `backend/uploads/` (imagens).

**Tech Stack:** Node.js 22 (alpine), Docker Compose v2, bind mounts

---

## Arquivos

| Ação | Arquivo |
|---|---|
| Criar | `APP-TV/backend/.dockerignore` |
| Criar | `APP-TV/backend/Dockerfile` |
| Criar | `APP-TV/docker-compose.yml` |

---

### Task 1: Criar `.dockerignore`

**Files:**
- Create: `backend/.dockerignore`

- [ ] **Step 1: Criar o arquivo**

Criar `C:\Users\Elder\Documents\APP-TV\backend\.dockerignore` com o conteúdo:

```
node_modules
data
uploads
*.db
*.db-shm
*.db-wal
.git
npm-debug.log
```

Isso impede que `node_modules` do Windows (incompatível com Linux), o banco SQLite e as imagens sejam copiados para dentro da imagem — esses caminhos serão montados como volumes em runtime.

- [ ] **Step 2: Verificar arquivo criado**

```powershell
Get-Content "C:\Users\Elder\Documents\APP-TV\backend\.dockerignore"
```

Esperado: as 8 linhas do arquivo listadas acima.

- [ ] **Step 3: Commit**

```powershell
cd "C:\Users\Elder\Documents\APP-TV"
git add backend/.dockerignore
git commit -m "chore: add .dockerignore for Docker build"
```

---

### Task 2: Criar `Dockerfile`

**Files:**
- Create: `backend/Dockerfile`

**Contexto:** O `server.js` serve o painel com `path.join(__dirname, '../panel')`. Com `WORKDIR /app`, isso resolve para `/panel`. Por isso o Dockerfile copia `panel/` para `/panel` dentro do container. O contexto de build é `APP-TV/` (definido no docker-compose), então os paths no COPY são relativos à raiz `APP-TV/`.

- [ ] **Step 1: Criar o arquivo**

Criar `C:\Users\Elder\Documents\APP-TV\backend\Dockerfile` com o conteúdo:

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ .

COPY panel/ /panel/

EXPOSE 3000

CMD ["node", "server.js"]
```

- [ ] **Step 2: Verificar arquivo criado**

```powershell
Get-Content "C:\Users\Elder\Documents\APP-TV\backend\Dockerfile"
```

Esperado: as linhas do Dockerfile listadas acima.

- [ ] **Step 3: Commit**

```powershell
cd "C:\Users\Elder\Documents\APP-TV"
git add backend/Dockerfile
git commit -m "chore: add Dockerfile for SyncScreen backend"
```

---

### Task 3: Criar `docker-compose.yml`

**Files:**
- Create: `APP-TV/docker-compose.yml`

- [ ] **Step 1: Criar o arquivo**

Criar `C:\Users\Elder\Documents\APP-TV\docker-compose.yml` com o conteúdo:

```yaml
services:
  syncscreen:
    build:
      context: .
      dockerfile: backend/Dockerfile
    ports:
      - "3000:3000"
    volumes:
      - ./backend/data:/app/data
      - ./backend/uploads:/app/uploads
    restart: unless-stopped
```

- `context: .` — contexto é a pasta `APP-TV/`, dando acesso a `backend/` e `panel/` durante o build
- `./backend/data:/app/data` — banco SQLite persiste no host em `backend/data/`
- `./backend/uploads:/app/uploads` — imagens persistem no host em `backend/uploads/`
- `restart: unless-stopped` — container reinicia automaticamente em caso de crash ou reboot do Docker

- [ ] **Step 2: Verificar arquivo criado**

```powershell
Get-Content "C:\Users\Elder\Documents\APP-TV\docker-compose.yml"
```

Esperado: as linhas do docker-compose listadas acima.

- [ ] **Step 3: Commit**

```powershell
cd "C:\Users\Elder\Documents\APP-TV"
git add docker-compose.yml
git commit -m "chore: add docker-compose for SyncScreen"
```

---

### Task 4: Build e teste

**Files:** nenhum arquivo novo — apenas verificação

- [ ] **Step 1: Fazer o build da imagem**

```powershell
cd "C:\Users\Elder\Documents\APP-TV"
docker compose build
```

Esperado: build completo sem erros. A linha final deve ser algo como:
```
=> => naming to docker.io/library/app-tv-syncscreen
```

Se aparecer erro de `node:sqlite` ou `DatabaseSync`, verificar que a imagem base é `node:22-alpine` (não uma versão anterior).

- [ ] **Step 2: Subir o container**

```powershell
docker compose up
```

Esperado nos logs:
```
SyncScreen backend rodando em http://localhost:3000
Painel:    http://localhost:3000
API:       http://localhost:3000/api
```

- [ ] **Step 3: Verificar painel no browser**

Abrir `http://localhost:3000` no browser.

Esperado: painel administrativo carrega normalmente.

- [ ] **Step 4: Verificar API**

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/tvs"
```

Esperado: resposta JSON (array vazio `[]` ou lista de TVs cadastradas).

- [ ] **Step 5: Verificar persistência dos volumes**

```powershell
Get-ChildItem "C:\Users\Elder\Documents\APP-TV\backend\data"
```

Esperado: arquivo `syncscreen.db` presente (criado pelo container ao subir).

- [ ] **Step 6: Parar o container**

```powershell
docker compose down
```

- [ ] **Step 7: Commit final**

```powershell
cd "C:\Users\Elder\Documents\APP-TV"
git add .
git commit -m "chore: Docker setup verified and working"
```
