# acker-site — Runbook de Operação

## Índice
- [Visão geral](#visão-geral)
- [Cockpit OpenClaw (vigente)](#cockpit-openclaw-vigente)
- [Coding agents (vigente)](#coding-agents-vigente)
- [Cron crítico (vasco_geql)](#cron-crítico-vasco_geql)
- [Healthcheck (simples)](#healthcheck-simples)
- [Iniciar / Parar / Reiniciar](#iniciar--parar--reiniciar)
- [Logs](#logs)
- [Rotina de atualização de dados (latest)](#rotina-de-atualização-de-dados-latest)
- [Config (ENV/tokens/keys)](#config-envtokenskeys)
- [Debug (comandos copy/paste)](#debug-comandos-copypaste)
- [Troubleshooting](#troubleshooting)
- [Validação rápida pós-mudança](#validação-rápida-pós-mudança)

## Visão geral
- App Node: `/opt/acker-site/server.js`
- Porta padrão: `8080` (ou `PORT` via variável de ambiente)
- Há um serviço systemd chamado `acker-site` (há script de restart em `/opt/acker-site/bin/restart_acker_site.sh`).

## Cockpit OpenClaw (vigente)
- Rota principal de operação: `/cockpit/`.
- Legado preservado:
  - `/ai-dashboard/` (landing com CTA para cockpit)
  - `/ai-dashboard/legacy/` (dashboard antigo)
- APIs legadas mantidas por compatibilidade:
  - `/api/ai-usage/*`
  - `/api/runs/*`

## Coding agents (vigente)
- Codex CLI: agente local no workspace atual.
- Claude Code: `/usr/bin/claude` no VPS (via SSH).
- Gemini CLI: `/usr/bin/gemini` no VPS (via SSH, alternativo).

## Cron crítico (vasco_geql)
- Arquivo: `/etc/cron.d/acker-vasco-geql`
- Fuso: `CRON_TZ=America/Sao_Paulo`
- Agenda vigente: `0 6-21 * * *` (06:00–21:59 BRT)
- Comando: `update_vasco_ge.js` com wrapper `scripts/run_with_runs.sh`.

## Healthcheck (simples)
- Ver se a porta responde:
  - `curl -fsS http://127.0.0.1:8080/ >/dev/null && echo OK`
  - Se usar outra porta, ajuste para `$PORT`.

## Iniciar / Parar / Reiniciar
### Via systemd (recomendado)
- Status:
  - `systemctl status acker-site --no-pager`
- Reiniciar:
  - `systemctl restart acker-site`
- Parar:
  - `systemctl stop acker-site`
- Ver se está ativo:
  - `systemctl is-active acker-site`

> Observação: o script `/opt/acker-site/bin/restart_acker_site.sh` faz `systemctl restart acker-site` e grava em `/opt/acker-site/data/restart.log`.

### Execução manual (para debug rápido)
- `cd /opt/acker-site && PORT=8080 node server.js`

## Logs
- Logs do restart (quando usar o script):
  - `tail -n 200 /opt/acker-site/data/restart.log`
- Logs do serviço (journal):
  - `journalctl -u acker-site -n 200 --no-pager`

## Rotina de atualização de dados (latest)
- Script:
  - `/opt/acker-site/bin/update_latest.sh`
- Saída principal:
  - `/opt/acker-site/data/latest.json`
  - histórico enxuto em: `/opt/acker-site/data/history.json`

## Config (ENV/tokens/keys)
- Lista completa de ENV/keys esperados: ver `CONFIG.md`.

### Obrigatórias (por script)
- `bin/update_calendar.js`:
  - `BROWSERLESS_TOKEN` (**obrigatória**) — sem isso o script aborta

### Tokens/keys: via ENV vs via arquivo (por script)
- Via **ENV**:
  - `bin/update_calendar.js` → `BROWSERLESS_TOKEN`
  - `bin/serper_rede_dor_x_search.py` → `SERPER_API_KEY`
  - `bin/update_series.js` → `TRAKT_CLIENT_ID`, `TMDB_BEARER`/`TMDB_API_KEY`

- Via **arquivo local** (em `data/`, fora de git; usar `chmod 600`):
  - `bin/update_reviews.js` → `/opt/acker-site/data/reviews/google_api_key.txt`
  - `bin/update_reviews_noapi.js` → `/opt/acker-site/data/reviews/browserless_token.txt`
  - `bin/update_reviews_noapi_cdp.js` → `/opt/acker-site/data/reviews/browserless_token.txt`

## Debug (comandos copy/paste)
- Ver `DEBUG.md`.

## Troubleshooting
- **Erro: Missing `BROWSERLESS_TOKEN` / FALTA token**
  - Para `bin/update_calendar.js`, exporte `BROWSERLESS_TOKEN` no ambiente antes de rodar.
  - Para scripts de reviews sem API, crie o arquivo de token em `data/` e aplique permissões:
    - `chmod 600 /opt/acker-site/data/reviews/browserless_token.txt`

- **Captcha/bloqueio (Google/BLS)**
  - Scraping pode falhar por captcha e variar com o tempo.
  - Reduzir frequência/volume (MAX_HOSPITALS) e re-tentar mais tarde.

- **Serviço não sobe / porta não responde**
  - Ver logs:
    - `journalctl -u acker-site -n 200 --no-pager`
  - Verificar se a porta está em uso:
    - `ss -ltnp | grep ':8080' || true`

## Validação rápida pós-mudança
1) Sintaxe JS ok:
   - `node -c /opt/acker-site/server.js`
2) Serviço ativo:
   - `systemctl is-active acker-site`
3) Healthcheck HTTP:
   - `curl -fsS http://127.0.0.1:8080/ >/dev/null && echo OK`
