/* Reviews Dashboard (RDOR3-style)
 * Data source: /api/reviews/dash.json
 */

let chart;
let typhoonChart;

const lastPointLabelsPlugin = {
  id: 'lastPointLabels',
  afterDatasetsDraw(chart){
    const { ctx } = chart;
    const dsBar = chart.data.datasets?.[0];
    const dsLine = chart.data.datasets?.[1];
    const dsBase = chart.data.datasets?.[2];
    if(!dsBar || !dsLine) return;

    const barMeta = chart.getDatasetMeta(0);
    const lineMeta = chart.getDatasetMeta(1);
    const baseMeta = dsBase ? chart.getDatasetMeta(2) : null;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const isMobile = (typeof window !== 'undefined') && (window.innerWidth <= 520);

    // label above bars (volume)
    for(let i=0;i<(barMeta.data?.length||0);i++){
      // iPhone: hide bar labels (they clutter and make the chart look truncated).
      if(isMobile) continue;
      const barEl = barMeta.data?.[i];
      const vBar = dsBar.data?.[i];
      if(!barEl || !vBar) continue;
      ctx.font = (isMobile ? '700 10px DM Mono, monospace' : '700 11px DM Mono, monospace');
      ctx.fillStyle = 'rgba(17,24,39,0.82)';
      ctx.fillText(String(vBar), barEl.x, barEl.y - 6);
    }

    // label above last line point (avg)
    const iLast = (chart.data.labels?.length || 0) - 1;
    if(iLast >= 0){
      const lineEl = lineMeta.data?.[iLast];
      const vLine = dsLine.data?.[iLast];
      if(lineEl && vLine != null){
        ctx.font = '700 11px DM Mono, monospace';
        ctx.fillStyle = 'rgba(245,158,11,0.95)';
        const t = (Number.isFinite(Number(vLine)) ? (Number(vLine).toLocaleString('pt-BR',{maximumFractionDigits:1, minimumFractionDigits:1})+'★') : '');
        if(t) ctx.fillText(t, lineEl.x, lineEl.y - 8);
      }

      // baseline label (dashed line) — below the line (last point)
      const baseEl = baseMeta?.data?.[iLast];
      const vBase = dsBase?.data?.[iLast];
      if(baseEl && vBase != null){
        ctx.font = '700 11px DM Mono, monospace';
        ctx.fillStyle = 'rgba(107,114,128,0.95)';
        const t = `${Number(vBase).toLocaleString('pt-BR',{maximumFractionDigits:2, minimumFractionDigits:2})}★`;
        const prevBaseline = ctx.textBaseline;
        ctx.textBaseline = 'top';
        ctx.fillText(t, baseEl.x, baseEl.y + 6);
        ctx.textBaseline = prevBaseline;
      }
    }

    ctx.restore();
  }
};

function $(id){ return document.getElementById(id); }
window.__reviewsdash_dbg = window.__reviewsdash_dbg || {};
function dbg(k,v){ try{ window.__reviewsdash_dbg[k]=v; }catch{} }
function esc(s){ return String(s??'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function fmt(n, d=1){
  if(n==null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits:d, maximumFractionDigits:d });
}
function fmtPct(n, d=1){
  if(n==null || !Number.isFinite(Number(n))) return '—';
  return fmt(n,d) + '%';
}
function clsDelta(x){ if(x==null || !Number.isFinite(x)) return 'neu'; return x>0?'up':(x<0?'down':'neu'); }

function isoDayBRT(isoOrDate){
  // BRT = UTC-3 (fixed offset; good enough for Brazil). Use to bucket days consistently.
  const dt = (isoOrDate instanceof Date) ? isoOrDate : new Date(isoOrDate);
  const t = dt.getTime() - 3*3600*1000;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,'0');
  const dd = String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}
function parseReviewISO(r){
  // best-effort; google places payloads can vary
  const s = r?.publishTime || r?.time || r?.relative_time_description || r?.publishedAt || r?.date || r?.iso || r?.dateISO;
  if(!s) return null;
  // if numeric epoch seconds
  if(typeof s === 'number'){
    const ms = (s < 2e10) ? (s*1000) : s;
    return new Date(ms).toISOString();
  }
  const t = String(s);
  // many payloads include ISO already
  if(/\d{4}-\d{2}-\d{2}T/.test(t)) return t;
  // fallback: try Date parse
  const d = new Date(t);
  if(!isNaN(d.getTime())) return d.toISOString();
  return null;
}

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

function pickAiSample(all7, maxPerSide=90){
  // keep prompts small: pick recent reviews, truncate text.
  const items = all7
    .filter(r=>r.text && String(r.text).trim().length >= 10 && r.rating!=null)
    .sort((a,b)=> (a.iso>b.iso?-1:1));

  const pos = items.filter(r=>r.rating>=4).slice(0,maxPerSide);
  const neg = items.filter(r=>r.rating<=2).slice(0,maxPerSide);

  function pack(r){
    const t = String(r.text||'').replace(/\s+/g,' ').trim().slice(0,260);
    return { rating: r.rating, hospital: r.hospital, text: t };
  }
  return { pos: pos.map(pack), neg: neg.map(pack) };
}

async function computeTopicsAI(all7){
  const cacheKey = 'reviewsdash_topics_ai_v1';
  const now = Date.now();
  try{
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if(cached && (now-cached.ts) < 10*60*1000 && cached.data) return cached.data;
  }catch{}

  const sample = pickAiSample(all7);
  if(sample.pos.length < 3 && sample.neg.length < 3) return null;

  const prompt = `Você é um analista de reviews (Google) para hospitais. Extraia os principais MOTIVOS mencionados nos reviews, separando positivos e negativos.

Regras:
- Retorne APENAS JSON válido, sem markdown.
- Estrutura:
  {"positivos":[{"motivo":"...","n":12}],"negativos":[{"motivo":"...","n":9}]}
- "motivo" deve ser curto (2 a 5 palavras) e em PT-BR.
- n = contagem aproximada dentro do conjunto fornecido.
- Máx 8 motivos em cada lista.
- Não cite nomes de pessoas.

REVIEWS POSITIVOS (amostra):
${sample.pos.map(x=>`- (${x.rating}★) ${x.text}`).join('\n')}

REVIEWS NEGATIVOS (amostra):
${sample.neg.map(x=>`- (${x.rating}★) ${x.text}`).join('\n')}`;

  try{
    const ai = await fetch('./data/report90.json', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({ prompt })
    }).then(r=>r.json());

    const raw = String(ai?.resposta || '').trim();
    if(!raw) return null;
    const data = JSON.parse(raw);
    if(!data || typeof data !== 'object') return null;

    try{ localStorage.setItem(cacheKey, JSON.stringify({ ts: now, data })); }catch{}
    return data;
  }catch{
    return null;
  }
}

function hasAny(text, words){
  const s = String(text||'').toLowerCase();
  if(!s) return false;
  return words.some(w => s.includes(w));
}

function flattenHospitals(payload, nameMap){
  // Accept both unified and dash-lite shapes.
  const hs = payload?.hospitals || payload?.items || payload?.all14 || payload?.data?.hospitals || [];

  const byPlaceId = (nameMap && typeof nameMap === 'object' && nameMap.byPlaceId && typeof nameMap.byPlaceId === 'object') ? nameMap.byPlaceId : {};
  const byName = (nameMap && typeof nameMap === 'object' && nameMap.byName && typeof nameMap.byName === 'object') ? nameMap.byName : {};

  function cleanName(placeId, raw){
    const pid = placeId ? String(placeId).trim() : '';
    if(pid && byPlaceId[pid]) return String(byPlaceId[pid]);
    const rn = raw ? String(raw).trim() : '';
    if(rn && byName[rn]) return String(byName[rn]);
    return raw || '—';
  }

  const out = [];
  for(const h of hs){
    const placeId = h?.placeId || h?.place_id || null;
    const rawName = h?.name || h?.hospital || '—';
    const name = cleanName(placeId, rawName);
    const reviews = Array.isArray(h?.reviews) ? h.reviews : Array.isArray(h?.review) ? h.review : [];
    const rating = (h?.rating!=null && Number.isFinite(Number(h.rating))) ? Number(h.rating) : null;
    const reviewsCount = (h?.reviewsCount!=null && Number.isFinite(Number(h.reviewsCount))) ? Number(h.reviewsCount) : null;
    const normalizedReviews = reviews.map(r=>({
      ...r,
      iso: r.iso || r.publishTime || r.publish_time || r.date || r.createdAt || r.created_at || (r.publishTimeMs != null ? Number(r.publishTimeMs) : null) || r.publish_time_ms || null,
    }));
    out.push({ name, placeId, rating, reviewsCount, reviews: normalizedReviews });
  }
  return out;
}

