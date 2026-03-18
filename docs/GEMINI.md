# GEMINI.md — Gemini CLI no VPS
> Atualizado: 2026-03-11

## Contexto
Gemini CLI é usado como coding agent alternativo no VPS, via SSH, quando necessário.

## Instalação/estado conhecido
- Binário: `/usr/bin/gemini`
- Referência registrada em memória (2026-03-08): versão `0.32.1`
- Modo headless: `GEMINI_API_KEY`

## Execução padrão (sem TTY)
```sh
ssh 76.13.227.123 "gemini -p 'instrução'" 2>/dev/null
```

## Regras
- Rodar via SSH no VPS; não usar ACP runtime.
- Não executar ações destrutivas sem confirmação.
- Evitar alterações em arquivos críticos sem revisão.

## Escopo recomendado
- Alternativa de coding/análise quando Copilot estiver sem cota/instável.
- Tarefas de implementação e inspeção de código no servidor.
