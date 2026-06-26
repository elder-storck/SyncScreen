# Design: Grupos de Imagens, Aliases de TV e Limpeza do Painel

**Data:** 2026-06-26  
**Projeto:** APP-TV / SyncScreen Panel

---

## Resumo

Quatro mudanças no painel web (`server/panel/index.html`) e no backend (`server/`):

1. Remover a seção "Configuração Global" da página principal
2. Exibir o modo de operação atual nos cards de TV
3. Organizar imagens do slideshow em 3 grupos com nomes personalizáveis
4. Adicionar aba no admin para gerenciar o mapeamento de nome de TV

---

## 1. Banco de Dados

### Nova tabela `image_groups`

```sql
CREATE TABLE IF NOT EXISTS image_groups (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO image_groups (id, name) VALUES (1, 'Grupo 1'), (2, 'Grupo 2'), (3, 'Grupo 3');
```

Exatamente 3 linhas, ids fixos 1/2/3. O nome é editável pelo usuário.

### Migração em `images`

```sql
ALTER TABLE images ADD COLUMN group_id INTEGER NOT NULL DEFAULT 1;
```

Todas as imagens existentes caem no grupo 1.

### Migração em `tv_config`

```sql
ALTER TABLE tv_config ADD COLUMN image_group INTEGER NOT NULL DEFAULT 1;
```

### Nova tabela `tv_aliases`

```sql
CREATE TABLE IF NOT EXISTS tv_aliases (
  tv_id        TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT ''
);
```

Substitui o `TV_NAME_MAP` hardcoded no frontend. O alias tem precedência sobre `tv.name`; se não existir, usa `tv.name`.

---

## 2. API

### Grupos de imagens

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/image-groups` | Lista os 3 grupos `{ id, name }` |
| `PUT` | `/api/image-groups/:id` | Atualiza o nome do grupo (body: `{ name }`) |

### Imagens — mudanças

- `POST /api/images` — aceita campo `group_id` no multipart form (default 1 se omitido)
- `GET /api/images` — retorna `group_id` em cada objeto de imagem

### Config por TV — mudanças

- `PUT /api/config/:tvId` — aceita `image_group` (1/2/3) no body
- `GET /api/config/:tvId` — retorna `image_group`

### `buildConfig()` em `routes/tvs.js`

Quando `mode === 'slideshow'`, filtra imagens pelo `image_group` da TV:
```js
const images = db.prepare(`
  SELECT id, filename, order_index FROM images
  WHERE active = 1 AND group_id = ?
  ORDER BY order_index ASC, id ASC
`).all(imageGroup);
```
Se o resultado for vazio, envia `images: []` — a TV exibe tela em branco/placeholder.

### `GET /api/tvs` — mudança

Passa a incluir `effective_mode` em cada TV:
- Join com `tv_config` para obter o modo configurado
- Fallback para `global_config.mode` se TV não tiver config própria
- Valor possível: `'slideshow'` ou `'webview'`

### TV aliases

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/tv-aliases` | Lista todos os aliases `{ tv_id, display_name }` |
| `PUT` | `/api/tv-aliases/:tvId` | Upsert: cria ou atualiza alias (body: `{ display_name }`) |
| `DELETE` | `/api/tv-aliases/:tvId` | Remove alias (TV volta a usar `tv.name`) |

---

## 3. Arquivo `db.js`

- Criar tabela `image_groups` com seed de 3 grupos
- Criar tabela `tv_aliases`
- Rodar migrações `ALTER TABLE` para `images.group_id` e `tv_config.image_group` (verificar se coluna já existe antes via `PRAGMA table_info`)

---

## 4. Novos arquivos de rota

- `server/routes/image-groups.js` — rotas CRUD dos grupos
- `server/routes/tv-aliases.js` — rotas CRUD dos aliases

Registrados em `server/server.js`:
```js
app.use('/api/image-groups', require('./routes/image-groups'));
app.use('/api/tv-aliases',   require('./routes/tv-aliases'));
```

---

## 5. UI — Página Principal (`index.html`)

### Remoções

- Card "Configuração Global" (HTML + funções `loadGlobal`, `saveGlobal`, `toggleUrlRow`)
- Chamada `loadGlobal()` de `loadAll()`
- Referências a `globalCfg` (variável e todos os usos)
- Botão "Usar config. global" do modal de TV
- Texto "Campos em branco usam a configuração global."
- `TV_NAME_MAP` hardcoded

### Cards de TV

Linha de info secundária passa de:
```
IP · tempo atrás
```
para:
```
IP · tempo atrás · 🖼 Slideshow   (ou   🌐 Site)
```
O `effective_mode` vem do campo adicionado ao `/api/tvs`.

`displayName()` passa a consultar um Map carregado da API `/api/tv-aliases` em vez do objeto hardcoded.

### Seção "Imagens do Slideshow"

Vira um painel com 3 abas Bootstrap (`nav-tabs`). Cada aba:
- Header: nome do grupo com botão de edição inline (clica, vira input, salva no blur/Enter via `PUT /api/image-groups/:id`)
- Dropzone de upload (envia `group_id` junto)
- Grid de imagens filtrado pelo grupo

Ao carregar a página, `loadImages()` busca os grupos e as imagens juntos, organiza por `group_id`.

### Modal de config da TV

O select de modo tem as opções combinadas:

```
🌐 Site (WebView)      → mode=webview,    image_group ignorado
🖼 [nome grupo 1]      → mode=slideshow,  image_group=1
🖼 [nome grupo 2]      → mode=slideshow,  image_group=2
🖼 [nome grupo 3]      → mode=slideshow,  image_group=3
```

- Campo URL aparece apenas quando "Site" está selecionado
- Nenhum campo extra de grupo — tudo num único select
- `openTV()` carrega a config da TV e reconstrói o valor composto para o select
- `saveTV()` decompõe o valor do select em `mode` + `image_group` antes de enviar

---

## 6. UI — Página Admin (`admin.html`)

Nova aba **"Mapeamento de TVs"** no sistema de abas existente.

Conteúdo:
- Tabela listando todas as TVs registradas (carrega `/api/tvs` + `/api/tv-aliases`)
- Colunas: ID da TV | Nome Original | Nome de Exibição | Ações
- Input editável na coluna "Nome de Exibição"
- Botão "Salvar" por linha → `PUT /api/tv-aliases/:tvId`
- Botão "Remover" aparece só quando há alias → `DELETE /api/tv-aliases/:tvId`

---

## 7. Comportamentos importantes

- **Grupo vazio:** TV em modo slideshow com grupo sem imagens recebe `images: []` e exibe tela em branco.
- **Config sem `image_group`:** padrão é grupo 1.
- **Alias ausente:** `displayName(tv)` usa `tv.name` (sem quebrar).
- **Migração segura:** todas as `ALTER TABLE` verificam se a coluna já existe antes de rodar.
- **`global_config` permanece no backend:** a tabela e o seed (mode=slideshow, slide_interval=5) continuam existindo como fallback silencioso para TVs sem config própria. Apenas a UI de edição é removida — o backend `buildConfig()` não muda nessa lógica.
