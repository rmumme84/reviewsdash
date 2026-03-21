#!/usr/bin/env node
/**
 * rdor3_investidor10_fundamentals.js
 *
 * Scrape best-effort fundamentals for RDOR3 from investidor10.
 * Writes to: /opt/acker-site/data/rdor3/fundamentals_investidor10.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = '/opt/acker-site';
const OUT = path.join(ROOT, 'data', 'rdor3', 'fundamentals_investidor10.json');

function writeJson(p, obj){
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function parseNumPt(s){
  const raw = String(s||'').replace(/\u00a0/g,' ').trim();
  if(!raw) return null;

  // multiplier for human units
  const low = raw.toLowerCase();
  let mult = 1;
  if(/\bbi\b|bilh|\bb\b/.test(low)) mult = 1e9;
  else if(/\bmi\b|milh|\bm\b/.test(low)) mult = 1e6;
  else if(/\bmil\b|\bk\b/.test(low)) mult = 1e3;

  // remove currency and symbols
  let t = raw.replace(/R\$|BRL|x|%/gi,' ').replace(/\./g,'').replace(/\s+/g,' ').trim();
  const m = t.match(/-?\d+(?:,\d+)?/);
  if(!m) return null;
  const v = Number(m[0].replace(',','.'));
  if(!Number.isFinite(v)) return null;
  return v * mult;
}

async function fetchHtml(url){
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (OpenClaw)', 'accept': 'text/html' } });
  if(!r.ok) throw new Error('http_' + r.status);
  return r.text();
}

function extractValueByLabel(html, label){
  const lab = String(label);
  const re = new RegExp(lab.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + "[\\s\\S]{0,2200}?<div class=\\\"value[^\\\"]*\\\"[\\s\\S]*?<span>\\s*([^<\\n\\r]{1,80})\\s*<\\/span>", 'i');
  const m = html.match(re);
  return m ? String(m[1]||'').trim() : null;
}

async function main(){
  const url = 'https://investidor10.com.br/acoes/rdor3/';
  const html = await fetchHtml(url);

  const fields = {
    evEbitda: extractValueByLabel(html, 'EV/EBITDA'),
    marketCap: extractValueByLabel(html, 'Valor de mercado'),
    margemEbitda: extractValueByLabel(html, 'Margem EBITDA'),
    roic: extractValueByLabel(html, 'ROIC'),
    roe: extractValueByLabel(html, 'ROE'),
    pl: extractValueByLabel(html, 'P/L'),
    divYield: extractValueByLabel(html, 'Dividend Yield'),
    liquidezMediaDiaria: extractValueByLabel(html, 'Liquidez média diária'),
  };

  const out = {
    ok: true,
    source: 'investidor10',
    url,
    fetchedAt: new Date().toISOString(),
    fieldsRaw: fields,
    fields: {
      evEbitda: parseNumPt(fields.evEbitda),
      marketCap: parseNumPt(fields.marketCap),
      margemEbitdaPct: parseNumPt(fields.margemEbitda),
      roicPct: parseNumPt(fields.roic),
      roePct: parseNumPt(fields.roe),
      pl: parseNumPt(fields.pl),
      divYieldPct: parseNumPt(fields.divYield),
      liquidezMediaDiaria: parseNumPt(fields.liquidezMediaDiaria),
    }
  };

  writeJson(OUT, out);
  process.stdout.write(JSON.stringify({ ok:true, out: OUT, fields: out.fields }, null, 2));
  process.stdout.write('\n');
}

main().catch(e=>{
  process.stderr.write('ERR ' + String(e?.message||e) + '\n');
  process.exit(1);
});
