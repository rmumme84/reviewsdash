# acker-site — Checks de Docs

## Checagem de refs `docs/` dentro da pasta `docs/`
Use para garantir consistência de paths internos.

- Listar ocorrências:
  - `grep -RIn "\\bdocs/" /opt/acker-site/docs`

## Nota
- Referências do tipo `docs/FOO.md` podem ser aceitáveis em contexto de repositório, mas dentro de `/opt/acker-site/docs` preferimos referenciar apenas `FOO.md`.
