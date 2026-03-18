# acker-site — Configuração (ENV + keys)

Este documento lista **nomes** de variáveis/arquivos esperados, **sem valores**.

## Variáveis de ambiente (principais)
### Servidor
- `PORT` — porta HTTP do `server.js` (default: 8080)

### acker (histórico/arquivos)
- `ACKER_ROOT` — raiz do projeto (default: `/opt/acker-site`)
- `ACKER_HISTORY_URL` — URL para buscar `history.json` (usado em jobs/feeds)
- `AUCTION_ID` — força um auction id específico para alguns scripts

### Browserless / Chrome DevTools
- `BROWSERLESS_URL` — endpoint do browserless
- `BROWSERLESS_TOKEN` — token de acesso do browserless (**obrigatório** para `bin/update_calendar.js`; **não versionar**)
- `CDP_PORT` — porta do Chrome DevTools (default comum: 9222)
- `CHROME` — caminho do binário do Chrome (default comum: `/usr/bin/google-chrome`)

### Séries/filmes (enriquecimento)
- `TRAKT_CLIENT_ID`
- `TMDB_BEARER`
- `TMDB_API_KEY`
- `SERIES_OUT` — caminho do JSON de saída
- `SERIES_ENRICH_TOP_SERIES`
- `SERIES_ENRICH_TOP_MOVIES`
- `SERIES_ENRICH_MAX`
- `SERIES_ENRICH_CONCURRENCY`

### Outros
- `DATA_DIR` — diretório de dados (ex.: news)
- `GEQL_UA`, `GEQL_CACHE_DIR`
- `VASCO_ROOT`
- `GE_URL`, `OUT_PATH`
- `RDOR_X_IN`, `RDOR_X_OUT`

## Arquivos em `/opt/acker-site/keys/`
- `known_hosts` — hosts conhecidos para SSH
- `winemanager_ed25519` — **chave privada** (permissões restritas)
- `winemanager_ed25519.pub` — chave pública

## Notas de segurança
- Tokens/chaves **devem vir do ambiente** ou de arquivos com permissões restritas.
- Exemplos (arquivo em `data/`, fora de git):
  - `/opt/acker-site/data/reviews/browserless_token.txt`
  - `/opt/acker-site/data/reviews/google_api_key.txt`
- Recomendado para tokens/keys em `data/`:
  - `chmod 600 /opt/acker-site/data/**/(*token*|*key*).txt` (ajuste o path conforme o arquivo)
  - garantir owner correto (ex.: `chown root:root <arquivo>` se aplicável)
- Se algum script tiver fallback hardcoded para token/segredo, tratar como dívida técnica e remover.
