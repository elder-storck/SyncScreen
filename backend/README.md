# SyncScreen — Backend

## Pré-requisitos
- Node.js 18+

## Instalação

```bash
cd backend
npm install
```

## Execução

```bash
# Produção
npm start

# Desenvolvimento (reinicia automaticamente)
npm run dev
```

O servidor sobe em `http://localhost:3000`.  
Painel administrativo: `http://localhost:3000`

## Configuração da rede

Para que as TVs Android encontrem o servidor:

1. Descubra o IP local da máquina onde o servidor roda  
   (ex: `ipconfig` no Windows → IPv4, e.g. `192.168.1.100`)

2. Abra `app/build.gradle.kts` e altere:
   ```kotlin
   buildConfigField("String", "SERVER_URL", "\"http://192.168.1.100:3000\"")
   ```

3. Recompile e reinstale o APK nas TVs.

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/tvs/register` | Registro inicial da TV |
| POST | `/api/tvs/heartbeat` | Heartbeat + recebe config |
| GET  | `/api/tvs` | Lista todas as TVs |
| DELETE | `/api/tvs/:id` | Remove TV |
| GET  | `/api/config` | Config global |
| PUT  | `/api/config` | Atualiza config global |
| GET  | `/api/config/:tvId` | Config específica da TV |
| PUT  | `/api/config/:tvId` | Define config para TV |
| DELETE | `/api/config/:tvId` | Resetar TV para config global |
| GET  | `/api/images` | Lista imagens ativas |
| POST | `/api/images` | Upload de imagem (multipart `image`) |
| PUT  | `/api/images/reorder` | Reordena imagens |
| DELETE | `/api/images/:id` | Remove imagem |

## Estrutura de dados

```
data/syncscreen.db    — banco SQLite
uploads/              — imagens enviadas pelo painel
```
