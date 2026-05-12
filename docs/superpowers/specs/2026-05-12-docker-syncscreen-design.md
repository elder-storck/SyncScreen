# Docker — SyncScreen Backend

**Data:** 2026-05-12
**Escopo:** Dockerizar o servidor SyncScreen (backend + painel) com docker-compose, volumes para dados persistentes (SQLite e uploads de imagens).

---

## Arquitetura

Um único container Docker baseado em `node:22-alpine` que serve:
- API REST (`/api/tvs`, `/api/config`, `/api/images`)
- WebSocket (`/ws`)
- Painel administrativo estático (`/`)
- Arquivos de imagem estáticos (`/uploads`)

O `docker-compose.yml` fica na raiz `APP-TV/`, gerenciando build, porta e volumes.

---

## Estrutura de Arquivos

```
APP-TV/
├── docker-compose.yml        ← criado
├── backend/
│   ├── Dockerfile            ← criado
│   ├── .dockerignore         ← criado
│   ├── server.js
│   ├── db.js
│   ├── routes/
│   ├── data/                 ← mapeado como volume
│   └── uploads/              ← mapeado como volume
└── panel/                    ← copiado para /panel no container
```

---

## Dockerfile (`backend/Dockerfile`)

- Base: `node:22-alpine` (necessário para `node:sqlite` nativo do Node 22+)
- `WORKDIR /app`
- Copia `package.json` e `package-lock.json`, roda `npm ci --omit=dev`
- Copia restante do `backend/` para `/app`
- Copia `panel/` para `/panel` (o `server.js` serve com `path.join(__dirname, '../panel')` → `/panel`)
- `EXPOSE 3000`
- `CMD ["node", "server.js"]`

---

## .dockerignore (`backend/.dockerignore`)

Exclui do contexto de build:
- `node_modules/`
- `data/`
- `uploads/`
- `*.db`, `*.db-shm`, `*.db-wal`

Os volumes `data/` e `uploads/` são montados em runtime, não copiados.

---

## docker-compose.yml (raiz `APP-TV/`)

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

- `context: .` — contexto é `APP-TV/` para ter acesso a `backend/` e `panel/`
- Volumes mapeiam pastas locais existentes diretamente (sem volumes nomeados), preservando dados já existentes

---

## Volumes

| Caminho local | Dentro do container | Conteúdo |
|---|---|---|
| `./backend/data` | `/app/data` | `syncscreen.db` (SQLite) |
| `./backend/uploads` | `/app/uploads` | Imagens enviadas pelo admin |

Os dados já existentes nessas pastas ficam imediatamente acessíveis após `docker compose up`.

---

## Porta

`3000:3000` — acesso via `http://localhost:3000`

---

## Comandos de uso

```bash
# Primeira vez ou após mudança de código:
docker compose up --build

# Subir sem rebuild:
docker compose up

# Parar:
docker compose down
```

---

## Restrições e decisões

- Node 22+ obrigatório: `node:sqlite` é API nativa do Node 22, sem dependências externas de compilação
- Panel copiado no build: garante que o painel estático está sempre sincronizado com a versão do código no container
- Volumes locais (bind mounts) em vez de volumes nomeados: permite acessar/editar os dados diretamente no Windows Explorer
