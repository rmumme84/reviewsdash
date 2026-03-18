# RDOR3 — Painel do RI

URL: `http://76.13.227.123:8080/rdor3/`

## Objetivo
Painel mobile-first ("1 tela") para acompanhar RDOR3 com:
- KPIs e evolução (preço + volume)
- Destaques do mercado (tabela)
- Consenso por casa (editável)
- Indicadores trimestrais (via planilha RI)
- Agenda RI (calendário corporativo)
- News ticker (Brasil Macro + Rede D’Or)

## Dados / Endpoints
- B3 histórico 5y: `GET /api/rdor3/b3_daily_5y.json`
- Quotes (best-effort): `GET /api/quotes/ticker.json?symbols=RDOR3`
- Indicadores trimestrais (RI XLSX → JSON): `GET /api/rdor3/financials_quarters.json`
  - inclui `rowDebug` (linhas detectadas no XLSX) para diagnóstico.
- Consenso por casa (base editável):
  - `GET /api/rdor3/consensus_by_house.json`
  - `PUT /api/rdor3/consensus_by_house.json`
- CDI 5y: `GET /api/market/cdi_5y.json`
- Agenda RI: `GET /api/rdor3/ri_calendar.json`
- News (fonte do ticker): `GET /api/news.json`
- IA (gerar ticker): `POST /api/ai/openai`

## Scripts (VPS)
- Import trimestral RI XLSX:
  - `/opt/acker-site/bin/rdor3_financials_from_ri_xlsx.js`
  - saída: `/opt/acker-site/data/rdor3/financials_quarters.json`
- Agenda RI (PDF + pdftotext):
  - `/opt/acker-site/bin/rdor3_ri_calendar.js`
  - saída: `/opt/acker-site/data/rdor3/ri_calendar.json`

## Observações importantes
- A página de calendário do RI pode não ter os eventos diretamente no HTML; a solução usada é o **PDF do calendário (MZIQ) + `pdftotext`**.
- Dívida/Caixa/Provisões vêm do bloco **"Reconciliação da Dívida Bruta"** (colunas podem estar deslocadas vs o header principal). O importador detecta o **offset** do bloco e guarda diagnóstico em `rowDebug`.
- Regra do caixa no bloco de dívida: **|caixa eq| + |títulos circ| + |títulos não circ| + (-hedge_raw)** (hedge soma ao caixa, mas vem com sinal invertido).
- O importador do XLSX inclui `rowDebug` porque a planilha muda com novos resultados.
- O ticker é gerado por prompt e cacheado no browser (localStorage) por alguns minutos para reduzir chamadas.