function computeAll(hospitals){
  const all=[];
  for(const h of hospitals){
    for(const r of (h.reviews||[])){
      const rating = Number(r.rating);
      const iso = parseReviewISO(r);
      if(!iso) continue;
      all.push({
        hospital: h.name,
        placeId: h.placeId,
        hospitalRating: (h.rating!=null && Number.isFinite(Number(h.rating))) ? Number(h.rating) : null,
        hospitalReviewsCount: (h.reviewsCount!=null && Number.isFinite(Number(h.reviewsCount))) ? Number(h.reviewsCount) : null,
        author: r.author || r.user || r.profile || null,
        rating: Number.isFinite(rating)?rating:null,
        text: r.text || r.original_text || '',
        iso,
      });
    }
  }
  all.sort((a,b)=> (a.iso<b.iso?-1:1));
  return all;
}

function lastNDays(all, n){
  const now = new Date();
  const since = new Date(now.getTime() - n*24*3600*1000);
  return all.filter(x=> new Date(x.iso) >= since);
}

function buildDailyTrend(all, days=15){
  // Anchor the window on the latest available review day (BRT) to avoid "wrong today" when the report runs near midnight.
  let end = null;
  for(const r of (all||[])){
    if(!r.iso) continue;
    const k = isoDayBRT(r.iso);
    if(!end || k > end) end = k;
  }
  if(!end){
    end = isoDayBRT(new Date());
  }

  const [Y,M,D] = end.split('-').map(Number);
  const endDate = new Date(Date.UTC(Y, M-1, D));
  const startDate = new Date(endDate.getTime() - (days-1)*24*3600*1000);

  const keys=[];
  for(let i=0;i<days;i++){
    const d = new Date(startDate.getTime() + i*24*3600*1000);
    const k = d.toISOString().slice(0,10);
    keys.push(k);
  }

  const map = new Map(keys.map(k=>[k,{ day:k, n:0, sum:0 }]));

  for(const r of (all||[])){
    const day = isoDayBRT(r.iso);
    const row = map.get(day);
    if(!row) continue;
    row.n += 1;
    if(r.rating != null && Number.isFinite(r.rating) && r.rating>0) row.sum += r.rating;
  }

  return keys.map(k=>{
    const x = map.get(k);
    return { day: x.day, volume: x.n, avg: x.n ? (x.sum/x.n) : null };
  });
}

function computeTopics(all7){
  const stats = TOPICS.map(t=>({ ...t, n:0, sum:0, avg:null }));
  for(const r of all7){
    const rating = (r.rating!=null && Number.isFinite(r.rating)) ? r.rating : null;
    for(const st of stats){
      if(hasAny(r.text, st.words)){
        st.n += 1;
        if(rating!=null) st.sum += rating;
      }
    }
  }
  for(const st of stats){ st.avg = st.n ? (st.sum/st.n) : null; }
  const ranked = stats.filter(x=>x.n>0).sort((a,b)=>b.n-a.n);
  const pos = ranked.filter(x=>x.avg!=null && x.avg >= 4).slice(0,6);
  const neg = ranked.filter(x=>x.avg!=null && x.avg < 3).slice(0,6);
  return { pos, neg };
}

function topicCls(avg){
  if(avg==null) return 'mid';
  if(avg >= 4) return 'pos';
  if(avg >= 3) return 'mid';
  return 'neg';
}

function computeMovers(all){ dbg('computeMovers_start', all?.length || 0);
  // Compare last 7 days vs the hospital's overall rating (Google/Places).
  const now = new Date();
  const a0 = new Date(now.getTime() - 7*24*3600*1000);

  const by = new Map();
  for(const r of all){
    const d = new Date(r.iso);
    if(d < a0 || d >= now) continue;
    if(r.rating==null) continue;
    const key = r.hospital;
    const cur = by.get(key) || { n:0, sum:0, base: r.hospitalRating };
    cur.n += 1; cur.sum += r.rating;
    if(cur.base==null && r.hospitalRating!=null) cur.base = r.hospitalRating;
    by.set(key, cur);
  }

  let rows=[];
  for(const [name,c] of by.entries()){
    const avg7d = c.n ? (c.sum/c.n) : null;
    const base = (c.base!=null && Number.isFinite(Number(c.base))) ? Number(c.base) : null;
    if(avg7d==null || base==null) continue;
    const delta = avg7d - base;
    rows.push({ name, delta, cAvg: avg7d, base, cN:c.n });
  }

  rows.sort((a,b)=>b.delta-a.delta);
  const up = rows.slice(0,5);
  const down = rows.slice(-5).reverse();
  dbg('computeMovers_done', { up: up.length, down: down.length, rows: rows.length });
  return { up, down };
}

