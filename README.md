# SyncScreen

Sistema de gerenciamento remoto de TVs. Um servidor central controla o que cada TV exibe — slideshow de imagens ou uma URL via WebView — com configuração global ou individual por dispositivo.

## Como funciona

```
┌─────────────────────────────────────────────────┐
│                  Painel Admin                   │
│           (navegador → server/panel)            │
└────────────────────┬────────────────────────────┘
                     │ HTTP + WebSocket
                     ▼
┌─────────────────────────────────────────────────┐
│               server/ (Node.js)                 │
│  REST API · SQLite · WebSocket · uploads/       │
└──────────┬──────────────────────┬───────────────┘
           │ register / heartbeat │ register / heartbeat
           ▼                      ▼
┌──────────────────┐   ┌──────────────────────────┐
│   android/       │   │        tizen/            │
│  App Android     │   │   App Samsung Tizen TV   │
│  (Kotlin/Gradle) │   │      (HTML/JS/CSS)       │
└──────────────────┘   └──────────────────────────┘
```

**Fluxo:**
1. A TV liga → registra-se no servidor enviando ID e modelo
2. A cada ~15 segundos envia um heartbeat e recebe a config atual
3. O servidor responde com `mode` + lista de imagens ou URL
4. A TV exibe slideshow ou WebView conforme o modo recebido
5. O admin altera a config no painel → WebSocket notifica o painel em tempo real → TVs atualizam no próximo heartbeat

---

## Estrutura do repositório

```
SyncScreen/
├── android/    # App Android (Kotlin) — Chromecast, Firestick, etc.
├── tizen/      # App Tizen (HTML/JS) — Samsung Smart TVs
├── server/     # Backend Node.js + Painel admin + Docker
├── shared/     # Contratos de API, constantes compartilhadas
└── README.md
```

---

## server/

Backend Express (Node.js 22+) com SQLite nativo (`node:sqlite`). Roda em Docker.

### API REST

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/tvs/register` | TV registra-se e recebe config |
| `POST` | `/api/tvs/heartbeat` | TV reporta que está online e recebe config |
| `GET` | `/api/tvs` | Lista todas as TVs com status online/offline |
| `DELETE` | `/api/tvs/:id` | Remove uma TV |
| `GET` | `/api/config` | Lê config global |
| `PUT` | `/api/config` | Atualiza config global |
| `GET` | `/api/config/:tvId` | Lê config específica de uma TV |
| `PUT` | `/api/config/:tvId` | Define config específica para uma TV |
| `DELETE` | `/api/config/:tvId` | Remove config da TV (volta para a global) |
| `GET/POST/DELETE` | `/api/images` | Gerencia imagens do slideshow |

### WebSocket

`ws://<host>/ws` — o painel conecta aqui e recebe eventos em tempo real:
- `tv_updated` — TV fez register ou heartbeat
- `tv_removed` — TV removida
- `config_updated` — config alterada pelo admin

### Banco de dados (SQLite)

| Tabela | Conteúdo |
|--------|----------|
| `tvs` | TVs registradas (id, nome, last_seen, IP) |
| `global_config` | Config padrão aplicada a todas as TVs |
| `tv_config` | Config específica por TV (sobrescreve a global) |
| `images` | Imagens do slideshow (nome, ordem, ativo) |

### Subir com Docker

```bash
cd server
docker compose up -d
# Painel: http://localhost:3001
# API:    http://localhost:3001/api
```

### Rodar localmente

```bash
cd server
npm install
node server.js
```

Requer Node.js 22+ (usa `node:sqlite` nativo).

---

## android/

App Kotlin para dispositivos Android (TV, Chromecast, Firestick).

### Componentes

| Arquivo | Função |
|---------|--------|
| `MainActivity` | Registra a TV e roteia para o modo correto |
| `SlideshowActivity` | Exibe slideshow com imagens baixadas do servidor |
| `WebViewActivity` | Carrega URL configurada no painel |
| `ApiService` | Cliente HTTP (register, heartbeat, download de imagens) |
| `ConfigManager` | Persiste config localmente (fallback sem rede) |
| `BootReceiver` | Inicia o app automaticamente no boot do dispositivo |

### Configuração

Defina `SERVER_URL` em `app/build.gradle.kts`:

```kotlin
buildConfigField("String", "SERVER_URL", "\"http://192.168.1.100:3001\"")
```

### Build

```bash
cd android
./gradlew assembleDebug
```

---

## tizen/

App para Samsung Smart TVs (Tizen OS), escrito em HTML/JS/CSS puro.

### Componentes

| Arquivo | Função |
|---------|--------|
| `js/main.js` | Inicialização, heartbeat loop (15s), roteamento de modo |
| `js/api.js` | Chamadas ao servidor (register, heartbeat) |
| `js/cache.js` | Cache local de imagens |
| `js/config.js` | Persistência de config |
| `js/slideshow.js` | Exibição do slideshow |
| `js/webview.js` | Carregamento de URL |
| `config.xml` | Manifesto do app Tizen |

### ID do dispositivo

Usa `tizen.systeminfo` (serial number) ou `webapis.productinfo.getDuid()` como fallback, garantindo ID único por aparelho.

### Configurar e empacotar

Abra a pasta `tizen/` no Tizen Studio e faça o build via IDE. O arquivo gerado é o `.wgt` (não versionado).

---

## Modos de exibição

| Modo | Comportamento |
|------|--------------|
| `slideshow` | Exibe imagens em loop com intervalo configurável (padrão: 5s) |
| `webview` | Carrega uma URL configurada no painel |

A config pode ser global (aplica a todas as TVs) ou individual por TV. A config individual tem prioridade.
