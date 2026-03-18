# acker-site — Docs

## Índice
- [O que é](#o-que-é)
- [Estrutura (alto nível)](#estrutura-alto-nível)
- [Como validar rápido (sem suposições de systemd)](#como-validar-rápido-sem-suposições-de-systemd)
- [Links úteis](#links-úteis)

## O que é
Servidor Node (arquivo principal: `server.js`) com assets em `public/`.
- Operação AI principal via `/cockpit/` (com `/ai-dashboard/` legado).

## Estrutura (alto nível)
- `server.js` — entrada do servidor
- `public/` — arquivos estáticos
- `data/` — dados usados pela aplicação
- `logs/` — logs
- `scripts/` / `bin/` — utilitários

## Como validar rápido (sem suposições de systemd)
1) Verificar que o arquivo principal existe:
   - `ls -la /opt/acker-site/server.js`
2) Smoke check de sintaxe:
   - `node -c /opt/acker-site/server.js`

## Links úteis
- Index (qual doc usar): `INDEX.md`
- Runbook: `RUNBOOK.md`
- Claude Code (integração): `../CLAUDE_CODE_INTEGRATION.md`
- Gemini CLI (VPS): `GEMINI.md`
- Debug (comandos copy/paste): `DEBUG.md`
- Checks (consistência de docs): `CHECKS.md`
- Fora do escopo (tracking): `OUT_OF_SCOPE.md`
- Config (ENV/keys): `CONFIG.md`
- Segurança (scan/boas práticas): `SECURITY.md`
- Changelog (docs): `CHANGELOG.md`

> Observação: não estou alterando runtime/serviço aqui; só documentação.
