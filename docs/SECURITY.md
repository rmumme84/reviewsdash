# acker-site — Notas de Segurança (hardcoded secrets)

Objetivo: identificar e eliminar segredos hardcoded (tokens/chaves) no código.

## Status atual
- ✅ Removido token hardcoded do browserless em `bin/update_calendar.js` (agora exige `BROWSERLESS_TOKEN` via ENV).
- ✅ Scripts de reviews sem API agora falham de forma clara se faltar `/opt/acker-site/data/reviews/browserless_token.txt`.
- ✅ Docs atualizadas: `RUNBOOK.md`, `CONFIG.md`, `DEBUG.md`.

## Varredura (grep) — achados relevantes
> Observação: abaixo é apenas *referência de arquivos/linhas* (sem valores).

- Browserless token via **arquivo local** (ok, desde que chmod 600 e fora de git):
  - `bin/update_reviews_noapi.js` / `bin/update_reviews_noapi_cdp.js` / `bin/update_reviews_noapi_cdp_debug.js`
    - lê de: `/opt/acker-site/data/reviews/browserless_token.txt`

- Google API key via **arquivo local** (ok, desde que chmod 600 e fora de git):
  - `bin/update_reviews.js`
    - lê de: `/opt/acker-site/data/reviews/google_api_key.txt`

- Serper API key via **ENV** (ok):
  - `bin/serper_rede_dor_x_search.py` usa `SERPER_API_KEY`

- TMDB/Trakt via **ENV/arquivo keys** (ok):
  - `bin/update_series.js` usa `TRAKT_CLIENT_ID`, `TMDB_BEARER`, `TMDB_API_KEY`

## Recomendações
- Garantir que diretórios/arquivos de chaves em `data/` tenham permissões restritas (ex.: `chmod 600` para tokens).
- Adicionar na documentação (RUNBOOK/CONFIG) quais scripts usam ENV vs arquivo.
- Opcional: adicionar checagens explícitas (falhar com mensagem clara) quando o token/key não existir.

## Como validar a varredura
- Keywords gerais:
  - `grep -RInE "(api[_-]?key|token|bearer|authorization|secret|passwd|password)\\b" /opt/acker-site --exclude-dir=data --exclude-dir=logs --exclude-dir=public --exclude-dir=keys | head`
- Padrões comuns de vazamento:
  - `grep -RInE "(AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z\-_]{35}|ghp_[0-9A-Za-z]{30,}|BEGIN PRIVATE KEY)" /opt/acker-site --exclude-dir=data --exclude-dir=logs --exclude-dir=public --exclude-dir=keys`
