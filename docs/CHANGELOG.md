# Changelog — acker-site docs

Este changelog foca nas mudanças de **documentação** (pasta `docs/`).

> Convenção: neste changelog, usamos o prefixo `docs/` nos nomes dos arquivos para ficar claro que são caminhos relativos à raiz do projeto.

## 2026-03-11
- `docs/RUNBOOK.md`: adicionado estado vigente do OpenClaw Cockpit (`/cockpit/` principal + legado), coding agents e cron crítico `vasco_geql` (06h–21h BRT).
- `docs/README.md`: visão geral atualizada com cockpit principal e links para docs de Claude/Gemini.
- `docs/INDEX.md`: índice atualizado com `docs/GEMINI.md` e referência para `CLAUDE_CODE_INTEGRATION.md`.
- `docs/GEMINI.md`: novo guia operacional do Gemini CLI no VPS.

## 2026-02-07
- `docs/README.md`: índice + links úteis (inclui SECURITY/CHANGELOG/CHECKS/INDEX/OUT_OF_SCOPE).
- `docs/RUNBOOK.md`: operação + debug + troubleshooting + mini-TOC; paths internos normalizados (sem `docs/` prefix).
- `docs/CONFIG.md`: ENV + keys esperados (sem valores), exemplos de arquivos em `data/` e nota de permissões (chmod 600).
- `docs/DEBUG.md`: comandos copy/paste com pré-checks que **não imprimem tokens/keys**.
- `docs/SECURITY.md`: status atualizado (hardcoded secrets removidos + recomendações); paths internos normalizados.
