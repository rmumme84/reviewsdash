#!/usr/bin/env node
/**
 * rdor3_ri_calendar.js
 *
 * Preferred source: downloadable calendar PDF from MZIQ (link on the RI page).
 * Extracts dates + titles via pdftotext (best-effort).
 * Writes: /opt/acker-site/data/rdor3/ri_calendar.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const ROOT = '/opt/acker-site';
const OUT = path.join(ROOT, 'data', 'rdor3', 'ri_calendar.json');

const RI_PAGE = 'https://ri.rededorsaoluiz.com.br/servicos-aos-investidores/calendario-corporativo/';
const PDF_URL = 'https://api.mziq.com/mzfilemanager/v2/d/5ecded6f-d02b-4439-bd60-b78400f01f1e/1795fc29-6108-e74e-066e-d8c9e7f5b4f7?origin=2';

function writeJson(p, obj){
  fs.mkdirSync(path.dirname(p), { recursive:true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
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

function clean(s){
  return String(s||'').replace(/\s+/g,' ').trim();
}

function parsePdfText(txt){
  const lines = String(txt||'')
    .split(/\r?\n/)
    .map(l=>clean(l))
    .filter(Boolean);

  const items=[];
  let lastLine = '';
  let lastSection = '';

  function isGenericHeading(s){
    return /^(data|evento|eventos|detalhes|exportar|data de referencia|datas programadas)/i.test(s);
  }

  for(const ln0 of lines){
    const ln = ln0.replace(/\s{2,}/g,' ');

    // update section memory
    if(!/\b\d{2}\/\d{2}\/\d{4}\b/.test(ln)){
      // treat these as section headers
      if(ln.length >= 8 && ln.length <= 90 && !isGenericHeading(ln) && !/^referentes ao/i.test(ln)){
        // ignore obvious non-sections
        if(!/^(denominacao social|gerente de relacoes|ri@|data de referencia)/i.test(ln)){
          lastSection = ln;
        }
      }
      lastLine = ln;
      continue;
    }

    // date can appear at end of line in this PDF
    const m = ln.match(/^(.*?)(\b\d{2}\/\d{2}\/\d{4}\b)\s*$/);
    if(!m) continue;

    const left = clean(m[1]);
    const date = m[2];

    let title = left || lastLine;
    title = clean(title);

    if(/^referentes ao/i.test(title) && lastSection){
      title = clean(lastSection + ' — ' + title);
    }

    // Skip reference-period dates (not event dates)
    if(/findo em\s*$/i.test(title) || /exercicio social findo em/i.test(title)) continue;
    if(/\bexercicio social findo em\b/i.test(title)) continue;

    // filter junk
    if(!title || isGenericHeading(title)) continue;

    items.push({ date, title });

    // if the title was broken across lines, try to join a trailing continuation line
    const next = lines[lines.indexOf(ln0)+1];
    if(next && !/\b\d{2}\/\d{2}\/\d{4}\b/.test(next)){
      const n = clean(next);
      if((n.toLowerCase().startsWith('ou ') ) && (title.includes('Assembleia') || title.includes('Envio') || title.includes('delibera'))){
        items[items.length-1].title = clean(title + ' ' + n);
      }
    }
  }

  // de-dup (date+title)
  const seen = new Set();
  const out=[];
  for(const it of items){
    const k = it.date+'|'+it.title;
    if(seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

async function main(){
  const pdf = await download(PDF_URL);
  const tmpPdf = path.join('/tmp', 'rdor3_ri_calendar.pdf');
  const tmpTxt = path.join('/tmp', 'rdor3_ri_calendar.txt');
  fs.writeFileSync(tmpPdf, pdf);

  const r = spawnSync('pdftotext', ['-layout', tmpPdf, tmpTxt], { encoding:'utf-8' });
  if(r.status !== 0){
    throw new Error('pdftotext_failed: ' + (r.stderr || r.stdout || ''));
  }

  const txt = fs.readFileSync(tmpTxt, 'utf8');
  const items = parsePdfText(txt);

  const out = {
    ok: true,
    source: 'ri_calendar_pdf',
    page: RI_PAGE,
    url: PDF_URL,
    fetchedAt: new Date().toISOString(),
    items,
  };

  writeJson(OUT, out);
  console.log(JSON.stringify({ ok:true, count: items.length, out: OUT }, null, 2));
}

main().catch(e=>{
  console.error('ERR', e?.message || e);
  process.exit(1);
});
