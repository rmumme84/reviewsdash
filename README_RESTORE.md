# Core2 Restore MVP

Restore alvo: subir o servidor web do `core2` e manter os scripts essenciais
apontando para o próprio espelho, sem depender de `/opt/acker-site`.

## Requisitos

- Node.js 22
- npm
- Bash

## Estrutura esperada

- `server.js`
- `package.json`
- `package-lock.json`
- `public/`
- `data/`
- `bin/`
- `utils/`

## Instalação

```bash
cd /opt/core2-mirror
npm ci
```

## Subir servidor

```bash
PORT=8080 ACKER_ROOT=/opt/core2-mirror node server.js
```

## Scripts essenciais do restore MVP

- `bin/reviews_google_places_api.js`
- `bin/rdor3_snapshot_daily.js`
- `bin/reviews_unified_refresh.sh`

Exemplos:

```bash
ACKER_ROOT=/opt/core2-mirror node /opt/core2-mirror/bin/reviews_google_places_api.js
ACKER_ROOT=/opt/core2-mirror CORE2_BASE_URL=http://127.0.0.1:8080 node /opt/core2-mirror/bin/rdor3_snapshot_daily.js
ACKER_ROOT=/opt/core2-mirror bash /opt/core2-mirror/bin/reviews_unified_refresh.sh
```

## Observações

- `reviews_unified_refresh.sh` usa apenas builders locais do espelho.
- `bin/reviews_report90_build.js` foi adicionado como placeholder mínimo para o restore MVP.
- Este restore MVP não cobre rotinas externas fora do escopo, como SSH/Chrome/pdftotext.