function renderTyphoon(all, baseline){ dbg('renderTyphoon_start', { all: all?.length || 0, baseline });
  const el = document.getElementById('typhoonChart');
  if(!el){ dbg('renderTyphoon_noEl', true); return; }

  // Typhoon compares the hospital's overall rating (Google/Places) vs network baseline.
  // delta = hospitalRating - baseline
  const by = new Map();
  for(const r of all){
    const key = r.hospital;
    const base = (r.hospitalRating!=null && Number.isFinite(Number(r.hospitalRating))) ? Number(r.hospitalRating) : null;
    const cnt = (r.hospitalReviewsCount!=null && Number.isFinite(Number(r.hospitalReviewsCount))) ? Number(r.hospitalReviewsCount) : null;
    const cur = by.get(key) || { base:null, reviewsCount:null };
    if(cur.base==null && base!=null) cur.base = base;
    if(cur.reviewsCount==null && cnt!=null) cur.reviewsCount = cnt;
    by.set(key, cur);
  }
  if(!by.size){
    const alt = new Map();
    for(const r of all){
      const key = r.hospital;
      const base = (r.hospitalRating!=null && Number.isFinite(Number(r.hospitalRating))) ? Number(r.hospitalRating) : null;
      const cur = alt.get(key) || { base:null, reviewsCount:null };
      if(cur.base==null && base!=null) cur.base = base;
      alt.set(key, cur);
    }
    if(!alt.size) return;
    const rows=[];
    for(const [name,v] of alt.entries()){
      if(v.base==null || baseline==null) continue;
      rows.push({ name, base:v.base, delta:v.base-baseline, n:v.reviewsCount });
    }
    rows.sort((a,b)=>a.delta-b.delta);
    const neg = rows.slice(0,10);
    const pos = rows.slice(-10);
    const combined = neg.concat(pos);
    if(!combined.length){ dbg('renderTyphoon_noCombined', true); return; }
  }

  const rows=[];
  for(const [name,v] of by.entries()){
    const base = v.base;
    if(base==null || baseline==null) continue;
    const delta = base - baseline;
    rows.push({ name, base, delta, n: v.reviewsCount });
  }

  rows.sort((a,b)=>a.delta-b.delta);
  const neg = rows.slice(0,10);
  const pos = rows.slice(-10);
  const combined = neg.concat(pos);

  dbg('renderTyphoon_combined', combined.length);
  const fullLabels = combined.map(x=>x.name);
  const data = combined.map(x=>Number(x.delta.toFixed(4)));
  const meta = combined.map(x=>({ name:x.name, base:x.base, n:x.n, delta:x.delta }));

  function syncTyphoonRatings(chart){
    const ratingsEl = document.getElementById('typhoonRatings');
    if(!ratingsEl || !chart) return;

    const meta0 = chart.getDatasetMeta(0);
    const bars = meta0?.data || [];

    // Make container match canvas height so absolute positioning aligns.
    const canvas = chart.canvas;
    if(canvas){
      ratingsEl.style.height = canvas.clientHeight + 'px';
    }

    ratingsEl.innerHTML = '';
    for(let i=0;i<meta.length;i++){
      const m = meta[i];
      const bar = bars[i];
      if(!bar) continue;

      const y = bar.y; // canvas pixel coords
      const b = (m.base!=null && Number.isFinite(Number(m.base))) ? fmt(Number(m.base),2)+'★' : '—';
      const n = (m.n!=null && Number.isFinite(Number(m.n))) ? String(m.n) : '';

      const row = document.createElement('div');
      row.className = 'tyRpos';
      row.style.top = y + 'px';
      row.innerHTML = `${esc(b)}${n?`<span class="n">(${esc(n)})</span>`:''}`;
      ratingsEl.appendChild(row);
    }
  }

  const isIphone = (typeof window !== 'undefined') && window.matchMedia && window.matchMedia('(max-width: 520px)').matches;
  function shortLabel(s){
    const t = String(s||'').trim();
    if(!isIphone) return t;
    if(t.length <= 18) return t;
    return t.slice(0,16).trimEnd() + '…';
  }
  const labels = fullLabels.map(shortLabel);

  // scale: use sample min/max with fixed padding (more sensitive)
  const minV = Math.min(...data);
  const maxV = Math.max(...data);
  let xMin = minV - 0.2;
  let xMax = maxV + 0.2;
  if(!Number.isFinite(xMin) || !Number.isFinite(xMax)) { xMin = -0.2; xMax = 0.2; }
  if(xMin === xMax){ xMin -= 0.2; xMax += 0.2; }
  // keep nice-ish decimals
  xMin = Math.floor(xMin*100)/100;
  xMax = Math.ceil(xMax*100)/100;

  const baseTxt = (baseline!=null && Number.isFinite(Number(baseline)))
    ? Number(baseline).toLocaleString('pt-BR',{maximumFractionDigits:2, minimumFractionDigits:2})+'★'
    : '—';

  const ctx = el.getContext('2d');
  if(typhoonChart){
    typhoonChart.data.labels = labels;
    typhoonChart.data.datasets[0].data = data;
    typhoonChart.options.scales.x.min = xMin;
    typhoonChart.options.scales.x.max = xMax;
    if(typhoonChart.options.scales.x.title) typhoonChart.options.scales.x.title.text = `Média geral (rede): ${baseTxt}`;
    typhoonChart.update();
    try{ typhoonChart.resize(); }catch{}
    // align ratings after render
    requestAnimationFrame(()=>syncTyphoonRatings(typhoonChart));
    return;
  }

  typhoonChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Δ vs média geral',
        data,
        borderWidth: 0,
        backgroundColor: (ctx)=>{
          const v = ctx.raw;
          if(v < 0) return 'rgba(239,68,68,0.35)';
          if(v > 0) return 'rgba(34,197,94,0.35)';
          return 'rgba(148,163,184,0.25)';
        },
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { onComplete: ()=>{ try{ syncTyphoonRatings(typhoonChart); }catch{} } },
      plugins: {
        legend: { display:false },
        tooltip: {
          callbacks: {
            title: (items)=>{
              const i = items?.[0]?.dataIndex;
              const m = (i!=null) ? meta[i] : null;
              return m?.name ? String(m.name) : '';
            },
            label: (ctx)=>{
              const i = ctx.dataIndex;
              const m = meta[i];
              if(!m) return '';
              const d = Number(m.delta).toLocaleString('pt-BR',{maximumFractionDigits:2, minimumFractionDigits:2});
              const b = Number(m.base).toLocaleString('pt-BR',{maximumFractionDigits:2, minimumFractionDigits:2});
              const n = (m.n!=null && Number.isFinite(Number(m.n))) ? Number(m.n).toLocaleString('pt-BR') : '—';
              return `Δ ${d}★ · rating ${b}★ · n ${n}`;
            }
          }
        }
      },
      scales: {
        y: {
          border: { display: false, width: 0 },
          ticks: {
            font:{ family:'DM Mono', size: isIphone ? 9 : 10 },
            color:'rgba(17,24,39,0.78)',
            autoSkip: false,
            callback: function(v, idx){
              // ensure we display the (possibly truncated) label
              const lab = (this.getLabelForValue ? this.getLabelForValue(v) : labels[idx]) || labels[idx] || '';
              return lab;
            }
          },
          grid: { display:false, drawBorder:false },
        },
        x: {
          min: xMin,
          max: xMax,
          title: {
            display: true,
            text: `Média geral (rede): ${baseTxt}`,
            color: 'rgba(107,114,128,0.92)',
            font: { family:'DM Mono', size: 11, weight: '600' },
            padding: { top: 6 },
          },
          grid: {
            // Hide the leftmost gridline (it looks like a border between labels and bars)
            color: (c)=> {
              if(c.tick && c.tick.value === xMin) return 'rgba(0,0,0,0)';
              return (c.tick.value===0 ? 'rgba(10,44,110,0.55)' : 'rgba(148,163,184,0.14)');
            },
            lineWidth: (c)=> {
              if(c.tick && c.tick.value === xMin) return 0;
              return (c.tick.value===0 ? 2 : 1);
            },
          },
          ticks: {
            display: false,
          }
        }
      }
    }
  });

  // ensure ratings render even when animations are disabled / first paint
  requestAnimationFrame(()=>syncTyphoonRatings(typhoonChart));
}

function computeKPIs(all){
  // ranking geral: média dos ratings do Google por hospital (Places)
  // Prefer weighted avg by reviewsCount when available; fallback to simple avg.
  const byHosp = new Map();
  for(const r of (all||[])){
    const key = String(r.placeId || r.hospital || '').trim();
    if(!key) continue;
    const hr = (r.hospitalRating!=null && Number.isFinite(Number(r.hospitalRating))) ? Number(r.hospitalRating) : null;
    const hc = (r.hospitalReviewsCount!=null && Number.isFinite(Number(r.hospitalReviewsCount))) ? Number(r.hospitalReviewsCount) : null;
    const cur = byHosp.get(key) || { rating:null, count:null };
    if(cur.rating==null && hr!=null) cur.rating = hr;
    if(cur.count==null && hc!=null) cur.count = hc;
    byHosp.set(key, cur);
  }

  const hospArr = Array.from(byHosp.values()).filter(x=>x.rating!=null);
  let baseline = null;
  const weightedOk = hospArr.some(x=>x.count!=null && x.count>0);
  if(hospArr.length){
    if(weightedOk){
      let wSum=0, w=0;
      for(const h of hospArr){
        const c = (h.count!=null && h.count>0) ? h.count : 0;
        if(!c) continue;
        wSum += h.rating * c;
        w += c;
      }
      baseline = w ? (wSum / w) : (hospArr.reduce((s,x)=>s+x.rating,0) / hospArr.length);
    } else {
      baseline = hospArr.reduce((s,x)=>s+x.rating,0) / hospArr.length;
    }
  }

  // média 7d e variação vs 7d anterior
  const all7 = lastNDays(all, 7).filter(r=>r.rating!=null);
  const all14 = lastNDays(all, 14).filter(r=>r.rating!=null);
  const all15 = lastNDays(all, 15).filter(r=>r.rating!=null);
  const cut = new Date(Date.now() - 7*24*3600*1000);
  const prev7 = all14.filter(x=> new Date(x.iso) < cut);

  const avg7 = all7.length ? (all7.reduce((s,r)=>s+r.rating,0)/all7.length) : null;
  const avg15 = all15.length ? (all15.reduce((s,r)=>s+r.rating,0)/all15.length) : null;
  const avgPrev7 = prev7.length ? (prev7.reduce((s,r)=>s+r.rating,0)/prev7.length) : null;
  // delta vs ranking geral (baseline)
  const delta7 = (avg7!=null && baseline!=null) ? (avg7-baseline) : null;

  // rankText: formatted baseline for display
  const rankText = (baseline!=null && Number.isFinite(baseline)) ? ('★' + fmt(baseline, 2)) : null;

  // movers (hospital)
  const movers = computeMovers(all);
  const topMove = movers.up[0];
  const worstMove = movers.down[0];

  // volume 7d vs prev7d
  const v7 = all7.length;
  const vPrev = prev7.length;
  const vDelta = vPrev ? ((v7/vPrev - 1)*100) : null;

  return { baseline, rankText, avg7, avg15, avgPrev7, delta7, topMove, worstMove, v7, vPrev, vDelta };
}

