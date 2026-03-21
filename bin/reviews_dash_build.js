#!/usr/bin/env node
/**
 * Build a lightweight dataset for ReviewsDash.
 *
 * Input:
 *  - /opt/acker-site/data/reviews/reviews_unified.json
 * Output:
 *  - /opt/acker-site/data/reviews/reviews_dash.json
 */

const fs = require('fs');
const path = require('path');

function arg(name, def=null){
  const i = process.argv.indexOf(name);
  if(i===-1) return def;
  const v = process.argv[i+1];
  return v==null?def:v;
}

const IN = arg('--in', '/opt/acker-site/data/reviews/reviews_unified.json');
const OUT = arg('--out', '/opt/acker-site/data/reviews/reviews_dash.json');

function readJson(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function writeJson(p, obj){ fs.mkdirSync(path.dirname(p), {recursive:true}); fs.writeFileSync(p, JSON.stringify(obj)); }

function norm(s){
  return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

function isoDayBRT(isoOrDate){
  const dt = (isoOrDate instanceof Date) ? isoOrDate : new Date(isoOrDate);
  const t = dt.getTime() - 3*3600*1000;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,'0');
  const dd = String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

function parseISOFromReview(r){
  const s = r?.publishTimeMs || r?.publishTime || r?.time || r?.relative_time_description || r?.publishedAt || r?.date || r?.iso || r?.dateISO || null;
  if(!s) return null;
  if(typeof s === 'number'){
    const ms = (s < 2e10) ? (s*1000) : s;
    return new Date(ms).toISOString();
  }
  const t = String(s);
  if(/\d{4}-\d{2}-\d{2}T/.test(t)) return t;
  const d = new Date(t);
  if(!isNaN(d.getTime())) return d.toISOString();
  return null;
}

function authorName(r){
  const a = r?.author ?? r?.author_name ?? r?.user ?? r?.profile ?? null;
  if(!a) return null;
  if(typeof a === 'string') return a.trim() || null;
  if(typeof a === 'object'){
    const n = String(a.name || a.author_name || a.author || '').trim();
    return n || null;
  }
  return String(a).trim() || null;
}

function reviewKey(item, textSlice=120){
  if(item.rawId){
    return `${String(item.placeId||'')}|raw|${String(item.rawId)}`;
  }
  return [
    String(item.placeId||''),
    'fp',
    String(item.author||'').trim(),
    String(item.rating||''),
    String(item.text||'').replace(/\s+/g,' ').trim().slice(0, textSlice),
  ].join('|');
}

function build(){
  const j = readJson(IN);
  const hospitals = Array.isArray(j?.hospitals) ? j.hospitals : [];

  const rated = hospitals.filter(h => Number.isFinite(Number(h.rating)));
  const weightedOk = rated.some(h => Number.isFinite(Number(h.reviewsCount)) && Number(h.reviewsCount)>0);
  let baseline = null;
  if(rated.length){
    if(weightedOk){
      let w=0, wSum=0;
      for(const h of rated){
        const c = Number(h.reviewsCount)||0;
        const r = Number(h.rating);
        if(!c) continue;
        w += c;
        wSum += r*c;
      }
      baseline = w ? (wSum/w) : (rated.reduce((s,h)=>s+Number(h.rating),0)/rated.length);
    } else {
      baseline = rated.reduce((s,h)=>s+Number(h.rating),0)/rated.length;
    }
  }

  const now = Date.now();
  const since90 = now - 90*24*3600*1000;
  const since14 = now - 14*24*3600*1000;
  const since7 = now - 7*24*3600*1000;
  const since72h = now - 72*3600*1000;

  const all90 = [];
  const all14 = [];
  const all72 = [];
  const seen = new Set();

  for(const h of hospitals){
    const hName = h.name || h.hospital || h.place || '—';
    const placeId = h.placeId || null;
    const hr = Number.isFinite(Number(h.rating)) ? Number(h.rating) : null;
    const hc = Number.isFinite(Number(h.reviewsCount)) ? Number(h.reviewsCount) : null;

    for(const r of (h.reviews||[])){
      const iso = parseISOFromReview(r);
      if(!iso) continue;
      const tms = Date.parse(iso);
      if(!Number.isFinite(tms)) continue;

      const item = {
        hospital: hName,
        placeId,
        hospitalRating: hr,
        hospitalReviewsCount: hc,
        rating: Number.isFinite(Number(r.rating)) ? Number(r.rating) : null,
        text: r.text || r.original_text || '',
        author: authorName(r),
        iso,
        rawId: r.rawId || null,
      };

      const key = reviewKey(item, 240);
      if(seen.has(key)) continue;
      seen.add(key);

      if(tms >= since90) all90.push(item);
      if(tms >= since14) all14.push(item);
      if(tms >= since72h) all72.push(item);
    }
  }

  let endKey = null;
  for(const r of all14){
    const k = isoDayBRT(r.iso);
    if(!endKey || k > endKey) endKey = k;
  }
  const todayKey = isoDayBRT(new Date());
  if(!endKey) endKey = todayKey;
  if(endKey < todayKey) endKey = todayKey;

  const [Y,M,D] = endKey.split('-').map(Number);
  const endDate = new Date(Date.UTC(Y, M-1, D, 3, 0, 0));
  const startDate = new Date(endDate.getTime() - 14*24*3600*1000);
  const keys=[];
  for(let i=0;i<15;i++){
    const d = new Date(startDate.getTime() + i*24*3600*1000);
    const k = isoDayBRT(d);
    keys.push(k);
  }
  const bucket = new Map(keys.map(k=>[k,{sum:0,count:0}]));
  for(const r of all14){
    const k = isoDayBRT(r.iso);
    if(!bucket.has(k)) continue;
    if(r.rating==null) continue;
    const b = bucket.get(k);
    b.sum += r.rating;
    b.count += 1;
  }
  const trend15 = {
    endKey,
    labels: keys.map(k=>{ const [y,m,d]=k.split('-'); return `${d}/${m}`; }),
    counts: keys.map(k=>bucket.get(k).count),
    avgs: keys.map(k=>{ const b=bucket.get(k); return b.count ? (b.sum/b.count) : null; }),
    baseline,
  };

  const all7 = all14.filter(x => Date.parse(x.iso) >= since7 && x.rating!=null);
  const prev7 = all14.filter(x => {
    const t=Date.parse(x.iso);
    return t>=since14 && t<since7 && x.rating!=null;
  });
  const avg7 = all7.length ? (all7.reduce((s,r)=>s+r.rating,0)/all7.length) : null;
  const avgPrev7 = prev7.length ? (prev7.reduce((s,r)=>s+r.rating,0)/prev7.length) : null;
  const delta7 = (avg7!=null && baseline!=null) ? (avg7-baseline) : null;
  const v7 = all7.length;
  const vPrev = prev7.length;
  const vDelta = vPrev ? ((v7/vPrev - 1)*100) : null;

  const byHosp = new Map();
  for(const r of all7){
    const k = String(r.placeId||r.hospital||'').trim();
    if(!k) continue;
    const cur = byHosp.get(k) || { hospital:r.hospital, placeId:r.placeId||null, n:0, sum:0, base:r.hospitalRating };
    cur.n += 1;
    cur.sum += r.rating;
    if(cur.base==null && r.hospitalRating!=null) cur.base = r.hospitalRating;
    byHosp.set(k, cur);
  }
  const moversArr = Array.from(byHosp.values())
    .map(x=>({
      hospital: x.hospital,
      placeId: x.placeId,
      n: x.n,
      avg: x.n ? (x.sum/x.n) : null,
      base: (x.base!=null && Number.isFinite(Number(x.base))) ? Number(x.base) : null,
    }))
    .filter(x=>x.avg!=null && x.base!=null)
    .map(x=>({ ...x, delta: x.avg - x.base }));
  moversArr.sort((a,b)=>b.delta-a.delta);
  const movers = {
    up: moversArr.slice(0,10),
    down: moversArr.slice().reverse().slice(0,10),
  };

  const typhoon = {
    baseline,
    hospitals: moversArr
      .slice()
      .sort((a,b)=> (b.avg-b.base) - (a.avg-a.base))
      .map(x=>({
        hospital: x.hospital,
        placeId: x.placeId,
        n7: x.n,
        avg7: x.avg,
        base: x.base,
        deltaVsBase: x.delta,
        deltaVsNetwork: (baseline!=null ? (x.avg - baseline) : null),
      })),
  };

  const S4 = [
    'obito','óbito','morte','morreu','falecimento',
    'sepse','septicemia',
    'erro medico','erro médico',
    'medicacao errada','medicação errada','dose errada','troca de medicamento',
    'cirurgia errada','anestesia',
    'omissao de socorro','omissão de socorro',
    'parada','intubacao','intubação',
    'agressao','agressão','ameaca','ameaça','assedio','assédio','abuso',
  ].map(norm);
  const S3 = [
    'infeccao hospitalar','infecção hospitalar','infeccao','infecção',
    'negligencia','negligência','impericia','imperícia','imprudencia','imprudência',
    'descaso',
    'queda','fratura','lesao','lesão',
    'sangramento','hemorragia','hemorrag',
    'diagnostico errado','diagnóstico errado','diagnostico tardio','diagnóstico tardio',
    'gestante','gravida','grávida','bebe','bebê','parto','uti',
  ].map(norm);

  function hasAny(text, arr){
    for(const a of arr){
      if(a && text.includes(a)) return true;
    }
    return false;
  }

  const reportRows=[];
  const seenReport = new Set();
  for(const r of all90){
    const stars = Number(r.rating);
    if(!(stars===1 || stars===2)) continue;
    const textRaw = String(r.text||'').replace(/\s+/g,' ').trim();
    const textN = norm(textRaw);
    if(textN.length < 20) continue;

    const isS4 = hasAny(textN, S4);
    const isS3 = (!isS4) && hasAny(textN, S3);
    if(!isS4 && !isS3) continue;

    const reportKey = reviewKey({ ...r, text: textRaw }, 240);
    if(seenReport.has(reportKey)) continue;
    seenReport.add(reportKey);

    const tms = Date.parse(r.iso);
    const d = new Date(tms - 3*3600*1000);
    const dtTxt = d.toLocaleString('pt-BR',{ day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

    reportRows.push({
      sev: isS4 ? 'S4' : 'S3',
      tms,
      dtTxt,
      rating: stars,
      hospital: r.hospital,
      author: r.author || null,
      text: textRaw,
      placeId: r.placeId || null,
    });
  }
  reportRows.sort((a,b)=>b.tms-a.tms);

  const by = new Map();
  for(const x of reportRows){
    const k = x.hospital || '—';
    const cur = by.get(k) || {S4:0,S3:0};
    cur[x.sev] = (cur[x.sev]||0) + 1;
    by.set(k, cur);
  }
  const rank = Array.from(by.entries()).map(([hospital,c])=>({ hospital, S4:c.S4||0, S3:c.S3||0 }))
    .sort((a,b)=> (b.S4*1000+b.S3) - (a.S4*1000+a.S3));

  const TOPICS = [
    { key:'atendimento', label:'Atendimento', words:['atendimento','atender','atencioso','atenciosa','acolhimento','acolhedor','cuidado','cuidaram','ouvidoria'] },
    { key:'espera', label:'Tempo de espera', words:['demora','demorado','demorou','espera','aguard','fila','atraso','atrasado','horas','minutos'] },
    { key:'medicos', label:'Médicos', words:['médico','medica','doutor','dra','dr.','cirurg','diagnóstico','diagnostico','consulta'] },
    { key:'enfermagem', label:'Enfermagem', words:['enferm','técnic','tecnico','enfermeir','medicação','medicacao','soro','punção','puncao'] },
    { key:'recepcao', label:'Recepção', words:['recepção','recepcao','atendente','balcão','balcao','cadastro','triagem'] },
    { key:'limpeza', label:'Estrutura/Limpeza', words:['limpo','limpeza','sujo','higien','infraestrutura','estrutura','quarto','banheiro','instalações','instalacoes'] },
    { key:'cobranca', label:'Cobrança/Valor', words:['cobran','caro','preço','preco','valor','fatura','nota fiscal','invoice','plano','convênio','convenio'] },
    { key:'emergencia', label:'Emergência', words:['emerg','pronto socorro','pronto atendimento','upa','urgência','urgencia','ps'] },
  ];
  const topicStats = TOPICS.map(t=>({ ...t, n:0, sum:0, avg:null }));
  for(const r of all72){
    if(r.rating==null) continue;
    const tx = norm(r.text||'');
    if(!tx) continue;
    for(const st of topicStats){
      if(st.words.some(w=> tx.includes(norm(w)))){
        st.n += 1;
        st.sum += r.rating;
      }
    }
  }
  for(const st of topicStats){
    st.avg = st.n ? (st.sum/st.n) : null;
  }
  const topics72 = topicStats.filter(x=>x.n>0).sort((a,b)=>b.n-a.n).slice(0,10);

  const since24 = now - 24*3600*1000;
  let sirenS4=0, sirenS3=0;
  for (const r of all90){
    const tms = Date.parse(r.iso);
    if (!Number.isFinite(tms) || tms < since24) continue;
    const stars = Number(r.rating);
    if (!(stars===1 || stars===2)) continue;
    const textN = norm(String(r.text||''));
    if (textN.length < 20) continue;
    if (hasAny(textN, S4)) { sirenS4++; continue; }
    if (hasAny(textN, S3)) { sirenS3++; continue; }
  }

  const dashHospitals = [];
  for(const h of hospitals){
    const hName = h.name || h.hospital || h.place || '—';
    const placeId = h.placeId || null;
    const hr = Number.isFinite(Number(h.rating)) ? Number(h.rating) : null;
    const hc = Number.isFinite(Number(h.reviewsCount)) ? Number(h.reviewsCount) : null;

    const revs = [];
    const seenRevs = new Set();
    for(const r of (h.reviews||[])){
      const iso = parseISOFromReview(r);
      if(!iso) continue;
      const tms = Date.parse(iso);
      if(!Number.isFinite(tms) || tms < since90) continue;
      const item = {
        placeId,
        rating: Number.isFinite(Number(r.rating)) ? Number(r.rating) : null,
        text: r.text || r.original_text || '',
        author: authorName(r),
        publishTimeMs: r.publishTimeMs ?? null,
        publishTime: iso,
        iso,
        rawId: r.rawId || null,
      };
      const key = reviewKey(item, 240);
      if(seenRevs.has(key)) continue;
      seenRevs.add(key);
      revs.push({
        rating: item.rating,
        text: item.text,
        author: item.author,
        publishTimeMs: item.publishTimeMs,
        publishTime: item.publishTime,
        rawId: item.rawId,
      });
    }

    if(revs.length){
      revs.sort((a,b)=> (Number(b.publishTimeMs)||Date.parse(b.publishTime)||0) - (Number(a.publishTimeMs)||Date.parse(a.publishTime)||0));
      dashHospitals.push({ name: hName, placeId, rating: hr, reviewsCount: hc, reviews: revs });
    }
  }

  const seen14 = new Set();
  const all14Lite = all14
    .filter(x => x.rating != null)
    .sort((a,b)=> (a.iso>b.iso?-1:1))
    .filter(x => {
      const k = reviewKey(x, 240);
      if(seen14.has(k)) return false;
      seen14.add(k);
      return true;
    })
    .map(x => ({
      hospital: x.hospital,
      placeId: x.placeId,
      hospitalRating: x.hospitalRating,
      hospitalReviewsCount: x.hospitalReviewsCount,
      author: x.author,
      rating: x.rating,
      text: String(x.text||'').slice(0, 1200),
      iso: x.iso,
      rawId: x.rawId || null,
    }));

  const out = {
    ok: true,
    updatedAt: new Date().toISOString(),
    source: 'reviews_unified.json',
    size: {
      hospitals: hospitals.length,
      hospitalsWithUi: hospitals.filter(h=>h.source==='google_ui').length,
      all90: all90.length,
      all14: all14.length,
      all72: all72.length,
    },
    baseline,
    hospitals: dashHospitals,
    all14: all14Lite,
    siren24h: { s4: sirenS4, s3: sirenS3 },
    trend15,
    kpis: { baseline, avg7, avgPrev7, delta7, v7, vPrev, vDelta },
    movers,
    typhoon,
    report90: { rows: reportRows.slice(0, 2000), rank: rank.slice(0, 50) },
    topics72,
  };

  writeJson(OUT, out);
  console.log(JSON.stringify({ ok:true, out: OUT, hospitals: hospitals.length, trendDays: 15, reportRows: reportRows.length }, null, 2));
}

try{ build(); }catch(e){
  console.error('ERR:', e && e.stack ? e.stack : String(e));
  process.exit(2);
}
