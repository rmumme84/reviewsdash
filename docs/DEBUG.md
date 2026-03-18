# acker-site — Debug & Validação Rápida (comandos)

> Objetivo: ter comandos copy/paste para checar scripts sem mexer em serviço.
>
> Segurança: **não** rode comandos que imprimam conteúdo de tokens/keys. Este guia usa apenas `test -n`/`test -s` (checa existência) e `jq`/`head` em saídas públicas.

## Geral
- Sintaxe (server):
  - `node -c /opt/acker-site/server.js`
- Sintaxe (bin):
  - `find /opt/acker-site/bin -maxdepth 1 -type f -name "*.js" -print0 | xargs -0 -n1 node -c`

## Serviço (systemd)
- Status:
  - `systemctl status acker-site --no-pager`
- Logs (últimas 200 linhas):
  - `journalctl -u acker-site -n 200 --no-pager`
- Healthcheck HTTP (porta padrão):
  - `curl -fsS http://127.0.0.1:8080/ >/dev/null && echo OK`

## Dados — latest (top20)
- Rodar coletor:
  - `/opt/acker-site/bin/update_latest.sh`
- Ver saída:
  - `ls -la /opt/acker-site/data/latest.json`
  - `jq -r '.auction.auctionId, .items|length' /opt/acker-site/data/latest.json 2>/dev/null || head -c 400 /opt/acker-site/data/latest.json`

## Calendário (news sidebar)
- Pré-check (ENV obrigatória — não imprime token):
  - `test -n "$BROWSERLESS_TOKEN" && echo "BROWSERLESS_TOKEN OK" || echo "FALTA BROWSERLESS_TOKEN"`
- Rodar:
  - `node /opt/acker-site/bin/update_calendar.js`
- Ver saída:
  - `ls -la /opt/acker-site/data/news/calendar.json`
  - `jq -r '.upcoming7|length, .publishedLast7|length' /opt/acker-site/data/news/calendar.json 2>/dev/null || head -c 400 /opt/acker-site/data/news/calendar.json`

## Reviews (Rede D'Or)
### Via Google Places API
- Pré-check (arquivo de key — não imprime conteúdo):
  - `test -s /opt/acker-site/data/reviews/google_api_key.txt && echo OK || echo "FALTA google_api_key.txt"`
- Rodar:
  - `node /opt/acker-site/bin/update_reviews.js`

### Sem API (browserless /function)
- Pré-check (arquivo de token — não imprime conteúdo):
  - `test -s /opt/acker-site/data/reviews/browserless_token.txt && echo OK || echo "FALTA browserless_token.txt"`
- Rodar:
  - `node /opt/acker-site/bin/update_reviews_noapi.js`

### Sem API (browserless CDP)
- Pré-check (arquivo de token — não imprime conteúdo):
  - `test -s /opt/acker-site/data/reviews/browserless_token.txt && echo OK || echo "FALTA browserless_token.txt"`
- Rodar:
  - `node /opt/acker-site/bin/update_reviews_noapi_cdp.js`

## Series (update_series)
- Pré-check (ENV — não imprime valores):
  - `test -n "$TRAKT_CLIENT_ID" && echo OK || echo "FALTA TRAKT_CLIENT_ID"`
  - `test -n "$TMDB_BEARER" -o -n "$TMDB_API_KEY" && echo OK || echo "FALTA TMDB_BEARER/TMDB_API_KEY"`
- Rodar:
  - `node /opt/acker-site/bin/update_series.js`
