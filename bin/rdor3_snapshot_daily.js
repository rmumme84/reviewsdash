#!/usr/bin/env node
/**
 * rdor3_snapshot_daily.js
 *
 * Captura um snapshot diário (1x/dia) da RDOR3 via o endpoint local de quotes
 * (que usa Google Finance/Brapi) e persiste em data/rdor3/history_daily.json.
 *
 * Rodar no VPS.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.env.ACKER_ROOT || path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'rdor3', 'history_daily.json');
const DEFAULT_BASE_URL = process.env.CORE2_BASE_URL || `http://127.0.0.1:${process.env.PORT || '8080'}`;
const QUOTE_URL = process.env.RDOR3_QUOTE_URL || `${DEFAULT_BASE_URL}/api/quotes/ticker.json?symbol=${encodeURIComponent('RDOR3')}`;

async function fetchJson(url){
  const r = await fetch(url, { headers: { 'user-agent': 'OpenClaw rdor3_snapshot' } });
  if(!r.ok) throw new Error('http_' + r.status);
  return r.json();
}

function readJsonSafe(p, fb){
  try{ return JSON.parse(fs.readFileSync(p, 'utf8')); }catch{ return fb; }
}

function writeJson(p, obj){
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function isoDay(iso){
  if(!iso) return null;
  const t = Date.parse(iso);
  if(!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0,10);
}

async function main(){
  const nowIso = new Date().toISOString();
  const day = isoDay(nowIso);

  const data = await fetchJson(QUOTE_URL);
  const q = (data && typeof data === 'object' && !Array.isArray(data))
    ? data
    : (Array.isArray(data?.quotes) ? data.quotes.find(x => x.label === 'RDOR3' || x.symbol === 'RDOR3') : null);
  if(!q || q.error) throw new Error('quote_failed:' + (q?.error || 'no_quote'));

  const rec = {
    day,
    capturedAt: nowIso,
    fetchedAt: q.fetchedAt || null,
    price: (q.price != null) ? Number(q.price) : null,
    prevClose: (q.prevClose != null) ? Number(q.prevClose) : null,
    changePct: (q.changePct != null) ? Number(q.changePct) : null,
    volume: (q.volume != null) ? Number(q.volume) : null,
    source: q.source || 'google_finance',
  };

  let cur = readJsonSafe(OUT, { updatedAt: null, points: [] });
  if(!cur || typeof cur !== 'object') cur = { updatedAt: null, points: [] };
  if(!Array.isArray(cur.points)) cur.points = [];

  // Upsert by day
  const next = cur.points.filter(p => p && p.day && p.day !== day);
  next.push(rec);
  next.sort((a,b)=> String(a.day).localeCompare(String(b.day)));

  // keep last ~3y
  const MAX = 900;
  const pruned = next.length > MAX ? next.slice(next.length - MAX) : next;

  writeJson(OUT, { updatedAt: nowIso, points: pruned });

  process.stdout.write(JSON.stringify({ ok:true, out: OUT, quoteUrl: QUOTE_URL, point: rec, total: pruned.length }, null, 2));
  process.stdout.write('\n');
}

main().catch(err=>{
  process.stderr.write('ERR ' + String(err?.message||err) + '\n');
  process.exit(1);
});