function computeS3S4_90d(all){
  const since = Date.now() - 90*24*3600*1000;
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
    'gestante','gestantes','gravida','grávida','gravidas','grávidas','bebe','bebê','bebes','bebês','parto','partos','uti',
  ].map(norm);

  const FIN = [
    'cobranca','cobrança','fatura','reembolso','preco','preço','valor','caro','barato','plano','convenio','convênio','pagamento','cartao','cartão'
  ].map(norm);

  function termRe(term){
    const esc = String(term||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'iu');
  }
  function hasAnyTerms(text, arr){
    for(const a of arr){
      if(termRe(a).test(text)) return true;
    }
    return false;
  }
  function tagsHit(text, arr){
    const hits=[];
    for(const a of arr){ if(termRe(a).test(text)) hits.push(a); }
    return Array.from(new Set(hits));
  }

  const out=[];
  const seen = new Set();
  for(const r of (all||[])){
    if(!r.iso) continue;
    const tms = Date.parse(r.iso);
    if(!Number.isFinite(tms) || tms < since) continue;
    const stars = Number(r.rating);
    if(!(stars===1 || stars===2)) continue;
    const textRaw = String(r.text||'').replace(/\s+/g,' ').trim();
    const text = norm(textRaw);
    if(text.length < 20) continue;

    const isS4 = hasAnyTerms(text, S4);
    const isS3 = (!isS4) && hasAnyTerms(text, S3);
    if(!isS4 && !isS3) continue;

    // ignore financial-only
    if(hasAny(text, FIN) && !(isS4 || isS3)) continue;

    const sev = isS4 ? 'S4' : 'S3';
    const tags = isS4 ? tagsHit(text, S4) : tagsHit(text, S3);

    const d = new Date(tms - 3*3600*1000); // BRT
    const dtTxt = d.toLocaleString('pt-BR',{ day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

    // De-dupe (rawId preferred) to prevent repeated cases in the report.
    const dedupeKey = String(r.rawId || '') || `${String(r.hospital||'')}\u0000${String(r.author||'')}\u0000${tms}\u0000${textRaw}`;
    if(seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({
      sev,
      tms,
      dtTxt,
      rating: stars,
      hospital: r.hospital,
      author: r.author ? String(r.author).trim() : '',
      tags,
      text: textRaw,
    });
  }

  out.sort((a,b)=>{
    if(a.sev!==b.sev) return a.sev==='S4' ? -1 : 1;
    return b.tms - a.tms;
  });

  return out;
}

function renderReport90(all){
  const el = document.getElementById('report90');
  if(!el){ dbg('renderTyphoon_noEl', true); return; }

  const rows = computeS3S4_90d(all);
  const s4 = rows.filter(x=>x.sev==='S4');
  const s3 = rows.filter(x=>x.sev==='S3');

  // concentration
  const by = new Map();
  for(const r of rows){
    const k = r.hospital || '—';
    const cur = by.get(k) || {S4:0,S3:0};
    cur[r.sev] = (cur[r.sev]||0) + 1;
    by.set(k, cur);
  }
  const rank = Array.from(by.entries()).sort((a,b)=>{
    const sa = (a[1].S4*1000 + a[1].S3);
    const sb = (b[1].S4*1000 + b[1].S3);
    if(sa!==sb) return sb-sa;
    return a[0].localeCompare(b[0]);
  });

  function topHospTable(limit=12){
    const rows = rank.slice(0,limit);
    if(!rows.length) return '<div class="meta">—</div>';
    return `
      <table>
        <thead><tr><th>Hospital</th><th style="text-align:right">S4</th><th style="text-align:right">S3</th></tr></thead>
        <tbody>
          ${rows.map(([h,c])=>`<tr><td title="${esc(h)}">${esc(h)}</td><td style="text-align:right">${c.S4||0}</td><td style="text-align:right">${c.S3||0}</td></tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  function caseBlock(x, idx){
    const id = `${x.sev}-${String(idx).padStart(2,'0')}`;
    const tg = (x.tags && x.tags.length) ? x.tags.join(', ') : '—';
    const who = x.author ? ` · ${esc(x.author)}` : '';
    const head = `${id} · ${esc(x.dtTxt)} · ${esc(String(x.rating))}★`;
    const sub = `${esc(x.hospital||'—')}${who} · tags: ${esc(tg)}`;
    return `
      <div class="caseOpen">
        <div class="caseHeadRow">
          <div class="caseLeft">
            <div class="caseTitle">${head}</div>
            <div class="caseSub">${sub}</div>
          </div>
          <div class="caseMeta">
            <span class="badge ${x.sev==='S4'?'s4':'s3'}">${esc(x.sev)}</span>
          </div>
        </div>
        <div class="caseText"><pre>${esc(x.text||'')}</pre></div>
      </div>
    `;
  }

  const html = `
    <div class="reportGrid">
      <div class="reportCard">
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <span class="badge s4">S4: <b>${s4.length}</b></span>
          <span class="badge s3">S3: <b>${s3.length}</b></span>
          <span class="badge">Total: <b>${rows.length}</b></span>
        </div>
        <div style="margin-top:10px; font-size:0.86rem; color: rgba(15,23,42,0.86); line-height:1.28rem;">
          <div style="font-family:var(--mono);font-size:0.68rem;color:var(--text-muted);letter-spacing:0.06em">CONCEITO (BEST‑EFFORT)</div>
          <div style="margin-top:6px">
            <b>S4</b> = sinal de risco extremo (ex.: óbito/morte, sepse, erro grave, agressão/abuso, parada), priorizado para atenção imediata.<br/>
            <b>S3</b> = risco alto / falha assistencial percebida (ex.: infecção, negligência/descaso, gestante/bebê, queda/fratura, sangramento, diagnóstico errado/tardio).<br/>
            Classificação automática por palavras‑chave em reviews 1–2★; pode ter falso‑positivo/falso‑negativo.
          </div>
        </div>
      </div>

      <div class="reportCard">
        <div style="font-family:var(--mono);font-size:0.68rem;color:var(--text-muted);letter-spacing:0.06em">CONCENTRAÇÃO (TOP)</div>
        <div style="margin-top:8px">${topHospTable(10)}</div>
      </div>
    </div>

    <h2 style="margin-top:14px">Casos S4 — texto completo</h2>
    ${s4.length ? s4.map((x,i)=>caseBlock(x,i+1)).join('') : '<div class="meta">Nenhum S4 no período.</div>'}

    <h2 style="margin-top:14px">Casos S3 — texto completo</h2>
    ${s3.length ? s3.map((x,i)=>caseBlock(x,i+1)).join('') : '<div class="meta">Nenhum S3 no período.</div>'}
  `;

  el.innerHTML = html;

  // store plain text for copy
  window.__report90_text = buildReport90Text(rows, rank);
}

/* buildReport90Telegram removed: sharing via file download works better than paste formatting */

function buildReport90Telegram(rows, rank){
  const s4 = rows.filter(x=>x.sev==='S4');
  const s3 = rows.filter(x=>x.sev==='S3');

  const lines=[];
  lines.push('RELATÓRIO 90D — REVIEWS CRÍTICOS');
  lines.push(`S4: ${s4.length} | S3: ${s3.length} | Total: ${rows.length}`);
  lines.push('');

  // Top concentration
  if(rank && rank.length){
    lines.push('CONCENTRAÇÃO (TOP)');
    rank.slice(0,10).forEach(([h,c])=>{
      lines.push(`• ${h} — S4 ${c.S4||0} | S3 ${c.S3||0}`);
    });
    lines.push('');
  }

  function caseLines(x, idx){
    const id = `${x.sev}-${String(idx).padStart(2,'0')}`;
    const who = x.author ? ` — ${x.author}` : '';
    const tg = (x.tags && x.tags.length) ? x.tags.join(', ') : '—';
    lines.push('────────────────────────');
    lines.push(`${id} · ${x.dtTxt} · ${x.rating}★`);
    lines.push(`${x.hospital}${who}`);
    lines.push(`tags: ${tg}`);
    lines.push('');
    lines.push(x.text || '');
    lines.push('');
  }

  lines.push('S4 — TEXTO COMPLETO');
  if(!s4.length) lines.push('Nenhum S4 no período.\n');
  s4.forEach((x,i)=>caseLines(x,i+1));

  lines.push('S3 — TEXTO COMPLETO');
  if(!s3.length) lines.push('Nenhum S3 no período.\n');
  s3.forEach((x,i)=>caseLines(x,i+1));

  return lines.join('\n');
}

function buildReport90Text(rows, rank){
  const s4 = rows.filter(x=>x.sev==='S4');
  const s3 = rows.filter(x=>x.sev==='S3');
  const lines=[];
  lines.push('Relatório Executivo — Reviews Críticos (S3/S4) — últimos 90 dias');
  lines.push('');
  lines.push(`Resumo: S4 ${s4.length} | S3 ${s3.length} | Total ${rows.length}`);
  lines.push('');
  lines.push('Concentração por unidade:');
  for(const [h,c] of rank){
    lines.push(`- ${h}: S4 ${c.S4||0} | S3 ${c.S3||0}`);
  }
  lines.push('');
  lines.push('S4 — texto completo');
  s4.forEach((x,i)=>{
    lines.push('');
    lines.push(`${x.sev}-${String(i+1).padStart(2,'0')} · ${x.dtTxt} · ${x.rating}★ · ${x.hospital}${x.author?(' — '+x.author):''}`);
    lines.push(`tags: ${(x.tags&&x.tags.length)?x.tags.join(', '):'—'}`);
    lines.push(x.text||'');
  });
  lines.push('');
  lines.push('S3 — texto completo');
  s3.forEach((x,i)=>{
    lines.push('');
    lines.push(`${x.sev}-${String(i+1).padStart(2,'0')} · ${x.dtTxt} · ${x.rating}★ · ${x.hospital}${x.author?(' — '+x.author):''}`);
    lines.push(`tags: ${(x.tags&&x.tags.length)?x.tags.join(', '):'—'}`);
    lines.push(x.text||'');
  });
  return lines.join('\n');
}

async function render(all, payloadKpis, payloadTrend15){
  dbg('render_start', { all: all?.length || 0 }); 
  let labels;
  let dataVol;
  let dataAvg;

  // Prefer server-provided 15d trend (source of truth) when available.
  if(payloadTrend15 && Array.isArray(payloadTrend15.labels) && Array.isArray(payloadTrend15.counts) && payloadTrend15.labels.length===payloadTrend15.counts.length && payloadTrend15.labels.length>0){
    labels = payloadTrend15.labels.slice();
    dataVol = payloadTrend15.counts.slice();
    dataAvg = Array.isArray(payloadTrend15.avgs) ? payloadTrend15.avgs.slice() : payloadTrend15.counts.map(()=>null);
  } else {
    const all15 = lastNDays(all, 15);
    const series = buildDailyTrend(all15, 15);
    labels = series.map(x=> x.day.slice(5)); // MM-DD (BRT-bucketed)
    dataVol = series.map(x=>x.volume);
    dataAvg = series.map(x=>x.avg);
  }

  // Hide current day if there are still zero reviews for today.
  // This avoids showing a misleading "0" bar for the ongoing day.
  try{
    const todayIso = isoDayBRT(new Date());
    const todayMD = todayIso.slice(5); // MM-DD
    const [Y,MM,DD] = todayIso.split('-');
    const todayDM = `${DD}/${MM}`; // DD/MM
    const lastIdx = (labels?.length||0) - 1;
    if(lastIdx >= 0){
      const lab = String(labels[lastIdx] ?? '');
      const isToday = (lab === todayIso) || (lab === todayMD) || (lab === todayDM);
      const v = Number(dataVol?.[lastIdx] ?? 0) || 0;
      if(isToday && v === 0){
        labels.pop();
        dataVol.pop();
        if(Array.isArray(dataAvg)) dataAvg.pop();
      }
    }
  }catch{}

  // last tick visibility is handled by ensureLastTick plugin

  const maxVol = Math.max(1, ...dataVol.map(v=>Number(v)||0));
  const yVolMax = maxVol * 3;

  const k = computeKPIs(all);
  // If the server provided precomputed KPIs prefer those for display (fixes cases
  // where the client-side computed "all" is unexpectedly empty). This ensures
  // the volume card shows backend truth when available.
  if(payloadKpis && typeof payloadKpis === "object"){
    if(payloadKpis.v7!=null) k.v7 = payloadKpis.v7;
    if(payloadKpis.vPrev!=null) k.vPrev = payloadKpis.vPrev;
    if(payloadKpis.vDelta!=null) k.vDelta = payloadKpis.vDelta;
    if(payloadKpis.avg7!=null) k.avg7 = payloadKpis.avg7;
    if(payloadKpis.baseline!=null) k.baseline = payloadKpis.baseline;
  }
  if(payloadTrend15 && typeof payloadTrend15 === "object" && payloadTrend15.baseline!=null) k.baseline = payloadTrend15.baseline;
  const baseline = k.baseline;

  if(!chart){
    const ctx = $('complaintsChart').getContext('2d');
    const ensureLastTickPlugin = {
      id: 'ensureLastTick',
      afterBuildTicks(chart, args){
        const scale = args?.scale;
        if(!scale || scale.id !== 'x') return;
        const labels = scale.getLabels ? scale.getLabels() : null;
        if(!labels || !labels.length) return;
        const last = labels.length - 1;
        const ticks = scale.ticks || [];
        const hasLast = ticks.some(t => t && t.value === last);
        if(hasLast) return;
        if(!ticks.length){ scale.ticks = [{ value:last }]; return; }
        ticks[ticks.length-1] = { value:last };
        scale.ticks = ticks;
      }
    };

    const isMobile = (typeof window !== 'undefined') && (window.innerWidth <= 520);
    const padRight = isMobile ? 18 : 40;
    const padBottom = isMobile ? 14 : 18;

    chart = new Chart(ctx, {
      plugins: [lastPointLabelsPlugin, ensureLastTickPlugin],
      data: {
        labels,
        datasets:[
          { type:'bar', label:'Volume (n)', data: dataVol, yAxisID:'yVol', backgroundColor:'rgba(148,163,184,0.22)', borderColor:'rgba(148,163,184,0.35)', borderWidth:1, borderRadius:2, maxBarThickness:18 },
          { type:'line', label:'Nota média (★)', data: dataAvg, yAxisID:'yStar', borderColor:'rgba(245,158,11,0.95)', backgroundColor:'rgba(245,158,11,0.18)', tension:0, spanGaps:true, pointRadius:2, pointHoverRadius:3, borderWidth:2, fill:true },
          { type:'line', label:'Média geral', data: labels.map(()=>baseline), yAxisID:'yStar', spanGaps:true, borderColor:'rgba(148,163,184,0.65)', borderDash:[6,6], pointRadius:0, borderWidth:2 },
        ]
      },
      options: {
        responsive:true,
        maintainAspectRatio:false,
        // extra room so the last x-axis label doesn't get clipped
        layout: { padding: { left: (isMobile ? 8 : 0), right: padRight, bottom: padBottom } },
        plugins:{ legend:{ display:false } },
        scales:{
          x:{
            // Definitive: disable autoSkip and manually choose which labels to render,
            // always including the last available label.
            offset: !isMobile,
            ticks:{
              autoSkip:false,
              maxRotation:0,
              align:'end',
              padding: (isMobile ? 3 : 6),
              callback: function(value, index){
                try{
                  const labels = this?.chart?.data?.labels || [];
                  const n = labels.length;
                  if(!n) return '';
                  const last = n - 1;
                  if(index === 0 || index === 1 || index === last) return labels[index];
                  const maxTicks = isMobile ? 4 : 7;
                  const step = Math.max(1, Math.ceil(last / (maxTicks - 1)));
                  return (index % step === 0) ? labels[index] : '';
                } catch {
                  return '';
                }
              }
            }
          },
          yVol:{ beginAtZero:true, suggestedMax: yVolMax, grid:{ color:'rgba(148,163,184,0.12)' },
            ticks:{
              precision:0,
              font: { size: (isMobile ? 10 : 12) },
              callback: (v)=>{
                const n = Number(v);
                if(!Number.isFinite(n)) return '';
                if(isMobile && n>=1000) return (n/1000).toLocaleString('pt-BR',{maximumFractionDigits:0})+'k';
                return String(n);
              }
            }
          },
          yStar:{ beginAtZero:false, position:'right', grid:{ drawOnChartArea:false }, min: 1, max: 5.5,
            ticks:{
              stepSize: 1,
              font: { size: (isMobile ? 10 : 12) },
              callback:(v)=> (Number(v)%1===0 ? `${Number(v)}★` : ''),
            }
          },
        }
      }
    });
  } else {
    chart.data.labels = labels;
    chart.data.datasets[0].data = dataVol;
    chart.data.datasets[1].data = dataAvg;
    chart.data.datasets[2].data = labels.map(()=>baseline);
    // keep yVol scaled to 3x the sample max
    if(chart.options?.scales?.yVol) chart.options.scales.yVol.suggestedMax = yVolMax;
    chart.update();
  dbg('render_done', { topics: !!topicsBox, movers: !!moversBox, comments: !!commentsBox });
  }

  const all7 = lastNDays(all, 7);
  const all30 = lastNDays(all, 30);
  const topicsBox = $('topicsBox');


  // Try AI topics first (better coverage). Fallback to keyword topics.
  const aiTopics = (typeof location !== 'undefined' && /(^|\.)openclaw-control-ui$/.test(location.hostname)) ? null : await computeTopicsAI(all7);
  if(aiTopics && (Array.isArray(aiTopics.positivos) || Array.isArray(aiTopics.negativos))){
    function listBlock(title, arr, cls){
      const a = Array.isArray(arr) ? arr : [];
      if(!a.length) return '';
      return `<div style="font-family:var(--mono);font-size:0.68rem;color:var(--text-muted);margin-bottom:6px">${esc(title)}</div>`
        + a.slice(0,5).map(x=>{
          const m = String(x?.motivo||'').trim();
          const n = Number(x?.n);
          if(!m) return '';
          const pill = Number.isFinite(n) ? `${n}` : '·';
          return `<div class="topicRow">
            <div class="topicName">${esc(m)}</div>
            <div class="topicMeta"><span class="pill ${cls}">${pill}</span></div>
          </div>`;
        }).join('');
    }

    const html = [
      listBlock('PRINCIPAIS MOTIVOS — POSITIVOS', (aiTopics.positivos||[]).slice(0,5), 'pos'),
      ((aiTopics.positivos||[]).length && (aiTopics.negativos||[]).length) ? '<div style="height:10px"></div>' : '',
      listBlock('PRINCIPAIS MOTIVOS — NEGATIVOS', (aiTopics.negativos||[]).slice(0,5), 'neg'),
    ].join('');

    topicsBox.innerHTML = html || '<div class="placeholder">Sem motivos (amostra insuficiente).</div>';
  } else {
    const topics = computeTopics(all7);
    const topics30 = computeTopics(all30);
    const topicsAny = computeTopics(all.length ? all : all30);

    function block(title, arr){
      if(!arr.length) return '';
      return `<div style="font-family:var(--mono);font-size:0.68rem;color:var(--text-muted);margin-bottom:6px">${esc(title)}</div>`
        + arr.map(t=>{
          const c = topicCls(t.avg);
          return `<div class="topicRow">
            <div class="topicName">${esc(t.label)}</div>
            <div class="topicMeta"><span class="pill ${c}">${t.n} · ${t.avg!=null?('★'+fmt(t.avg,1)):'—'}</span></div>
          </div>`;
        }).join('');
    }

    const html = [
      block('POSITIVOS', topics.pos||topics30.pos||topicsAny.pos||[]),
      ((topics.pos?.length || topics30.pos?.length || topicsAny.pos?.length) && (topics.neg?.length || topics30.neg?.length || topicsAny.neg?.length)) ? '<div style="height:10px"></div>' : '',
      block('NEGATIVOS', topics.neg||topics30.neg||topicsAny.neg||[]),
    ].join('');

    topicsBox.innerHTML = html || `<div class="placeholder">Sem menções nos últimos 7 dias. (${topics.pos?.length||0}/${topics.neg?.length||0})</div>`;
  }

  const { up, down } = computeMovers(all);
  const moversBox = $('moversBox');

  function rowHtml(x, cls7d){
    const avg7 = (x.cAvg!=null) ? `${fmt(x.cAvg,2)}★` : '—';
    const base = (x.base!=null) ? `${fmt(x.base,2)}★` : '—';
    const vol = (x.cN!=null) ? String(x.cN) : '—';
    return `<tr>
      <td class="name-cell" title="${esc(x.name)}">${esc(x.name)}</td>
      <td style="text-align:right" class="${cls7d||''}">${avg7}</td>
      <td style="text-align:right">${base}</td>
      <td style="text-align:right">${vol}</td>
    </tr>`;
  }

  function tableBlock(title, arr, cls7d){
    const body = arr.length ? arr.map(x=>rowHtml(x, cls7d)).join('') : `<tr><td colspan="4" style="color:var(--text-muted)">—</td></tr>`;
    return `
      <div style="font-family:var(--mono);font-size:0.68rem;color:var(--text-muted);margin-bottom:6px">${esc(title)}</div>
      <table class="mkTableTight" style="table-layout:fixed">
        <thead>
          <tr>
            <th style="width:46%">Hospital</th>
            <th style="width:18%;text-align:right">7d</th>
            <th style="width:18%;text-align:right">Hist</th>
            <th style="width:18%;text-align:right">Vol7d</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `;
  }

  moversBox.innerHTML = `
    <div>
      ${tableBlock('TOP 5 MELHORAS', up, 'mkUp')}
      <div style="height:10px"></div>
      ${tableBlock('TOP 5 QUEDAS', down, 'mkDown')}
    </div>
  `;

  // Comments scroller (bottom-left)
  const commentsBox = $('commentsBox');
  if(commentsBox){
    // De-dupe to avoid repeated comments in the scroller (rawId preferred).
    const seenC = new Set();
    const items = (all7.length ? all7 : all30.length ? all30 : all)
      .filter(r=>r.text && String(r.text).trim().length >= 10 && r.rating!=null)
      .filter(r=>{
        const k = String(r.rawId || '')
          || `${String(r.hospital||'')} ${String(r.author||'')} ${String(r.iso||'')} ${String(r.text||'')}`;
        if(!k || seenC.has(k)) return false;
        seenC.add(k);
        return true;
      })
      .sort((a,b)=> (a.iso>b.iso?-1:1));

    const pos = items.filter(r=>r.rating>=4).slice(0,18);
    const neg = items.filter(r=>r.rating<=2).slice(0,18);

    function starStr(n){
      const k = Math.max(1, Math.min(5, Number(n)||0));
      return '★'.repeat(k) + '☆'.repeat(5-k);
    }
    function starCls(n){
      const k = Math.max(1, Math.min(5, Math.round(Number(n)||0)));
      return 's'+k;
    }
    const CRIT_TERMS = {
      s4: [
        'óbito','obito','morte','morreu','falecimento',
        'sepse','septicemia',
        'erro médico','erro medico',
        'medicação errada','medicacao errada','dose errada','troca de medicamento',
        'cirurgia errada','anestesia',
        'omissão de socorro','omissao de socorro',
        'parada','intubação','intubacao',
        'agressão','agressao','ameaça','ameaca','assédio','assedio','abuso',
      ],
      s3: [
        'infecção hospitalar','infeccao hospitalar','infecção','infeccao',
        'negligência','negligencia','imperícia','impericia','imprudência','imprudencia',
        'descaso',
        'queda','fratura','lesão','lesao',
        'sangramento','hemorragia','hemorrag',
        'diagnóstico errado','diagnostico errado','diagnóstico tardio','diagnostico tardio',
        'gestante','gestantes','grávida','gravida','grávidas','gravidas','bebê','bebe','bebês','bebes','parto','partos','uti',
      ],
      s2: [
        'vômito','vomito','febre','falta de ar','saturação','saturacao',
        'sem medicação','sem medicacao','sem atendimento',
        'grave','gravidade',
      ],
      s1: [
        'demora','atraso','espera','fila',
        'grosseiro','grosseira','rude',
        'revolta',
      ],
    };

    function highlightCritical(raw){
      const text = String(raw||'');

      const terms = [
        ...CRIT_TERMS.s4.map(t=>({sev:'s4', t})),
        ...CRIT_TERMS.s3.map(t=>({sev:'s3', t})),
        ...CRIT_TERMS.s2.map(t=>({sev:'s2', t})),
        ...CRIT_TERMS.s1.map(t=>({sev:'s1', t})),
      ];

      const norm = (s)=> String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
      const termMap = new Map(terms.map(x=>[norm(x.t), x.sev]));
      // match whole words/phrases only (avoid highlighting inside other words, e.g. "uti" inside "constitui")
      const pats = Array.from(new Set(terms.map(x=>x.t)))
        .sort((a,b)=> b.length - a.length)
        .map(s=> s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))
        .join('|');

      if(!pats) return esc(text);
      const re = new RegExp(`(?<![\\p{L}\\p{N}])(${pats})(?![\\p{L}\\p{N}])`, 'giu');

      let out='';
      let last=0;
      for(;;){
        const m = re.exec(text);
        if(!m) break;
        const i = m.index;
        const hit = m[0];
        out += esc(text.slice(last, i));
        const sev = termMap.get(norm(hit)) || 's1';
        out += `<span class="crit ${sev}">${esc(hit)}</span>`;
        last = i + hit.length;
      }
      out += esc(text.slice(last));
      return out;
    }

    function cmt(r){
      const t = String(r.text||'').replace(/\s+/g,' ').trim();
      const who = r.author ? String(r.author).trim() : '';
      const d = r.iso ? new Date(r.iso) : null;
      const dTxt = (d && !isNaN(d.getTime())) ? d.toLocaleDateString('pt-BR',{ day:'2-digit', month:'2-digit' }) : '';
      const whoLine = [who, dTxt].filter(Boolean).join(' · ');
      return `<div class="cmt">
        <div class="cmtTop">
          <div class="cmtHosp">${esc(r.hospital)}</div>
          <div class="cmtStar"><span class="stars ${starCls(r.rating)}">${starStr(r.rating)}</span></div>
        </div>
        ${whoLine ? `<div class="cmtWho">${esc(whoLine)}</div>` : ''}
        <div class="cmtText">${highlightCritical(t)}</div>
      </div>`;
    }

    // duplicate tracks for seamless scroll
    const posHtml = pos.map(cmt).join('');
    const negHtml = neg.map(cmt).join('');

    // S3/S4 (24h) — show ALL detected critical items to match the risk siren.
    function norm24(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
    function tagsHit24(text, terms){
      const t = norm24(text);
      const out=[];
      for(const w of terms){
        const k = norm24(w);
        if(k && t.includes(k)) out.push(w);
      }
      return Array.from(new Set(out));
    }

    const since24 = Date.now() - 24*3600*1000;
    const seen24 = new Set();
    const crit24 = [];
    for(const r of (all||[])){
      if(!r.iso) continue;
      const tms = Date.parse(r.iso);
      if(!Number.isFinite(tms) || tms < since24) continue;
      const stars = Number(r.rating);
      if(!(stars===1 || stars===2)) continue;
      const text = String(r.text||'');
      if(norm24(text).length < 20) continue;

      const k = String(r.rawId || '') || `${String(r.hospital||'')}\0${String(r.author||'')}\0${String(r.iso||'')}\0${text}`;
      if(!k || seen24.has(k)) continue;
      seen24.add(k);

      const nt = norm24(text);
      const isS4 = CRIT_TERMS.s4.map(norm24).some(w=> w && nt.includes(w));
      const isS3 = (!isS4) && CRIT_TERMS.s3.map(norm24).some(w=> w && nt.includes(w));
      if(!isS4 && !isS3) continue;

      const sev = isS4 ? 'S4' : 'S3';
      const d = new Date(r.iso);
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const hh = String(d.getHours()).padStart(2,'0');
      const mi = String(d.getMinutes()).padStart(2,'0');
      const dtTxt = `${dd}/${mm} ${hh}:${mi}`;
      const who = r.author ? String(r.author).trim() : '';
      const whoInit = who ? (who[0].toUpperCase()+'.') : '';
      const snip = text.replace(/\s+/g,' ').trim().slice(0,220);
      const tags = tagsHit24(text, isS4 ? CRIT_TERMS.s4 : CRIT_TERMS.s3).slice(0,5);
      crit24.push({ sev, tms, dtTxt, stars, hospital: r.hospital, whoInit, tags, snip });
    }
    crit24.sort((a,b)=> (a.sev!==b.sev ? (a.sev==='S4'?-1:1) : (b.tms-a.tms)));

    const critHtml = (false && crit24.length) ? `
      <div class="crit24Box" style="margin-bottom:10px; padding:10px 12px; border:1px solid rgba(148,163,184,0.22); border-radius:12px; background: rgba(255,255,255,0.85)">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="font-family:var(--mono); font-size:0.72rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase;">S3/S4 (24h) — casos</div>
          <div style="font-family:var(--mono); font-size:0.72rem; color:var(--text-muted)">${crit24.length}</div>
        </div>
        <div style="margin-top:8px; display:flex; flex-direction:column; gap:8px;">
          ${crit24.map(x=>{
            const sevCls = (x.sev==='S4') ? 's4' : 's3';
            const tags = (x.tags&&x.tags.length) ? x.tags.join(', ') : '—';
            const who = x.whoInit ? (' · '+esc(x.whoInit)) : '';
            return `<div>
              <div style="font-family:var(--mono); font-size:0.72rem;">
                <span class="crit ${sevCls}">${esc(x.sev)}</span>
                <span style="margin-left:6px; color:rgba(15,23,42,0.9)">• ${esc(x.dtTxt)} — ${esc(String(x.stars))}★ — ${esc(x.hospital)}${who} — tags: ${esc(tags)}</span>
              </div>
              <div style="margin-top:4px; color:rgba(15,23,42,0.78); font-size:0.80rem; line-height:1.15rem">${highlightCritical(x.snip)}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    ` : '';

    commentsBox.innerHTML = `
      ${critHtml}
      <div class="commentsGrid">
        <div class="scrollCol pos">
          <div class="scrollHead"><span>POSITIVOS</span><span>${pos.length}</span></div>
          <div class="scrollViewport">
            <div class="scrollTrack">${posHtml}</div>
          </div>
        </div>
        <div class="scrollCol neg">
          <div class="scrollHead"><span>NEGATIVOS</span><span>${neg.length}</span></div>
          <div class="scrollViewport">
            <div class="scrollTrack">${negHtml}</div>
          </div>
        </div>
      </div>
    `;

    // info popup content
    const pop = document.getElementById('critInfoPopup');
    if(pop){
      const nrm = (s)=> String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
      function uniq(arr){
        const seen = new Set();
        const out=[];
        for(const w of (arr||[])){
          const k = nrm(w);
          if(!k || seen.has(k)) continue;
          seen.add(k);
          out.push(w);
        }
        return out;
      }
      function block(title, sev, arr){
        const u = uniq(arr);
        const chips = u.map(w=>`<span class="crit ${sev}" style="display:inline-block;margin:2px 6px 0 0">${esc(w)}</span>`).join('');
        return `<div style="margin-bottom:10px">
          <div style="font-family:var(--mono);font-size:0.68rem;color:var(--text-muted);letter-spacing:0.06em">${esc(title)}</div>
          <div style="margin-top:6px">${chips || '<span style="color:var(--text-muted)">—</span>'}</div>
        </div>`;
      }
      pop.innerHTML = `
        <div style="font-family:var(--mono);font-size:0.72rem;font-weight:700;margin-bottom:10px">Palavras-chave (highlight)</div>
        ${block('S4 (vermelho)', 's4', CRIT_TERMS.s4)}
        ${block('S3 (amarelo)', 's3', CRIT_TERMS.s3)}
        ${block('S2 (azul)', 's2', CRIT_TERMS.s2)}
        ${block('S1 (cinza)', 's1', CRIT_TERMS.s1)}
      `;
    }
  }

  // Typhoon chart (bottom-right): deltas vs network baseline using hospital overall rating
  renderTyphoon(all.length ? all : all30, k.baseline);


  const kpiGrid = $('kpiGrid');
  if(kpiGrid){
    const volCls = clsDelta(k.vDelta);
    const volArrow = (k.vDelta!=null && k.vDelta>0) ? '▲' : ((k.vDelta!=null && k.vDelta<0) ? '▼' : '•');
    const dCls = clsDelta(k.delta7);
    const dArrow = (k.delta7!=null && k.delta7>0) ? '▲' : ((k.delta7!=null && k.delta7<0) ? '▼' : '•');

    kpiGrid.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">Ranking Geral</div>
        <div class="kpi-value">${k.baseline!=null?('★'+fmt(k.baseline,2)):'—'}</div>
        <div class="kpi-sub">média geral</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Média (7d)</div>
        <div class="kpi-value">${k.avg7!=null?('★'+fmt(k.avg7,2)):'—'}
          ${k.delta7!=null?(`<span class="kpi-deltaSmall ${dCls}">${dArrow}${fmt(Math.abs(k.delta7),2)}★</span>`):''}
        </div>
        <div class="kpi-sub">vs média geral</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Volume (7d)</div>
        <div class="kpi-value">${k.v7}
          ${k.vDelta!=null?(`<span class="kpi-deltaSmall ${volCls}">${volArrow}${fmtPct(Math.abs(k.vDelta),1)}</span>`):''}
        </div>
        <div class="kpi-sub">vs ${k.vPrev} (7d anterior)</div>
      </div>
      <div class="kpi-card" id="kpi15d">
        <div class="kpi-label">Média (15d)</div>
        <div class="kpi-value">—</div>
        <div class="kpi-sub">nota média no período</div>
      </div>
    `;
  }

  // KPI: 15d average
  const k15 = $('kpi15d');
  if(k15){
    const all15 = lastNDays(all, 15).filter(r=>r.rating!=null);
    const avg15 = all15.length ? (all15.reduce((s,r)=>s+r.rating,0)/all15.length) : null;
    const el = k15.querySelector('.kpi-value');
    if(el) el.textContent = (avg15!=null) ? ('★'+fmt(avg15,2)) : '—';
  }
}

function setStatus(s){ const el=$('status-text'); if(el) el.textContent = s; }

function ensureText(id, text){
  const el = $(id);
  if(el) el.textContent = text;
}

function setRiskSiren({s4=0, s3=0}={}){
  const el = document.getElementById('riskSiren');
  const tx = document.getElementById('riskSirenText');
  if(!el || !tx) return;

  if(s4>0){
    el.style.display = 'inline-flex';
    el.classList.remove('s3');
    el.classList.add('s4');
    tx.textContent = `S4: ${s4} (24h)`;
    el.title = `S4 nas últimas 24h: ${s4}`;
    return;
  }
  if(s3>0){
    el.style.display = 'inline-flex';
    el.classList.remove('s4');
    el.classList.add('s3');
    tx.textContent = `S3: ${s3} (24h)`;
    el.title = `S3 nas últimas 24h: ${s3}`;
    return;
  }
  el.style.display = 'none';
}

function norm(s){
  return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

function hasAny(s, needles){
  for(const n of needles){ if(s.includes(n)) return true; }
  return false;
}

function computeS3S4_24h(all){
  const since = Date.now() - 24*3600*1000;

  const S4 = [
    'obito','óbito','morte','morreu','falecimento',
    'sepse','septicemia',
    'erro medico','erro médico',
    'medicacao errada','medicação errada','dose errada','troca de medicamento',
    'cirurgia errada','anestesia','omissao de socorro','omissão de socorro',
    'parada','intub',
    'agressao','agressão','ameaça','ameaca','assédio','assedio','abuso',
  ].map(norm);

  const S3 = [
    'infeccao hospitalar','infecção hospitalar','infec','infecção',
    'negligencia','negligência','impericia','imperícia','imprudencia','imprudência',
    'queda','fratura','caiu','lesao','lesão',
    'sangramento','hemorrag',
    'diagnostico errado','diagnóstico errado','diagnostico tardio','diagnóstico tardio',
    'gestante','gravida','grávida','bebe','bebê','parto',
    'uti',
  ].map(norm);

  let s4=0, s3=0;

  for(const r of (all||[])){
    if(!r.iso) continue;
    const t = Date.parse(r.iso);
    if(!Number.isFinite(t) || t < since) continue;
    const stars = Number(r.rating);
    if(!(stars===1 || stars===2)) continue;
    const text = norm(r.text||'');
    if(text.length < 20) continue;

    if(hasAny(text, S4)) { s4++; continue; }
    if(hasAny(text, S3)) { s3++; continue; }
  }

  return { s4, s3 };
}

async function load(){
  dbg('load_start', Date.now());
  const btn = $('btn-refresh');
  const tBox = $('topicsBox');
  const mBox = $('moversBox');
  const cBox = $('commentsBox');
  if(btn) btn.disabled = true;
  setStatus('Carregando…');
  try{
    const r = await fetch('./data/dash.json?ts=' + Date.now(), { cache:'no-store' });
    const unifiedRes = await r.json();
    const source = (unifiedRes && Array.isArray(unifiedRes.hospitals)) ? unifiedRes : { hospitals: [] };
    const hospitals = flattenHospitals(source, null);
    const all = computeAll(hospitals);
    dbg('hospitals_len', hospitals.length);
    dbg('all_len', all.length);
    const payloadKpis = source?.kpis ? { ...source.kpis } : {};
    if(source?.networkBaseline != null && payloadKpis.baseline == null) payloadKpis.baseline = source.networkBaseline;
    try{ await render(all, Object.keys(payloadKpis).length ? payloadKpis : null, source?.trend15 || null); }catch(err){ dbg('render_call_err', String(err)); }
    try{ renderReport90(all); }catch(err){ dbg('report90_call_err', String(err)); }
    dbg('before_risk_siren', true);
    setRiskSiren(source?.siren24h || computeS3S4_24h(all));
    dbg('after_risk_siren', true);
    const gen = source?.updatedAt ? new Date(source.updatedAt) : (source?.generatedAt ? new Date(source.generatedAt) : new Date());
    const hh = String(gen.getHours()).padStart(2,'0');
    const mm = String(gen.getMinutes()).padStart(2,'0');
    const ss = String(gen.getSeconds()).padStart(2,'0');
    setStatus('Atualizado ' + hh + ':' + mm + ':' + ss);
    // hard final DOM writes to guarantee visible output
    if(tBox && tBox.innerText.trim() === 'Carregando…') tBox.innerHTML = '<div class="placeholder">Sem dados disponíveis</div>';
    if(mBox && mBox.innerText.trim() === 'Carregando…') mBox.innerHTML = '<div class="placeholder">Sem dados disponíveis</div>';
    if(cBox && cBox.innerText.trim() === 'Carregando…') cBox.innerHTML = '<div class="placeholder">Sem dados disponíveis</div>';
  }catch(e){
    setStatus('Falha ao atualizar');
    setRiskSiren({s4:0,s3:0});
    if(tBox) tBox.innerHTML = '<div class="placeholder">Falha ao carregar</div>';
    if(mBox) mBox.innerHTML = '<div class="placeholder">Falha ao carregar</div>';
    if(cBox) cBox.innerHTML = '<div class="placeholder">Falha ao carregar</div>';
  } finally {
    if(tBox && tBox.innerText.trim() === 'Carregando…') tBox.innerHTML = '<div class="placeholder">Sem dados disponíveis</div>';
    if(mBox && mBox.innerText.trim() === 'Carregando…') mBox.innerHTML = '<div class="placeholder">Sem dados disponíveis</div>';
    if(cBox && cBox.innerText.trim() === 'Carregando…') cBox.innerHTML = '<div class="placeholder">Sem dados disponíveis</div>';
    if(btn) btn.disabled = false;
  }
}

function setView(which){
  const vp = document.getElementById('viewPanel');
  const vr = document.getElementById('viewReport');
  const b1 = document.getElementById('btnViewPanel');
  const b2 = document.getElementById('btnViewReport');
  if(!vp || !vr || !b1 || !b2) return;
  if(which==='report'){
    vp.style.display = 'none';
    vr.style.display = 'block';
    b1.classList.remove('on');
    b2.classList.add('on');
  } else {
    vp.style.display = 'block';
    vr.style.display = 'none';
    b2.classList.remove('on');
    b1.classList.add('on');
  }
}

window.addEventListener('DOMContentLoaded', ()=>{
  // Sidebar toggle (mobile drawer)
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const btnHamburger = document.getElementById('btnHamburger');
  function openSidebar(){ if(sidebar) sidebar.classList.add('open'); if(sidebarOverlay) sidebarOverlay.classList.add('open'); }
  function closeSidebar(){ if(sidebar) sidebar.classList.remove('open'); if(sidebarOverlay) sidebarOverlay.classList.remove('open'); }
  if(btnHamburger) btnHamburger.addEventListener('click', ()=>{ sidebar && sidebar.classList.contains('open') ? closeSidebar() : openSidebar(); });
  if(sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
  if(sidebar){ sidebar.querySelectorAll('.nav-item').forEach(a=>{ a.addEventListener('click', closeSidebar); }); }

  const btn = $('btn-refresh');
  if(btn) btn.addEventListener('click', load);

  const b1 = document.getElementById('btnViewPanel');
  const b2 = document.getElementById('btnViewReport');
  if(b1) b1.addEventListener('click', ()=>setView('panel'));
  if(b2) b2.addEventListener('click', ()=>setView('report'));

  function flash(btn, label='Copiado'){
    const prev = btn.textContent;
    btn.textContent = label;
    setTimeout(()=>{ btn.textContent = prev; }, 1200);
  }

  function copyTextBestEffort(txt, btn){
    if(!txt) return;
    try{
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.setAttribute('readonly','');
      ta.style.position='fixed';
      ta.style.left='-9999px';
      ta.style.top='0';
      ta.style.opacity='0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const okCopy = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      if(okCopy){ if(btn) flash(btn); return true; }
    }catch(e){}
    return false;
  }

  const dlPdfBtn = document.getElementById('btnDlReportPdf');
  if(dlPdfBtn) dlPdfBtn.addEventListener('click', async ()=>{
    dlPdfBtn.disabled = true;
    const prev = dlPdfBtn.textContent;
    dlPdfBtn.textContent = 'Gerando…';
    try{
      const r = await fetch('./data/report90.pdf', { cache:'no-store' });
      if(!r.ok) throw new Error('http_'+r.status);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'relatorio_90d_s3s4.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 1500);
      dlPdfBtn.textContent = 'Baixado';
      setTimeout(()=>{ dlPdfBtn.textContent = prev; }, 1200);
    }catch(e){
      alert('Falha ao gerar PDF. (Dica: se estiver muito pesado, tente novamente.)');
      dlPdfBtn.textContent = prev;
    }finally{
      dlPdfBtn.disabled = false;
    }
  });

  // Copy removed (we use PDF download now)


  load();
});
