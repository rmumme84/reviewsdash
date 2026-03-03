# PROGRESS — GuerraFoot Simulador · Fase A

## Resumo

Fase A implementa: log estruturado de eventos, seed determinística, correção dos
selects de substituição, correção do `ballSector` pós-defesa e correção visual
do momentum.

---

## Commits da Fase A

| Hash | Mensagem |
|------|----------|
| `64d77d6` | chore: snapshot inicial do simulador futebol |
| `190b9f8` | fix(A4): ballSector vai para home\_gk/away\_gk quando GK defende |
| `d67d0de` | fix(A3): substituições atualizam selects imediatamente |
| `24e52ca` | fix(A5): corrige momentum visual invertido + 2 casos de teste |
| `ecd482b` | feat(A1): event log estruturado + debug overlay |
| `3a05651` | feat(A2): seed determinística via querystring e UI |

---

## Arquivos tocados

| Arquivo | O que mudou |
|---------|-------------|
| `engine.js` | A1: campos `ts/tick/sector/actors/probs` em `_addEvent`; A2: `mulberry32`, `seedFromString`, `_rng`, `_pick`, substituição de todos `Math.random()`; A4: `ballSector` corrigido após defesa do GK |
| `ui.js` | A1: `renderDebug()`, toggle debug overlay; A2: leitura de seed via querystring + input; A3: `populateSubSelects` usa `activeSubSide`, toggle Casa/Visit, chamado em `renderState`; A5: `renderMomentum` corrigido + `window._testMomentum` |
| `index.html` | A1: `#debug-overlay`; A2: `#seed-input`, `#seed-badge`; A3: botões `sub-side-btn` |
| `style.css` | A1: `.debug-overlay`, `.debug-content`; A2: `.seed-row`, `.seed-badge`; A3: `.sub-side-btn` |

---

## Checklist Fase A

- [x] **A1** — Event log estruturado com `ts`, `tick`, `sector`, `actors[]`, `probs{}`; toggle `🐛 Debug` na UI  
- [x] **A2** — Seed determinística via `?seed=` na querystring e/ou campo no pré-jogo  
- [x] **A3** — Substituições refletem elenco/escalação atual imediatamente (toggle Casa/Visit, sem delay)  
- [x] **A4** — Quando GK defende, `ballSector` vai para `home_gk` ou `away_gk`  
- [x] **A5** — Momentum visual corrigido + 2 casos forçados via `window._testMomentum()`  

---

## Como validar

### A1 — Debug overlay

1. Inicie uma partida
2. Clique em **🐛 Debug** nos controles
3. O painel inferior exibe JSON atualizado a cada tick com:
   - `tick`, `minute`, `phase`, `score`, `momentum`, `ballSector`, `seed`
   - `recentEvents[0..9]` com `type`, `min`, `tick`, `sector`, `actors`, `probs`
4. Para eventos de chute/defesa, `probs` contém `xG`, `saveChance`, `onTargetChance`

### A2 — Seed determinística

**Via querystring:**
```
/futebol/?seed=classicoRJ
```
**Via UI:** preencha o campo "Seed" antes de iniciar.

**Reprodução:**
1. Inicie com `?seed=42`
2. Anote o placar/eventos aos 45'
3. Reinicie a partida com a mesma seed → resultado idêntico
4. Se nenhuma seed for informada, uma é gerada e exibida no badge `🎲` do placar

### A3 — Substituições ao vivo

1. Inicie uma partida em velocidade 1x
2. Clique em **Casa** ou **Visit** nos botões de substituição
3. Os selects refletem imediatamente o elenco ativo de cada lado
4. Após lesão automática (minutos 20–80), os selects atualizam no próximo render (sem esperar 10s)
5. Faça uma substituição manual → o jogador sai dos opções "Saindo" imediatamente

### A4 — ballSector após defesa do GK

1. Abra o Debug overlay
2. Filtre eventos por `type: "save"`
3. Confira que `sector` no evento é `home_gk` (quando o GK do home defende) ou `away_gk`
4. No campo SVG, a bola deve aparecer no setor do goleiro defensor após a defesa

### A5 — Momentum visual

**Teste automático ao carregar a página (console):**
```js
// Executados automaticamente ao carregar ui.js:
window._testMomentum(60)   // → barra azul (home) à direita do centro
setTimeout(() => window._testMomentum(-60), 1500)  // → barra vermelha (away) à esquerda
```

**Teste manual no console:**
```js
window._testMomentum(80)   // home domina forte
window._testMomentum(-80)  // away domina forte
window._testMomentum(0)    // sem momentum → barra invisível
```

**Esperado:**
- `mom > 0`: barra azul (`--home`) cresce da linha central **para a direita**
- `mom < 0`: barra vermelha (`--away`) cresce da linha central **para a esquerda**

---

## Decisões de design (ambiguidades)

| Tópico | Decisão tomada |
|--------|----------------|
| `actors` quando evento não tem jogador | `actors: []` (array vazio) — nunca `null` |
| Seed gerada aleatoriamente | `Math.random()` no construtor é a única exceção ao PRNG interno — é apenas para gerar o valor da seed exibida ao usuário |
| Toggle Home/Away no sub | Abordagem mais simples (2 botões), sem tabs elaboradas, para não quebrar layout existente |
| `_testMomentum` no load | Executado apenas 1.5s e não interfere no jogo; remove-se manualmente se indesejado |
| Intervalo `setInterval` subs | Removido; `populateSubSelects` chamado em cada `renderState` — suficiente e mais correto |
