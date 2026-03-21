#!/usr/bin/env node
/**
 * rdor3_financials_from_ri_xlsx.js
 *
 * Downloads Rede D'Or fundamentals spreadsheet (RI / MZIQ) and extracts quarterly metrics.
 * Writes: /opt/acker-site/data/rdor3/financials_quarters.json
 *
 * NOTE: Best-effort parsing. The workbook layout can change.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const XLSX = require('xlsx');

const ROOT = '/opt/acker-site';
const OUT = path.join(ROOT, 'data', 'rdor3', 'financials_quarters.json');

const DEFAULT_URL = 'https://api.mziq.com/mzfilemanager/v2/d/5ecded6f-d02b-4439-bd60-b78400f01f1e/f8b1081e-687e-296f-bdf3-fe99781db816?origin=2';

function arg(name, def=null){
  const ix = process.argv.indexOf(name);
  if(ix === -1) return def;
  return process.argv[ix+1] ?? def;
}

function download(url){
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'Mozilla/5.0 (OpenClaw)', 'accept': '*/*' } }, (res) => {
      if(res.statusCode >= 300 && res.statusCode < 400 && res.headers.location){
        return resolve(download(res.headers.location));
      }
      if(res.statusCode !== 200){
        let b='';
        res.on('data', d=> b+=d.toString());
        res.on('end', ()=> reject(new Error('http_'+res.statusCode+' '+b.slice(0,200))));
        return;
      }
      const chunks=[];
      res.on('data', d=> chunks.push(d));
      res.on('end', ()=> resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function writeJson(p, obj){
  fs.mkdirSync(path.dirname(p), { recursive:true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function norm(s){
  return String(s||'')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,' ')
    .trim();
}

function parseQuarterLabel(s){
  const t = String(s||'').trim();
  // allow formats like 1T25, 1T 2025, 2025T1, 2025 1T
  let m = t.match(/([1-4])\s*T\s*(\d{2,4})/i);
  if(m){
    const q = Number(m[1]);
    let y = Number(m[2]);
    if(y < 100) y = 2000 + y;
    return `${y}Q${q}`;
  }
  m = t.match(/(\d{4})\s*\D*\s*([1-4])\s*T/i);
  if(m){
    const y = Number(m[1]);
    const q = Number(m[2]);
    return `${y}Q${q}`;
  }
  return null;
}

function cellVal(sheet, r, c){
  // r,c are 0-based
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = sheet[addr];
  return cell ? cell.v : null;
}

function findHeaderRowAndQuarterCols(sheet, maxRows=80, maxCols=40){
  // scan for a row that contains multiple quarter-like labels
  for(let r=0;r<maxRows;r++){
    const cols=[];
    for(let c=0;c<maxCols;c++){
      const v = cellVal(sheet,r,c);
      const q = parseQuarterLabel(v);
      if(q) cols.push({ c, q });
    }
    if(cols.length >= 4){
      return { headerRow: r, quarterCols: cols };
    }
  }
  return null;
}

function findHeaderAfter(sheet, startRow, maxScan=10){
  const sr = Math.max(0, startRow|0);
  const lim = Math.max(1, maxScan|0);
  for(let r=sr; r<sr+lim; r++){
    const cols=[];
    // some blocks (e.g., dívida) have quarter columns far to the right (e.g., column AB)
    for(let c=0;c<140;c++){
      const q = parseQuarterLabel(cellVal(sheet, r, c));
      if(q) cols.push({ c, q });
    }
    if(cols.length >= 4) return { headerRow:r, quarterCols: cols };
  }
  return null;
}

function findRowAfter(sheet, startRow, needles, maxScan=200){
  const ns = (needles||[]).map(norm);
  const sr = Math.max(0, startRow|0);
  const lim = Math.max(1, maxScan|0);

  // 1) scan row text
  for(let r=sr; r<sr+lim; r++){
    let rowText = '';
    for(let c=0;c<12;c++){
      const v = cellVal(sheet, r, c);
      if(v == null) continue;
      rowText += ' ' + norm(v);
    }
    if(ns.every(n=>rowText.includes(n))) return r;
  }

  // 2) fallback: match only column B (label column)
  for(let r=sr; r<sr+lim; r++){
    const v = cellVal(sheet, r, 1);
    const t = norm(v);
    if(ns.every(n=>t.includes(n))) return r;
  }

  return null;
}

function findMetricRow(sheet, labelNeedles, maxRows=700, maxCols=10){
  // find a row where any cell matches all needles (normalized contains)
  const needles = labelNeedles.map(norm);
  for(let r=0;r<maxRows;r++){
    let rowText='';
    for(let c=0;c<maxCols;c++){
      const v = cellVal(sheet,r,c);
      if(v==null) continue;
      rowText += ' ' + norm(v);
    }
    let ok = true;
    for(const n of needles){
      if(!rowText.includes(n)) { ok=false; break; }
    }
    if(ok) return r;
  }
  return null;
}

function num(v){
  if(v==null || v==='') return null;
  if(typeof v === 'number' && Number.isFinite(v)) return v;
  const raw = String(v);
  const negParen = raw.includes('(') && raw.includes(')');
  const s = raw.replace(/\./g,'').replace(',','.').replace(/[^0-9\.-]/g,'');
  let n = Number(s);
  if(!Number.isFinite(n)) return null;
  if(negParen && n>0) n = -n;
  return n;
}

async function main(){
  const url = arg('--url', DEFAULT_URL);
  const buf = await download(url);
  const wb = XLSX.read(buf, { type:'buffer' });

  // Pick Portuguese sheet if present (stable)
  const sheetName = wb.SheetNames.includes('Português') ? 'Português' : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  // ---- Block selector: pick the quarter-header row whose "Receita bruta" has non-zero values ----
  function findBestQuarterBlock(){
    const candidates = [];
    for(let r=0;r<260;r++){
      const h = findHeaderAfter(sheet, r, 1);
      if(!h) continue;
      // check for receita bruta close by
      const rr = findRowAfter(sheet, h.headerRow+1, ['receita','bruta'], 25);
      if(rr == null) continue;
      // use last quarter col value as a score
      const lastCol = h.quarterCols[h.quarterCols.length-1]?.c;
      const v = (lastCol!=null) ? num(cellVal(sheet, rr, lastCol)) : null;
      const score = (v!=null) ? Math.abs(v) : 0;
      candidates.push({ headerRow: h.headerRow, quarterCols: h.quarterCols, receitaRow: rr, score });
    }
    candidates.sort((a,b)=>b.score-a.score);
    return candidates[0] || null;
  }

  const best = findBestQuarterBlock();
  if(!best) throw new Error('no_quarter_block_with_receita_found');

  const quarterCols = best.quarterCols;
  const colByQ = new Map(quarterCols.map(x=>[x.q, x.c]));
  const headerRow = best.headerRow;

  // last quarter col (for target matching)
  const lastCol = quarterCols[quarterCols.length-1]?.c;
  const lastQ = quarterCols[quarterCols.length-1]?.q;

  // Rows relative to chosen block
  const rReceitaBruta = best.receitaRow;

  // Receita Hosp: use the segment block where the label is also "Receita bruta" (user: linha ~101)
  const targetReceitaHosp = 9388.3;
  const receitaHospRows = [];
  for(let r=headerRow+40; r<headerRow+160; r++){
    const lab = norm(cellVal(sheet,r,1));
    if(lab === 'receita bruta'){
      const v = (lastCol!=null) ? num(cellVal(sheet,r,lastCol)) : null;
      if(v!=null) receitaHospRows.push({ r, v });
    }
  }
  const rReceitaHosp = pickClosest(receitaHospRows.slice(), targetReceitaHosp);

  // EBITDA: multiple rows exist; pick by matching target values at last quarter

  function findRowsByLabel(needle){
    const out=[];
    for(let r=headerRow+1;r<headerRow+220;r++){
      const lab = norm(cellVal(sheet,r,1));
      if(!lab) continue;
      if(lab===needle) out.push(r);
    }
    return out;
  }

  const ebitdaRows = [];
  for(let r=headerRow+1;r<headerRow+260;r++){
    const lab = norm(cellVal(sheet,r,1));
    if(lab==='ebitda'){
      const v = (lastCol!=null) ? num(cellVal(sheet,r,lastCol)) : null;
      if(v!=null) ebitdaRows.push({ r, v });
    }
  }
  // pick total close to 2887.9 (R$ mi)
  const targetEbitdaTotal = 2887.9;
  const targetEbitdaHosp = 2323.1;
  function pickClosest(arr, target){
    if(!arr.length) return null;
    arr.sort((a,b)=>Math.abs(a.v-target)-Math.abs(b.v-target));
    return arr[0].r;
  }
  const rEbitdaTotal = pickClosest(ebitdaRows.slice(), targetEbitdaTotal);
  const rEbitdaHosp = pickClosest(ebitdaRows.slice(), targetEbitdaHosp);

  const rMargemEbitda = findRowAfter(sheet, headerRow+1, ['margem','ebitda'], 300);
  // Margem EBITDA Hosp (row near EBITDA hosp)
  let rMargemEbitdaHosp = null;
  if(rEbitdaHosp != null){
    for(let r=rEbitdaHosp; r<rEbitdaHosp+8; r++){
      const lab = norm(cellVal(sheet,r,1));
      if(lab.includes('margem') && lab.includes('ebitda')){ rMargemEbitdaHosp = r; break; }
    }
  }

  const rLucroLiquido = findRowAfter(sheet, headerRow+1, ['lucro','liquido'], 320);

  // --- SulAmérica (indicadores gerenciais) ---
  // Prefer user-referenced stable-ish Excel 1-based row numbers when they contain numeric values.
  // Current file reference (2026-02):
  // - MLR (Sinistralidade consolidada): row 25 (value as fraction like 0.80)
  // - Receita (linha 167): "Receita Líquida" (R$ milhões)
  // - EBITDA: row 188 (R$ milhões)
  // - Margem EBITDA (%): row 189 (fraction or percent)
  function rowIfHasNumberMain(r1){
    if(lastCol == null) return null;
    const r0 = (r1|0) - 1;
    const v = num(cellVal(sheet, r0, lastCol));
    return (v == null) ? null : r0;
  }

  const rSulMlr = rowIfHasNumberMain(25);
  const rSulReceita = rowIfHasNumberMain(167);
  const rSulEbitda = rowIfHasNumberMain(188);
  const rSulMargemEbitda = rowIfHasNumberMain(189);

  // Balance rows (fallback only) — these are typically R$ milhares
  const rBalCaixaEq = findMetricRow(sheet, ['caixa','equivalentes','caixa']);
  const rBalTitulos = findMetricRow(sheet, ['titulos','valores','mobiliarios']);

  // Debt reconciliation block (used for cash/debt/provisions/hedge) — typically R$ milhões
  const debtRow = findMetricRow(sheet, ['reconciliacao','divida','bruta']);
  const debtHead = debtRow != null ? findHeaderAfter(sheet, debtRow, 18) : null;
  const debtColByQ = debtHead ? new Map(debtHead.quarterCols.map(x=>[x.q, x.c])) : null;

  function quarterRawFromKey(qKey){
    // 2025Q3 -> 3T25
    const m = String(qKey||'').match(/^(\d{4})Q([1-4])$/);
    if(!m) return null;
    const yy = String(m[1]).slice(2);
    const q = m[2];
    return `${q}T${yy}`;
  }

  function detectDebtOffset(){
    if(debtRow == null) return null;
    // The dívida block often doesn't repeat the quarter labels; columns are shifted.
    // Detect shift using the latest quarter column from the main header and the known gross debt row (311).
    const lastQ = quarterCols && quarterCols.length ? quarterCols[quarterCols.length-1].q : null;
    const baseCol = colByQ.get(lastQ);
    if(!lastQ || baseCol == null) return null;

    const rGross = 311-1;
    // scan a small range to the right and pick the column with the strongest gross debt signal.
    let bestOff = null;
    let bestScore = -1;
    for(let off=0; off<=8; off++){
      const c = baseCol + off;
      const gross = num(cellVal(sheet, rGross, c));
      if(gross == null) continue;
      // score: prefer larger gross debt (R$ milhões)
      let score = Math.abs(gross);
      // sanity signals
      const caixa = num(cellVal(sheet, 314-1, c));
      const tit1  = num(cellVal(sheet, 315-1, c));
      if(caixa != null && caixa < 0) score += 10000;
      if(tit1  != null && tit1  < 0) score += 10000;

      if(score > bestScore){
        bestScore = score;
        bestOff = off;
      }
    }

    return bestOff;
  }

  const debtOffset = detectDebtOffset();

  function getDebtCol(qKey){
    if(debtColByQ && debtColByQ.has(qKey)) return debtColByQ.get(qKey);
    const baseCol = colByQ.get(qKey);
    if(baseCol == null) return baseCol;
    if(debtOffset != null) return baseCol + debtOffset;
    // absolute fallback: use base col (better than pinning to AB)
    return baseCol;
  }

  // Prefer the row numbers referenced by user when possible (Excel 1-based): gross debt row 311, DL/EBITDA row 329
  const rDividaBruta = debtRow != null ? (findRowAfter(sheet, debtRow+1, ['divida','bruta'], 240) ?? null) : null;
  const rDividaLiquida = debtRow != null ? (findRowAfter(sheet, debtRow+1, ['divida','liquida'], 300) ?? null) : null;
  const rDividaLiquidaEbitda = debtRow != null ? (findRowAfter(sheet, debtRow+1, ['divida','liquida','ebitda'], 320) ?? null) : null;

  // In the debt reconciliation block, the lines are stable-ish but may move with new results.
  // User reference (current file): cash components at rows 314,315,318,324; gross debt at 311; provisions at 321/322; DL/EBITDA at 329 (Excel 1-based).
  // We'll prefer direct row numbers when values exist for the quarter, then fallback to label search.
  function rowIfHasNumber(r0, c){
    if(r0==null || c==null) return null;
    const v = num(cellVal(sheet, r0, c));
    return (v==null) ? null : r0;
  }

  // Determine quarter col for debt block early for row-pinned extraction
  const debtCProbe = (debtRow!=null) ? (getDebtCol('2025Q3') ?? getDebtCol('2025Q2') ?? getDebtCol('2025Q1') ?? null) : null;

  const rDebtCaixaEq = (debtRow!=null && debtCProbe!=null) ? (rowIfHasNumber(314-1, debtCProbe) ?? findRowAfter(sheet, debtRow+1, ['caixa','equivalentes','caixa'], 260)) : (debtRow!=null ? findRowAfter(sheet, debtRow+1, ['caixa','equivalentes','caixa'], 260) : null);
  const rDebtTit1    = (debtRow!=null && debtCProbe!=null) ? (rowIfHasNumber(315-1, debtCProbe) ?? findRowAfter(sheet, debtRow+1, ['titulos','valores','mobiliarios'], 260)) : (debtRow!=null ? findRowAfter(sheet, debtRow+1, ['titulos','valores','mobiliarios'], 260) : null);
  const rDebtTit2    = (debtRow!=null && debtCProbe!=null) ? (rowIfHasNumber(318-1, debtCProbe) ?? null) : null;

  // Hedge line (explicit)
  const rHedge       = (debtRow!=null && debtCProbe!=null) ? (rowIfHasNumber(324-1, debtCProbe) ?? findRowAfter(sheet, debtRow+1, ['hedge','fluxo','caixa'], 260)) : (debtRow!=null ? findRowAfter(sheet, debtRow+1, ['hedge','fluxo','caixa'], 260) : null);

  // Provisões técnicas abertas — separate lines: Seguros + Previdência privada
  const rProvSeguros     = (debtRow!=null && debtCProbe!=null) ? (rowIfHasNumber(321-1, debtCProbe) ?? findRowAfter(sheet, debtRow+1, ['seguros'], 360)) : (debtRow!=null ? findRowAfter(sheet, debtRow+1, ['seguros'], 360) : null);
  const rProvPrevidPriv  = (debtRow!=null && debtCProbe!=null) ? (rowIfHasNumber(322-1, debtCProbe) ?? findRowAfter(sheet, debtRow+1, ['previdencia','privada'], 360)) : (debtRow!=null ? findRowAfter(sheet, debtRow+1, ['previdencia','privada'], 360) : null);

  // Determine display window: current year and previous year relative to last available quarter
  const lastYear = Number(String(quarterCols[quarterCols.length-1]?.q || '').slice(0,4)) || null;
  const keepYears = lastYear ? new Set([String(lastYear), String(lastYear-1)]) : null;

  const quarters = {};
  for(const qc of quarterCols){
    const y = String(qc.q).slice(0,4);
    if(keepYears && !keepYears.has(y)) continue;
    quarters[qc.q] = quarters[qc.q] || { quarter: qc.q };
  }

  function setFromRow(rowIx, qKey, colByQ, key, factor=1){
    if(rowIx == null) return;
    const c = colByQ.get(qKey);
    if(c == null) return;
    const v = cellVal(sheet, rowIx, c);
    const n = num(v);
    if(n == null) return;
    quarters[qKey][key] = n * factor;
  }

  for(const qc of quarterCols){
    const qKey = qc.q;
    if(keepYears && !keepYears.has(String(qKey).slice(0,4))) continue;

    // DRE (R$ milhões → BRL)
    setFromRow(rReceitaBruta, qKey, colByQ, 'receitaBrutaTotal', 1e6);
    setFromRow(rReceitaHosp,  qKey, colByQ, 'receitaBrutaHospitais', 1e6);

    // EBITDA total/hosp (R$ milhões → BRL)
    setFromRow(rEbitdaTotal, qKey, colByQ, 'ebitdaTotal', 1e6);
    setFromRow(rEbitdaHosp,  qKey, colByQ, 'ebitdaHospitais', 1e6);

    // Margin total: might be fraction or pct
    {
      const c = colByQ.get(qKey);
      if(c != null){
        const v0 = rMargemEbitda != null ? num(cellVal(sheet, rMargemEbitda, c)) : null;
        if(v0 != null){
          const v = (Math.abs(v0) <= 1.5) ? (v0 * 100) : v0;
          quarters[qKey]['margemEbitdaTotalPct'] = v;
        }
        const vH0 = rMargemEbitdaHosp != null ? num(cellVal(sheet, rMargemEbitdaHosp, c)) : null;
        if(vH0 != null){
          const vH = (Math.abs(vH0) <= 1.5) ? (vH0 * 100) : vH0;
          quarters[qKey]['margemEbitdaHospitaisPct'] = vH;
        }
      }
    }

    setFromRow(rLucroLiquido, qKey, colByQ, 'lucroLiquido', 1e6);

    // SulAmérica (R$ milhões → BRL)
    setFromRow(rSulReceita, qKey, colByQ, 'receitaBrutaSulamerica', 1e6);
    setFromRow(rSulEbitda,  qKey, colByQ, 'ebitdaSulamerica', 1e6);

    // SulAmérica margins (MLR, Margem EBITDA) — fraction or pct
    {
      const c = colByQ.get(qKey);
      if(c != null){
        const mlr0 = (rSulMlr != null) ? num(cellVal(sheet, rSulMlr, c)) : null;
        if(mlr0 != null){
          const mlr = (Math.abs(mlr0) <= 1.5) ? (mlr0 * 100) : mlr0;
          quarters[qKey]['mlrSulamericaPct'] = mlr;
        }
        const m0 = (rSulMargemEbitda != null) ? num(cellVal(sheet, rSulMargemEbitda, c)) : null;
        if(m0 != null){
          const m = (Math.abs(m0) <= 1.5) ? (m0 * 100) : m0;
          quarters[qKey]['margemEbitdaSulamericaPct'] = m;
        }
      }
    }

    // Caixa (BRL): caixa eq + títulos (balanço, R$ milhares) + hedge (dívida, R$ milhões)
    {
      const c = colByQ.get(qKey);
      if(c != null){
        // Caixa (prefer debt block — consistent unit and period). Values here are in R$ milhões.
        if(debtRow!=null){
          const cD = getDebtCol(qKey);

          const dCaixa = (rDebtCaixaEq!=null && cD!=null) ? num(cellVal(sheet, rDebtCaixaEq, cD)) : null;
          const dTit1  = (rDebtTit1!=null && cD!=null) ? num(cellVal(sheet, rDebtTit1, cD)) : null;
          const dTit2  = (rDebtTit2!=null && cD!=null) ? num(cellVal(sheet, rDebtTit2, cD)) : null;
          const dHedge = (rHedge!=null && cD!=null) ? num(cellVal(sheet, rHedge, cD)) : null;

          if(dCaixa!=null || dTit1!=null || dTit2!=null || dHedge!=null){
            // In this reconciliation table, asset lines (caixa/títulos) are usually negative.
            // Hedge must be ADDED to caixa, but it comes with the opposite sign in the sheet.
            // So we add (-hedge_raw) i.e. subtract if it's positive.
            const hedgeAdj = (dHedge==null ? 0 : -dHedge);
            const cash = (dCaixa==null?0:Math.abs(dCaixa)) + (dTit1==null?0:Math.abs(dTit1)) + (dTit2==null?0:Math.abs(dTit2)) + hedgeAdj;
            quarters[qKey]['caixa'] = cash * 1e6;
          } else {
            // fallback to balance sheet rows (R$ milhares)
            const bCaixa = (rBalCaixaEq!=null) ? num(cellVal(sheet, rBalCaixaEq, c)) : null;
            const bTit   = (rBalTitulos!=null) ? num(cellVal(sheet, rBalTitulos, c)) : null;
            if(bCaixa!=null || bTit!=null){
              quarters[qKey]['caixa'] = ((bCaixa||0) + (bTit||0)) * 1000;
            }
          }

          // provisões técnicas abertas (Seguros + Previdência privada) (R$ milhões, conceitualmente negativa)
          const p1 = (rProvSeguros!=null && cD!=null) ? num(cellVal(sheet, rProvSeguros, cD)) : null;
          const p2 = (rProvPrevidPriv!=null && cD!=null) ? num(cellVal(sheet, rProvPrevidPriv, cD)) : null;
          if(p1!=null){
            quarters[qKey]['provisoesTecnicasSeguros'] = (-Math.abs(p1)) * 1e6;
          }
          if(p2!=null){
            quarters[qKey]['provisoesTecnicasPrevidencia'] = (-Math.abs(p2)) * 1e6;
          }
          if(p1!=null || p2!=null){
            const provRaw = (p1||0) + (p2||0);
            const prov = -Math.abs(provRaw);
            quarters[qKey]['provisoesTecnicasAbertas'] = prov * 1e6;
          }

          // dívida bruta (R$ milhões)
          const dBr = (rDividaBruta!=null && cD!=null) ? num(cellVal(sheet, rDividaBruta, cD)) : null;
          if(dBr!=null) quarters[qKey]['dividaBruta'] = dBr * 1e6;

          // dívida líquida (reportada) e (computada): dividaBruta - caixa - provisoes
          const dLrep = (rDividaLiquida!=null && cD!=null) ? num(cellVal(sheet, rDividaLiquida, cD)) : null;
          if(dLrep!=null) quarters[qKey]['dividaLiquidaReported'] = dLrep * 1e6;

          if(dBr!=null){
            const caixa = quarters[qKey]['caixa'] || 0;
            const prov = quarters[qKey]['provisoesTecnicasAbertas'] || 0;
            quarters[qKey]['dividaLiquida'] = dBr*1e6 - caixa - prov;
          }

          // DL/EBITDA
          const dlE = (rDividaLiquidaEbitda!=null && cD!=null) ? num(cellVal(sheet, rDividaLiquidaEbitda, cD)) : null;
          if(dlE!=null) quarters[qKey]['dividaLiquidaEbitda'] = dlE;
        }
      }
    }
  }

  const list = Object.values(quarters).sort((a,b)=>String(a.quarter).localeCompare(String(b.quarter)));

  const out = {
    ok: true,
    source: 'ri_mziq_xlsx',
    sheet: sheetName,
    fetchedAt: new Date().toISOString(),
    currency: 'BRL',
    rowDebug: {
      headerRow,
      lastQ: quarterCols[quarterCols.length-1]?.q || null,
      rows: {
        debtBlockStart: debtRow,
        debtOffset: debtOffset,
        receitaBrutaTotal: rReceitaBruta,
        receitaBrutaHosp: rReceitaHosp,
        ebitdaTotal: rEbitdaTotal,
        ebitdaHosp: rEbitdaHosp,
        margemEbitdaTotal: rMargemEbitda,
        margemEbitdaHosp: rMargemEbitdaHosp,
        lucroLiquido: rLucroLiquido,
        sulamerica: {
          mlr: rSulMlr,
          receita: rSulReceita,
          ebitda: rSulEbitda,
          margemEbitda: rSulMargemEbitda,
        },
        caixaEq: { bal: rBalCaixaEq, debt: rDebtCaixaEq },
        titulos: { bal: rBalTitulos, debt1: rDebtTit1, debt2: rDebtTit2 },
        hedge: rHedge,
        provRows: [rProvSeguros, rProvPrevidPriv].filter(x=>x!=null),
        dividaBruta: rDividaBruta,
        dividaLiquida: rDividaLiquida,
        dividaLiquidaEbitda: rDividaLiquidaEbitda,
      }
    },
    quarters: list,
  };

  writeJson(OUT, out);
  console.log(JSON.stringify({ ok:true, sheet: sheetName, quarters: list.length, out: OUT }, null, 2));
}

main().catch(e=>{
  console.error('ERR', e?.message || e);
  process.exit(1);
});
