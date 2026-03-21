#!/usr/bin/env node
/**
 * rdor3_short_interest_b3.js
 *
 * Fetches B3 BTC "Posições em aberto" (BTBLendingOpenPosition) for RDOR3
 * and writes /opt/acker-site/data/rdor3/short_interest.json
 *
 * Data source:
 *   https://arquivos.b3.com.br/bdi/table/BTBLendingOpenPosition/<start>/<end>/1/100?filter=<base64>
 *   POST body: {}
 *
 * We interpret the "Total" row quantity as shares on loan (proxy for short interest).
 * Then estimate:
 *   sharesOutstanding ≈ marketCap / price (from our quotes endpoint)
 *   shortInterestPct  = qty / sharesOutstanding * 100
 *   daysToCover       = qty / dailyVolumeShares (from our B3 daily history)
 *
 * Usage:
 *   node /opt/acker-site/bin/rdor3_short_interest_b3.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = '/opt/acker-site';
const OUT = path.join(ROOT, 'data', 'rdor3', 'short_interest.json');

function isoDay(d){
  const x = new Date(d);
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth()+1).padStart(2,'0');
  const dd = String(x.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

function writeJson(p, obj){
  fs.mkdirSync(path.dirname(p), { recursive:true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

async function fetchJson(url, opts){
  const r = await fetch(url, opts);
  const txt = await r.text();
  if(!r.ok) throw new Error('http_'+r.status+' '+txt.slice(0,200));
  try{ return JSON.parse(txt); }catch{ throw new Error('json_parse_failed '+txt.slice(0,200)); }
}

function num(x){
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function main(){
  const ticker = 'RDOR3';
  const filter = Buffer.from(ticker).toString('base64');

  const end = new Date();
  const start = new Date(end.getTime() - 10*24*60*60*1000);

  const startDay = isoDay(start);
  const endDay = isoDay(end);

  const url = `https://arquivos.b3.com.br/bdi/table/BTBLendingOpenPosition/${startDay}/${endDay}/1/100?filter=${encodeURIComponent(filter)}`;
  const j = await fetchJson(url, { method:'POST', headers:{ 'content-type':'application/json' }, body:'{}' });

  const vals = j?.table?.values;
  if(!Array.isArray(vals) || !vals.length) throw new Error('no_values');

  // Each row is an array. Observed layout:
  // [0]=refDate, [1]=refDate (dup), [2]=ticker, [3]=isin, [4]=name, [5]=spec, [6]=market,
  // [7]=qtyShares, [8]=rate?, [9]=financialValue
  // The "market" label includes 'Total'. We'll pick latest date's Total.

  // group by date -> totalRow
  const byDate = new Map();
  for(const row of vals){
    const dayRaw = row?.[0];
    const day = (typeof dayRaw === 'string' && dayRaw.length>=10) ? dayRaw.slice(0,10) : null;
    const market = String(row?.[6] || '').trim();
    if(!day) continue;
    if(market.toLowerCase() === 'total'){
      byDate.set(day, row);
    }
  }

  const dates = Array.from(byDate.keys()).sort();
  if(!dates.length) throw new Error('no_total_rows');
  const lastDate = dates[dates.length-1];
  const rTot = byDate.get(lastDate);

  const qtyOnLoan = num(rTot?.[7]);
  const valueOnLoan = num(rTot?.[9]);

  // Pull quote (for price + marketCap)
  let price=null, marketCap=null;
  try{
    const qj = await fetchJson('http://127.0.0.1:8080/api/quotes/ticker.json?symbols=RDOR3&nocache=1', { headers:{'accept':'application/json'} });
    const q = qj?.quotes?.[0];
    price = num(q?.price);
    marketCap = num(q?.marketCap);
  } catch {}

  const sharesOutstanding = (price!=null && marketCap!=null && price>0) ? (marketCap/price) : null;
  const shortInterestPct = (qtyOnLoan!=null && sharesOutstanding!=null && sharesOutstanding>0) ? (qtyOnLoan/sharesOutstanding*100) : null;

  // Pull last daily volume (shares) for days-to-cover
  let dailyVol=null;
  try{
    const hj = await fetchJson('http://127.0.0.1:8080/api/rdor3/b3_daily_5y.json', { headers:{'accept':'application/json'} });
    const pts = Array.isArray(hj?.points) ? hj.points : [];
    const last = pts.length ? pts[pts.length-1] : null;
    dailyVol = num(last?.volumeShares);
  } catch {}

  const daysToCover = (qtyOnLoan!=null && dailyVol!=null && dailyVol>0) ? (qtyOnLoan/dailyVol) : null;

  const out = {
    ok: true,
    source: 'b3_arquivos:BTBLendingOpenPosition',
    symbol: ticker,
    fetchedAt: new Date().toISOString(),
    range: { start: startDay, end: endDay },
    items: [
      {
        date: lastDate,
        sharesOnLoan: qtyOnLoan,
        valueOnLoan,
        price,
        marketCap,
        sharesOutstandingEst: sharesOutstanding,
        shortInterestPct,
        dailyVolumeSharesRef: dailyVol,
        daysToCover,
      }
    ]
  };

  writeJson(OUT, out);
  process.stdout.write(JSON.stringify({ ok:true, out: OUT, lastDate, qtyOnLoan, shortInterestPct, daysToCover }, null, 2));
  process.stdout.write('\n');
}

main().catch(e=>{
  process.stderr.write('ERR ' + String(e?.message||e) + '\n');
  process.exit(1);
});
