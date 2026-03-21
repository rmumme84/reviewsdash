// RDOR3 dashboard logic (v0.2)

const TICKER = 'RDOR3';
const HEALTH_PEERS = ['HAPV3','FLRY3','ONCO3','MATD3','DASA3','AALR3'];
const IBOV_T = 'IBOV';
const USDBRL_T = 'USD/BRL';
const PRICE_TARGETS = 42.80;

let priceChart = null;
let currentPeriod = '1M';
let cacheCountdown = null;
let cacheTotal = 180;
let cacheAge = 0;
let __autoReloadTimer = null;

const fmt = (n, d=2) => n != null && Number.isFinite(Number(n))
  ? Number(n).toLocaleString('pt-BR', {minimumFractionDigits:d, maximumFractionDigits:d})
  : '—';
const fmtR = (n, d=2) => n != null && Number.isFinite(Number(n)) ? `R$ ${fmt(n,d)}` : '—';
const fmtP = (n, d=2) => n != null && Number.isFinite(Number(n)) ? `${n >= 0 ? '+' : ''}${fmt(n,d)}%` : '—';
const clsChange = (n) => (n > 0) ? 'up' : (n < 0) ? 'down' : 'neu';
function setEl(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }

function fmtVol(n) {
  const v = Number(n);
  if(!Number.isFinite(v)) return '—';
  if (v >= 1e9) return (v/1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v/1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v/1e3).toFixed(1) + 'K';
  return v.toLocaleString('pt-BR');
}

async function fetchQuotes(symbols){
  const url = `/api/quotes/ticker.json?symbols=${encodeURIComponent(symbols.join(','))}`;
  const res = await fetch(url, { cache: 'no-store' });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const arr = Array.isArray(data?.quotes) ? data.quotes : [];
  const map = new Map();
  for(const q of arr){
    map.set(q.label, q);
  }
  return map;
}

function startCacheCountdown(ageSeconds, ttlSeconds) {
  clearInterval(cacheCountdown);
  cacheTotal = ttlSeconds;
  cacheAge = ageSeconds;
  function tick() {
    cacheAge = Math.min(cacheAge + 1, cacheTotal);
    const remaining = Math.max(0, cacheTotal - cacheAge);
    const pct = ((cacheAge / cacheTotal) * 100).toFixed(1);
    const fill = document.getElementById('cache-progress');
    if (fill) fill.style.width = pct + '%';
    setEl('cache-ttl', `próxima busca em ${remaining}s`);
    setEl('cache-label', '');
    if (remaining === 0) clearInterval(cacheCountdown);
  }
  tick();
  cacheCountdown = setInterval(tick, 1000);
}

function renderKPIs(q){
  const cls = clsChange(Number((q.changePct!=null)?q.changePct:q.b3CloseChangePct)||0);
  const grid = document.getElementById('kpi-grid');
  const price = (q.price!=null) ? Number(q.price) : null;
  const upside = (price!=null) ? ((PRICE_TARGETS / price - 1) * 100) : null;

  const asOf = q.asOfDay ? String(q.asOfDay) : null;
  const subAsOf = asOf ? `último pregão: ${asOf}` : 'B3';

  grid.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Preço Atual</div>
      <div class="kpi-value">${fmtR(price)}</div>
      <div class="kpi-sub">${(() => {
        const cp = (q.changePct!=null && Number.isFinite(Number(q.changePct))) ? Number(q.changePct)
          : (q.b3CloseChangePct!=null && Number.isFinite(Number(q.b3CloseChangePct))) ? Number(q.b3CloseChangePct) : null;
        if(cp==null) return '';
        const arrow = cp > 0 ? '▲' : (cp < 0 ? '▼' : '•');
        const cls2 = clsChange(cp);
        return `<span class="kpi-delta ${cls2}">${arrow}${fmtP(cp,1)}</span>`;
      })()}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Market Cap</div>
      <div class="kpi-value">${(() => {
        const mc = (q.marketCap!=null && Number.isFinite(Number(q.marketCap))) ? Number(q.marketCap)
          : (window.__rdor3Fund?.marketCap!=null && Number.isFinite(Number(window.__rdor3Fund.marketCap)) ? Number(window.__rdor3Fund.marketCap) : null);
        if(mc==null) return '—';
        // heuristics: investidor10 may provide billions (e.g., 11.46), google may provide full number.
        const v = (mc < 5000) ? (mc * 1e9) : mc;
        const abs = Math.abs(v);
        if(abs >= 1e12) return `R$ ${fmt(v/1e12,2)} tri`;
        if(abs >= 1e9) return `R$ ${fmt(v/1e9,2)} bi`;
        if(abs >= 1e6) return `R$ ${fmt(v/1e6,0)} mi`;
        return `R$ ${fmt(v,0)}`;
      })()}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Volume (dia)</div>
      <div class="kpi-value">${q.volumeShares!=null ? fmtVol(q.volumeShares) : (q.volume!=null ? fmtVol(q.volume) : '—')}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">P/L</div>
      <div class="kpi-value">${(q.pe!=null ? fmt(q.pe,1)+'x' : (window.__rdor3Fund?.pl!=null ? fmt(Number(window.__rdor3Fund.pl),1)+'x' : '—'))}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">EV/EBITDA</div>
      <div class="kpi-value">${(q.evEbitda!=null ? fmt(Number(q.evEbitda),1)+'x' : (window.__rdor3Fund?.evEbitda!=null ? fmt(Number(window.__rdor3Fund.evEbitda),1)+'x' : '—'))}</div>
    </div>
    <div class="kpi-card" id="shortInterestCard">
      <div class="kpi-label">Short Interest</div>
      <div class="kpi-value" id="shortInterestValue">—</div>
      <div class="kpi-sub" id="shortInterestSub">—</div>
    </div>
  `;

  // topbar
  const priceEl = document.getElementById('price-main');
  if(priceEl) priceEl.textContent = fmtR(price);
  const badge = document.getElementById('price-change-badge');
  if(badge){
    const cp = (q.changePct!=null && Number.isFinite(Number(q.changePct))) ? Number(q.changePct)
      : (q.b3CloseChangePct!=null && Number.isFinite(Number(q.b3CloseChangePct)) ? Number(q.b3CloseChangePct) : 0);
    badge.textContent = `${fmtP(cp,2)}`;
    badge.className = `price-change ${cls}`;
  }
}


function ensureChart(){
  if(priceChart) return;
  const el = document.getElementById('price-chart');
  if(!el) return;

  const ctx = el.getContext('2d');
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
      if(!ticks.length) {
        scale.ticks = [{ value:last }];
        return;
      }
      // replace last tick to guarantee visibility
      ticks[ticks.length-1] = { value:last };
      scale.ticks = ticks;
    }
  };

  priceChart = new Chart(ctx, {
    plugins: [ensureLastTickPlugin],
    data: {
      labels: [],
      datasets: [
        {
          type: 'bar',
          label: 'Volume',
          yAxisID: 'yVol',
          data: [],
          backgroundColor: 'rgba(2, 132, 199, 0.18)',
          borderColor: 'rgba(2, 132, 199, 0.35)',
          borderWidth: 1,
          borderRadius: 2,
          barThickness: 10,
          maxBarThickness: 14,
          order: 1,
        },
        {
          type: 'line',
          label: 'Preço',
          yAxisID: 'yPx',
          data: [],
          borderColor: '#0A2C6E',
          backgroundColor: 'rgba(10,44,110,0.08)',
          fill: true,
          tension: 0,
          pointRadius: 0,
          borderWidth: 2,
          order: 2,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 450 },
      // extra room so the last x-axis label doesn't get clipped
      layout: { padding: { right: 40, bottom: 18 } },
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: {
          grid: { display: false },
          // keep last date label visible at the right edge
          offset: true,
          ticks: {
            // Definitive: disable autoSkip and manually choose which labels to render,
            // always including the last available label.
            autoSkip: false,
            maxRotation: 0,
            minRotation: 0,
            align: 'end',
            padding: 6,
            font: { family: 'DM Mono', size: 10 },
            callback: function(value, index){
              try{
                const labels = this?.chart?.data?.labels || [];
                const n = labels.length;
                if(!n) return '';
                const last = n - 1;
                if(index === 0 || index === last) return labels[index];
                const maxTicks = 8;
                const step = Math.max(1, Math.ceil(last / (maxTicks - 1)));
                return (index % step === 0) ? labels[index] : '';
              } catch {
                return '';
              }
            },
          },
        },
        yPx: {
          type: 'linear',
          position: 'right',
          grid: { color: '#F3F4F6' },
          ticks: { font: { family: 'DM Mono', size: 10 }, callback: v => `R$ ${fmt(v)}` },
        },
        yVol: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          grid: { color: 'rgba(225,228,236,0.25)' },
          ticks: {
            font: { family: 'DM Mono', size: 10 },
            color: 'rgba(107,114,128,0.85)',
            callback: v => fmtVol(v)
          },
          suggestedMax: 1,
          grace: '300%'
        }
      }
    }
  });
}

let __dailyHistoryCache = null;

async function fetchDailyHistory(){
  if(__dailyHistoryCache) return __dailyHistoryCache;

  // Prefer B3 official daily history (5y)
  try{
    const r1 = await fetch('/api/rdor3/b3_daily_5y.json', { cache: 'no-store' });
    if(r1.ok){
      __dailyHistoryCache = await r1.json();
      return __dailyHistoryCache;
    }
  } catch {}

  // Fallback: our own daily snapshots
  const r = await fetch('/api/rdor3/history.json', { cache: 'no-store' });
  if(!r.ok) return null;
  __dailyHistoryCache = await r.json();
  return __dailyHistoryCache;
}

function sliceHistory(points, period){
  const arr = Array.isArray(points) ? points.filter(p=>p && p.day && (p.close != null || p.price != null)) : [];
  if(!arr.length) return [];

  const days = {
    '1D': 2,
    '5D': 6,
    '1M': 32,
    '3M': 110,
    '6M': 220,
    '1A': 400,
    '2A': 900,
  }[period] || 32;

  return arr.slice(Math.max(0, arr.length - days));
}

function parseDay(s){
  const t = Date.parse(String(s||''));
  return Number.isFinite(t) ? new Date(t) : null;
}

function isoWeekKey(d){
  // ISO week-year and week number
  const dd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = dd.getUTCDay() || 7;
  dd.setUTCDate(dd.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dd.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((dd - yearStart) / 86400000) + 1) / 7);
  const year = dd.getUTCFullYear();
  return `${year}-W${String(weekNo).padStart(2,'0')}`;
}

function quarterKey(d){
  const q = Math.floor(d.getUTCMonth()/3) + 1;
  // label format: QxYY (e.g., Q124)
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `Q${q}${yy}`;
}

function buildMixedScaleSeries(points){
  // For YTD view: keep it daily (no yearly/quarter buckets)
  const arr = Array.isArray(points) ? points.slice() : [];
  const rows = [];
  for(const p of arr){
    const day = String(p.day||'');
    const d = parseDay(day);
    if(!d) continue;
    const close = Number(p.close != null ? p.close : p.price);
    const vol = Number(p.volumeShares != null ? p.volumeShares : (p.volume!=null ? p.volume : 0));
    if(!Number.isFinite(close)) continue;
    rows.push({ key: day, day, d, close, vol: Number.isFinite(vol)?vol:0 });
  }
  rows.sort((a,b)=>a.d-b.d);
  return rows;
}

function renderCombinedChartFromPoints(points, q=null){
  ensureChart();

  // Show only YTD (from Jan 1 of last available year)
  const arr = Array.isArray(points) ? points.slice() : [];
  if(!arr.length) return;
  const days = arr.map(p=>String(p.day||'')).filter(Boolean).sort();
  const lastDay = days[days.length-1];

  // last tick visibility is handled by ensureLastTick plugin

  const y = String(lastDay||'').slice(0,4);
  const start = `${y}-01-01`;
  const ptsYtd = arr.filter(p => String(p.day||'') >= start);

  let series = buildMixedScaleSeries(ptsYtd);

  // If today's intraday quote exists, append a "today" point so the chart doesn't look stale during the session.
  try{
    const today = new Date();
    const iso = today.toISOString().slice(0,10);
    const last = series.length ? String(series[series.length-1].day) : null;
    const qpx = (q && q.price!=null && Number.isFinite(Number(q.price))) ? Number(q.price) : null;
    if(qpx!=null && iso && last && iso > last){
      const qvol = (q.volumeShares!=null && Number.isFinite(Number(q.volumeShares))) ? Number(q.volumeShares)
        : (q.volume!=null && Number.isFinite(Number(q.volume)) ? Number(q.volume) : 0);
      series = series.concat([{ day: iso, close: qpx, vol: qvol }]);
    }
  } catch {}

  const labels = series.map(p => {
    // YTD: show dd/mm only
    const [yy,mm,dd] = String(p.day).split('-');
    return (dd && mm) ? `${dd}/${mm}` : String(p.day);
  });

  const prices = series.map(p => Number(p.close));
  const vols = series.map(p => Number(p.vol) || 0);

  priceChart.data.labels = labels;
  // dataset[0]=volume bars ; dataset[1]=price line
  priceChart.data.datasets[0].data = vols;
  priceChart.data.datasets[1].data = prices;

  // Scales rules:
  // - Volume axis: min=0, max=3x avg volume (of sample)
  // - Price axis: min=10% below min price, max=5% above max price
  const volNums = vols.map(v=>Number(v)||0).filter(v=>Number.isFinite(v) && v>=0);
  const avgVol = volNums.length ? (volNums.reduce((a,b)=>a+b,0)/volNums.length) : 0;
  const volMax = Math.max(1, avgVol * 4.0);

  const pxNums = prices.map(v=>Number(v)).filter(v=>Number.isFinite(v));
  const minPx = pxNums.length ? Math.min(...pxNums) : null;
  const maxPx = pxNums.length ? Math.max(...pxNums) : null;

  if(priceChart.options?.scales?.yVol){
    priceChart.options.scales.yVol.min = 0;
    priceChart.options.scales.yVol.max = volMax;
  }
  if(priceChart.options?.scales?.yPx && minPx!=null && maxPx!=null){
    priceChart.options.scales.yPx.min = minPx * 0.90;
    priceChart.options.scales.yPx.max = maxPx * 1.05;
  }

  priceChart.update();
}

async function renderCombinedChart(q){
  // Prefer real daily history (once/day snapshots). Fallback: flat series.
  try{
    const hist = await fetchDailyHistory();
    const ptsAll = (hist && Array.isArray(hist.points)) ? hist.points : [];
    if(ptsAll.length >= 10){
      // Always use the full 5y dataset; aggregation controls readability.
      renderCombinedChartFromPoints(ptsAll, q);
      return;
    }
  } catch {}

  // fallback: just show a tiny series with today's point
  ensureChart();
  const price = (q.price!=null) ? Number(q.price) : null;
  if(price == null) return;
  const day = new Date().toISOString().slice(0,10);
  const labels = [day.slice(8,10)+'/'+day.slice(5,7)];
  priceChart.data.labels = labels;
  priceChart.data.datasets[0].data = [q.volume!=null ? Number(q.volume) : 0];
  priceChart.data.datasets[1].data = [price];
  priceChart.update();
}

function computeMtdYtdFromB3(points){
  const arr = Array.isArray(points) ? points.filter(p=>p && p.day && p.close!=null).slice() : [];
  if(!arr.length) return { mtd:null, ytd:null };
  arr.sort((a,b)=>String(a.day).localeCompare(String(b.day)));
  const last = arr[arr.length-1];
  const lastClose = Number(last.close);
  if(!Number.isFinite(lastClose)) return { mtd:null, ytd:null };

  const lastDate = parseDay(last.day);
  if(!lastDate) return { mtd:null, ytd:null };

  const monthStart = new Date(Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), 1));
  const yearStart = new Date(Date.UTC(lastDate.getUTCFullYear(), 0, 1));

  function findPrevClose(beforeDate){
    for(let i=arr.length-1;i>=0;i--){
      const d = parseDay(arr[i].day);
      if(d && d < beforeDate){
        const c = Number(arr[i].close);
        return Number.isFinite(c) ? c : null;
      }
    }
    return null;
  }

  const prevMonth = findPrevClose(monthStart);
  const prevYear = findPrevClose(yearStart);

  const mtd = (prevMonth!=null && prevMonth>0) ? ((lastClose - prevMonth)/prevMonth*100) : null;
  const ytd = (prevYear!=null && prevYear>0) ? ((lastClose - prevYear)/prevYear*100) : null;
  return { mtd, ytd };
}

let __b3HealthCache = null;
let __ibovHistCache = null;
let __usdHistCache = null;
let __cdiHistCache = null;

async function fetchB3HealthSeries(){
  if(__b3HealthCache) return __b3HealthCache;
  try{
    const r = await fetch('/api/market/b3_health_5y.json', { cache: 'no-store' });
    if(!r.ok) return null;
    __b3HealthCache = await r.json();
    return __b3HealthCache;
  } catch {
    return null;
  }
}

async function fetchIbovHistory(){
  if(__ibovHistCache) return __ibovHistCache;
  try{
    const r = await fetch('/api/market/ibov_5y.json', { cache: 'no-store' });
    if(!r.ok) return null;
    __ibovHistCache = await r.json();
    return __ibovHistCache;
  } catch {
    return null;
  }
}

async function fetchUsdHistory(){
  if(__usdHistCache) return __usdHistCache;
  try{
    const r = await fetch('/api/market/usdbrl_5y.json', { cache: 'no-store' });
    if(!r.ok) return null;
    __usdHistCache = await r.json();
    return __usdHistCache;
  } catch {
    return null;
  }
}

async function fetchCdiHistory(){
  if(__cdiHistCache) return __cdiHistCache;
  try{
    const r = await fetch('/api/market/cdi_5y.json', { cache: 'no-store' });
    if(!r.ok) return null;
    __cdiHistCache = await r.json();
    return __cdiHistCache;
  } catch {
    return null;
  }
}

async function loadMarketHighlights(){
  const body = document.getElementById('marketTableBody');
  if(!body) return;

  try{
    // Quotes (day change) from Google Finance via our API
    const quotesMap = await fetchQuotes([TICKER, IBOV_T, USDBRL_T, ...HEALTH_PEERS]);

    // MTD/YTD sources:
    // - equities: B3 COTAHIST bundle
    // - IBOV: Stooq daily
    // - USD/BRL: BCB SGS daily
    const b3Health = await fetchB3HealthSeries();
    const seriesMap = b3Health && b3Health.series ? b3Health.series : {};
    const ibHist = await fetchIbovHistory();
    const usdHist = await fetchUsdHistory();
    const cdiHist = await fetchCdiHistory();

    function mtdYtdFor(sym){
      if(sym === 'IBOV') return computeMtdYtdFromB3(ibHist?.points || []);
      if(sym === 'USD/BRL') return computeMtdYtdFromB3(usdHist?.points || []);
      const pts = seriesMap?.[sym]?.points;
      return computeMtdYtdFromB3(pts || []);
    }

    function clsCell(pct){
      const v = Number(pct);
      if(!Number.isFinite(v) || v === 0) return 'mkNeu';
      return v > 0 ? 'mkUp' : 'mkDown';
    }

    function fmtPx(sym, q){
      if(!q || q.price==null) return '—';
      if(sym === 'IBOV') return `${fmt(q.price,0)} pts`;
      if(sym.includes('/')) return `R$ ${fmt(q.price,4)}`;
      return fmtR(q.price);
    }

    function fmtPct(p){
      const v = Number(p);
      return Number.isFinite(v) ? fmtP(v,2) : '—';
    }

    function lastDayChangePct(points){
      const arr = Array.isArray(points) ? points.filter(p=>p && p.day && p.close!=null).slice() : [];
      if(arr.length < 2) return null;
      arr.sort((a,b)=>String(a.day).localeCompare(String(b.day)));
      const last = Number(arr[arr.length-1].close);
      const prev = Number(arr[arr.length-2].close);
      if(!Number.isFinite(last) || !Number.isFinite(prev) || prev <= 0) return null;
      return (last - prev) / prev * 100;
    }

    // B3 regular session (BRT): Mon–Fri 10:00–17:00.
    // Avoid showing “day change” for IBOV before the market opens.
    function isB3RegularOpenNow(){
      try{
        const now = new Date();
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Sao_Paulo',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).formatToParts(now);
        const get = (t)=> parts.find(p=>p.type===t)?.value;
        const wd = (get('weekday')||'').toLowerCase();
        const hh = Number(get('hour'));
        const mm = Number(get('minute'));
        const isWeekday = ['mon','tue','wed','thu','fri'].includes(wd);
        if(!isWeekday || !Number.isFinite(hh) || !Number.isFinite(mm)) return false;
        const mins = hh*60 + mm;
        return mins >= (10*60) && mins <= (17*60);
      } catch {
        return false;
      }
    }

    function seriesFor(sym){
      if(sym === 'IBOV') return ibHist?.points || [];
      if(sym === 'USD/BRL') return usdHist?.points || [];
      if(sym === 'CDI') return cdiHist?.points || [];
      return seriesMap?.[sym]?.points || [];
    }

    function computeCdiReturns(points){
      const arr = Array.isArray(points) ? points.filter(p=>p && p.day && p.ratePct!=null).slice() : [];
      if(!arr.length) return { d:null, mtd:null, ytd:null };
      arr.sort((a,b)=>String(a.day).localeCompare(String(b.day)));
      const last = arr[arr.length-1];
      const lastDate = parseDay(last.day);
      if(!lastDate) return { d:null, mtd:null, ytd:null };

      const dayPct = Number(last.ratePct);

      const monthStart = new Date(Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), 1));
      const yearStart = new Date(Date.UTC(lastDate.getUTCFullYear(), 0, 1));

      function accSince(dt){
        let prod = 1.0;
        for(const r of arr){
          const d = parseDay(r.day);
          if(!d || d < dt) continue;
          const rp = Number(r.ratePct);
          if(!Number.isFinite(rp)) continue;
          prod *= (1 + rp/100.0);
        }
        return (prod - 1) * 100;
      }

      return {
        d: Number.isFinite(dayPct) ? dayPct : null,
        mtd: accSince(monthStart),
        ytd: accSince(yearStart),
      };
    }

    function row(sym, nameLabel=null){
      const q = quotesMap.get(sym);
      const pts = seriesFor(sym);

      // D: prefer intraday % from quote source; fallback to last close-to-close.
      // For IBOV, do NOT show provider intraday change outside B3 regular session.
      const hasIntraday = (q && !q.error && q.changePct!=null && Number.isFinite(Number(q.changePct)));
      const d = (sym === 'IBOV' && !isB3RegularOpenNow())
        ? 0
        : (hasIntraday ? Number(q.changePct) : lastDayChangePct(pts));
      const px = (q && !q.error) ? fmtPx(sym, q) : '—';

      const { mtd, ytd } = computeMtdYtdFromB3(pts);
      const m = mtd;
      const y = ytd;

      return `
        <tr>
          <td class="name-cell">${nameLabel || sym}</td>
          <td style="text-align:right">${px}</td>
          <td style="text-align:right" class="${clsCell(d)}">${fmtPct(d)}</td>
          <td style="text-align:right" class="${clsCell(m)}">${fmtPct(m)}</td>
          <td style="text-align:right" class="${clsCell(y)}">${fmtPct(y)}</td>
        </tr>
      `;
    }

    const rows = [];
    rows.push(row('RDOR3'));
    rows.push(row('IBOV'));
    rows.push(row('USD/BRL'));

    // CDI (below USD/BRL)
    const cdiPts = seriesFor('CDI');
    const cdiR = computeCdiReturns(cdiPts);
    rows.push(`
      <tr>
        <td class="name-cell">CDI</td>
        <td style="text-align:right">—</td>
        <td style="text-align:right" class="${clsCell(cdiR.d)}">${fmtPct(cdiR.d)}</td>
        <td style="text-align:right" class="${clsCell(cdiR.mtd)}">${fmtPct(cdiR.mtd)}</td>
        <td style="text-align:right" class="${clsCell(cdiR.ytd)}">${fmtPct(cdiR.ytd)}</td>
      </tr>
    `);

    rows.push('<tr><td colspan="5" style="padding:6px 10px;background:#FAFAFA;color:var(--text-muted);font-size:0.65rem;letter-spacing:0.08em;text-transform:uppercase;">Saúde (comparáveis)</td></tr>');
    for(const sym of HEALTH_PEERS){
      rows.push(row(sym));
    }

    body.innerHTML = rows.join('');

  } catch(e){
    body.innerHTML = '<tr><td class="name-cell">Erro</td><td colspan="5" style="color:var(--text-muted)">Falha ao carregar destaques.</td></tr>';
  }
}

async function computeB3Kpis(){
  const hist = await fetchDailyHistory();
  const pts = (hist && Array.isArray(hist.points)) ? hist.points : [];
  const arr = pts.filter(p=>p && p.day && (p.close!=null || p.price!=null)).map(p=>({
    day: String(p.day),
    close: Number(p.close != null ? p.close : p.price),
    vol: Number(p.volumeShares != null ? p.volumeShares : (p.volume!=null ? p.volume : 0))
  })).filter(x=>x.day && Number.isFinite(x.close));
  if(arr.length < 2) return null;
  arr.sort((a,b)=>a.day.localeCompare(b.day));
  const last = arr[arr.length-1];
  const prev = arr[arr.length-2];
  const change = last.close - prev.close;
  const changePct = (prev.close>0) ? (change/prev.close*100) : null;

  // 52w (use last 252 trading days)
  const win = arr.slice(Math.max(0, arr.length - 252));
  let low52 = null, high52 = null;
  for(const r of win){
    if(low52==null || r.close < low52) low52 = r.close;
    if(high52==null || r.close > high52) high52 = r.close;
  }

  const base52 = (win && win.length) ? Number(win[0].close) : null;
  const var52w = (base52!=null && Number.isFinite(base52) && base52>0) ? ((last.close - base52)/base52*100) : null;

  return {
    asOfDay: last.day,
    lastClose: last.close,
    volumeShares: Number.isFinite(last.vol) ? last.vol : null,
    change,
    changePct,
    low52,
    high52,
    var52w,
  };
}

async function loadMain(){
  try{
    const m = await fetchQuotes([TICKER]);
    const q = m.get(TICKER);
    if(!q || q.error) throw new Error(q?.error || 'quote_failed');

    const k = await computeB3Kpis().catch(()=>null);
    const merged = k ? {
      ...q,
      // Keep intraday changePct from quote source when available.
      price: (q.price!=null ? q.price : k.lastClose),
      b3CloseChange: k.change,
      b3CloseChangePct: k.changePct,
      volumeShares: k.volumeShares,
      low52: k.low52,
      high52: k.high52,
      var52w: k.var52w,
      asOfDay: k.asOfDay,
    } : q;

    window.__rdor3LastPrice = (merged && merged.price!=null) ? Number(merged.price) : null;

    renderKPIs(merged);
    await renderCombinedChart(merged);

    // Refresh derived KPIs that are rendered outside of renderKPIs()
    await loadShortInterest().catch(()=>{});

    // Cache indicator uses server metadata
    startCacheCountdown(q.cacheAge || 0, q.cacheTtl || 180);

    // Auto refresh: schedule next fetch when server cache TTL expires.
    try{
      const ttl = Number(q.cacheTtl || 180);
      const age = Number(q.cacheAge || 0);
      let waitSec = ttl - age;
      if(!Number.isFinite(waitSec)) waitSec = 180;
      waitSec = Math.max(15, Math.min(waitSec, 600));
      if(__autoReloadTimer) clearTimeout(__autoReloadTimer);
      __autoReloadTimer = setTimeout(async ()=>{
        await loadMain();
        await loadMarketHighlights();
      }, Math.round(waitSec*1000 + 250));
    } catch {}

    const now = new Date().toLocaleTimeString('pt-BR');
    setEl('last-update', `${now}`);
    const dot = document.getElementById('status-dot');
    dot.style.background = '#10B981';
    setEl('status-text', `Atualizado ${now}`);

  } catch(err){
    setEl('status-text', `Erro: ${err.message}`);
    const dot = document.getElementById('status-dot');
    if(dot) dot.style.background = '#DC2626';
    console.error(err);
  }
}

function wirePeriodTabs(){
  // history chart is static (mixed-scale). No period tabs.
}

async function loadConsensus(){
  try{
    const r = await fetch('/api/rdor3/consensus.json', { cache: 'no-store' });
    if(!r.ok) return;
    const j = await r.json();
    if(!j || !j.ok) return;

    const t = j.target || {};
    const avg = (t.avg!=null) ? fmtR(t.avg) : null;
    const tp = document.getElementById('tp-avg');
    if(tp) tp.textContent = avg || '—';

    // upside vs current price
    const curTxt = document.getElementById('price-main')?.textContent || '';
    const cur = parseFloat(String(curTxt).replace(/[^0-9,]/g,'').replace(',','.'));
    const upEl = document.getElementById('tp-upside');
    if(upEl && t.avg!=null && Number.isFinite(cur) && cur>0){
      const up = ((Number(t.avg)/cur)-1)*100;
      upEl.textContent = `${up>=0?'+':''}${fmt(up,1)}%`;
      upEl.className = `tp-upside ${up>=0?'up':'down'}`;
    }
  }catch{}
}

async function loadFundamentals(){
  try{
    const r = await fetch('/api/rdor3/fundamentals.json', { cache: 'no-store' });
    if(!r.ok) return;
    const j = await r.json();
    if(!j || !j.ok) return;
    const f = j.fields || {};
    window.__rdor3Fund = f;
  }catch{}
}

async function loadConsensusByHouse(){
  try{
    const r = await fetch('/api/rdor3/consensus_by_house.json', { cache: 'no-store' });
    if(!r.ok) return null;
    const j = await r.json();
    if(!j || !j.ok) return null;
    return j;
  }catch{ return null; }
}

function fmtDatePt(iso){
  if(!iso) return '';
  // accepts YYYY-MM-DD
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return String(iso);
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
}

function renderConsensusByHouse(j){
  const body = document.getElementById('houseBody');
  const meta = document.getElementById('houseMeta');
  const avgEl = document.getElementById('houseAvg');
  const foot = document.getElementById('houseFoot');
  if(!body) return;

  const items = Array.isArray(j?.items) ? j.items : [];
  const targets = items.map(x=>Number(x.target)).filter(v=>Number.isFinite(v));
  const avg = targets.length ? (targets.reduce((a,b)=>a+b,0)/targets.length) : null;

  if(meta) meta.textContent = '';
  if(avgEl) avgEl.textContent = '';

  if(!items.length){
    body.innerHTML = `<tr><td colspan="5" style="color:var(--text-muted)">Sem dados.</td></tr>`;
    if(foot) foot.innerHTML = '';
    return;
  }

  body.innerHTML = items.map(it=>{
    let rec = String(it.recommendation||'').trim();
    // compact labels
    if(/^compra$/i.test(rec)) rec = 'Buy';
    else if(/^neutro$|^manter$|^hold$/i.test(rec)) rec = 'Hold';
    else if(/^venda$/i.test(rec)) rec = 'Sell';
    rec = esc(rec);
    const tgtNum = (it.target!=null && it.target!=='') ? Number(it.target) : null;
    const tgt = (tgtNum!=null && Number.isFinite(tgtNum)) ? fmtR(tgtNum) : '—';

    const px = (window.__rdor3LastPrice!=null && Number.isFinite(Number(window.__rdor3LastPrice)) && Number(window.__rdor3LastPrice)>0)
      ? Number(window.__rdor3LastPrice)
      : null;

    let upHtml = '';
    if(tgtNum!=null && Number.isFinite(tgtNum) && px!=null){
      const up = (tgtNum/px - 1) * 100;
      const cls = up > 0 ? 'mkUp' : (up < 0 ? 'mkDown' : 'mkNeu');
      // keep on the same line (compact), no arrow/no sign (color conveys direction)
      const pct = Math.abs(up);
      upHtml = ` <span class="consUp ${cls}">(${fmt(pct,1)}%)</span>`;
    }

    const dt = it.updated ? fmtDatePt(it.updated) : '—';
    return `<tr>
      <td class="name-cell">${esc(it.institution||'')}</td>
      <td>${rec||'—'}</td>
      <td style="text-align:right">${tgt}${upHtml}</td>
      <td style="text-align:right">${esc(dt)}</td>
    </tr>`;
  }).join('');

  if(foot){
    foot.innerHTML = `<tr>
      <td colspan="2" style="color:var(--text-muted);font-weight:600">Média</td>
      <td style="text-align:right;font-weight:700">${avg!=null ? fmtR(avg) : '—'}</td>
      <td></td>
    </tr>`;
  }
}

function wireConsensusHouseEditor(state){
  const btn = document.getElementById('btnEditHouse');
  const modal = document.getElementById('houseModal');
  const back = document.getElementById('houseModalBackdrop');
  const x = document.getElementById('houseModalX');
  const cancel = document.getElementById('houseCancel');
  const save = document.getElementById('houseSave');
  const add = document.getElementById('houseAdd');
  const tbody = document.getElementById('houseEditBody');
  const status = document.getElementById('houseSaveStatus');

  function open(){
    if(!modal || !back) return;
    document.body.classList.add('modal-open');
    back.style.display='block';
    modal.style.display='block';
    renderEditRows();
  }
  function close(){
    if(!modal || !back) return;
    document.body.classList.remove('modal-open');
    back.style.display='none';
    modal.style.display='none';
    if(status) status.textContent='';
  }

  function renderEditRows(){
    if(!tbody) return;
    const items = state.items;
    if(!items.length) items.push({ institution:'', analyst:'', recommendation:'', target:'', updated:'', lastRating:'' });
    tbody.innerHTML = items.map((it,idx)=>{
      return `<tr>
        <td><input data-k="institution" data-i="${idx}" value="${escAttr(it.institution||'')}" style="width:140px" /></td>
        <td><input data-k="analyst" data-i="${idx}" value="${escAttr(it.analyst||'')}" style="width:160px" /></td>
        <td><input data-k="recommendation" data-i="${idx}" value="${escAttr(it.recommendation||'')}" style="width:120px" /></td>
        <td style="text-align:right"><input data-k="target" data-i="${idx}" value="${escAttr(it.target??'')}" style="width:90px;text-align:right" /></td>
        <td style="text-align:right"><input data-k="updated" data-i="${idx}" value="${escAttr(it.updated||'')}" style="width:120px" /></td>
        <td><input data-k="lastRating" data-i="${idx}" value="${escAttr(it.lastRating||'')}" style="width:200px" /></td>
        <td style="text-align:right"><button class="pill" data-del="${idx}" type="button">remover</button></td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('input').forEach(inp=>{
      inp.addEventListener('input', (e)=>{
        const i = Number(e.target.getAttribute('data-i'));
        const k = e.target.getAttribute('data-k');
        state.items[i][k] = e.target.value;
      });
    });
    tbody.querySelectorAll('button[data-del]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const i = Number(b.getAttribute('data-del'));
        state.items.splice(i,1);
        renderEditRows();
      });
    });
  }

  async function doSave(){
    if(!status) return;
    status.textContent = 'Salvando…';

    const payload = {
      source: 'manual_editor',
      items: state.items.map(it=>({
        institution: String(it.institution||'').trim(),
        analyst: String(it.analyst||'').trim(),
        recommendation: String(it.recommendation||'').trim(),
        target: (it.target==null || it.target==='') ? null : Number(String(it.target).replace(',','.')),
        updated: String(it.updated||'').trim(),
        lastRating: String(it.lastRating||'').trim(),
      })).filter(x=>x.institution)
    };

    try{
      const r = await fetch('/api/rdor3/consensus_by_house.json', {
        method:'PUT',
        headers:{'content-type':'application/json'},
        body: JSON.stringify(payload)
      });
      const j = await r.json().catch(()=>null);
      if(!r.ok || !j?.ok){
        status.textContent = 'Falhou ao salvar.';
        return;
      }
      status.textContent = `Salvo (${j.count} linhas).`;

      // reload table
      const fresh = await loadConsensusByHouse();
      if(fresh){
        state.items = fresh.items || [];
        renderConsensusByHouse(fresh);
      }
      setTimeout(close, 350);
    }catch{
      status.textContent = 'Falhou ao salvar.';
    }
  }

  if(btn) btn.addEventListener('click', open);
  if(x) x.addEventListener('click', close);
  if(cancel) cancel.addEventListener('click', close);
  if(back) back.addEventListener('click', close);
  if(add) add.addEventListener('click', ()=>{ state.items.push({ institution:'', analyst:'', recommendation:'', target:'', updated:'', lastRating:'' }); renderEditRows(); });
  if(save) save.addEventListener('click', doSave);
}

function esc(s){ return String(s??'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function escAttr(s){ return esc(s).replace(/\n/g,' '); }

async function loadQuarterFinancials(){
  const head = document.getElementById('finHead');
  const body = document.getElementById('finBody');
  if(!head || !body) return;

  function fmtMoneyShort(v){
    const n = Number(v);
    if(!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    if(abs >= 1e9) return `${fmt(n/1e9,1)} bi`;
    if(abs >= 1e6) return `${fmt(n/1e6,0)} mi`;
    return `${fmt(n,0)}`;
  }
  function fmtPctShort(v){
    const n = Number(v);
    return Number.isFinite(n) ? `${fmt(n,1)}%` : '—';
  }
  function fmtX(v){
    const n = Number(v);
    return Number.isFinite(n) ? `${fmt(n,2)}x` : '—';
  }
  function qLabel(q){
    const m = String(q||'').match(/^(\d{4})Q([1-4])$/i);
    if(!m) return String(q||'');
    return `Q${m[2]}${m[1].slice(2)}`;
  }

  try{
    const r = await fetch('/api/rdor3/financials_quarters.json', { cache:'no-store' });
    if(!r.ok) throw new Error('http_'+r.status);
    const j = await r.json();
    const qs = Array.isArray(j?.quarters) ? j.quarters : [];

    // Build a compact table (last 4 quarters) + include the YoY reference quarter if it would fall outside
    const rowsAll = qs.filter(x=>x?.quarter).slice().sort((a,b)=>String(a.quarter).localeCompare(String(b.quarter)));
    let rows = rowsAll.slice(Math.max(0, rowsAll.length - 4));

    if(!rows.length){
      head.innerHTML = '<tr><th style="color:var(--text-muted)">Sem base.</th></tr>';
      body.innerHTML = '<tr><td style="color:var(--text-muted)">Sem base.</td></tr>';
      return;
    }

    const lastRow = rowsAll[rowsAll.length-1];
    const lastQ = String(lastRow?.quarter || '');
    const lastYear = Number(lastQ.slice(0,4)) || null;
    const lastQuarterN = Number(lastQ.slice(-1)) || null;

    // Ensure the YoY quarter (same quarter last year) is visible as a column when available (e.g., show Q3'24 along with Q3'25)
    const yoyK0 = lastQ ? `${(Number(lastQ.slice(0,4))||0)-1}Q${Number(lastQ.slice(-1))||''}` : null;
    if(yoyK0){
      const has = rows.some(r=>String(r.quarter)===yoyK0);
      const ref = rowsAll.find(r=>String(r.quarter)===yoyK0);
      if(!has && ref){
        rows = [ref, ...rows].slice(0, 5);
        rows = rows.slice().sort((a,b)=>String(a.quarter).localeCompare(String(b.quarter)));
      }
    }

    const byQuarter = new Map(rowsAll.map(r=>[String(r.quarter), r]));

    function prevQuarterKey(q){
      const m = String(q||'').match(/^(\d{4})Q([1-4])$/i);
      if(!m) return null;
      let y = Number(m[1]);
      let n = Number(m[2]);
      n -= 1;
      if(n <= 0){ n = 4; y -= 1; }
      return `${y}Q${n}`;
    }
    function yoyKey(q){
      const m = String(q||'').match(/^(\d{4})Q([1-4])$/i);
      if(!m) return null;
      const y = Number(m[1]) - 1;
      const n = Number(m[2]);
      return `${y}Q${n}`;
    }

    function ytdSum(getter, year){
      if(!lastQuarterN) return null;
      const qsY = rowsAll.filter(r=>String(r.quarter).startsWith(String(year)));
      const upto = qsY.filter(r=>Number(String(r.quarter).slice(-1)) <= lastQuarterN);
      const vals = upto.map(getter).map(Number).filter(v=>Number.isFinite(v));
      if(!vals.length) return null;
      return vals.reduce((a,b)=>a+b,0);
    }
    function ytdLast(getter, year){
      const qsY = rowsAll.filter(r=>String(r.quarter).startsWith(String(year)));
      if(!qsY.length) return null;
      const upto = qsY.filter(r=>Number(String(r.quarter).slice(-1)) <= lastQuarterN);
      const pick = (upto.length ? upto : qsY);
      const v = Number(getter(pick[pick.length-1]));
      return Number.isFinite(v) ? v : null;
    }

    const y1 = lastYear;
    const y0 = lastYear ? (lastYear-1) : null;
    const ytdLabel1 = y1 ? `YTD ${String(y1).slice(2)}` : 'YTD';
    const ytdLabel0 = y0 ? `YTD ${String(y0).slice(2)}` : '';

    const qCols = rows.map(r=>qLabel(r.quarter));
    // order requested: YTD older first (e.g. YTD24 then YTD25)
    const yCols = [ytdLabel0, ytdLabel1].filter(Boolean);

    head.innerHTML = '<tr>'
      + ['<th style="width:26%">Indicador</th>']
        .concat(qCols.map(c=>`<th style="text-align:right">${c}</th>`))
        .concat([`<th style="text-align:right">%YoY</th>`, `<th style="text-align:right">%QoQ</th>`])
        .concat(yCols.map((c,i)=>`<th class="${i===0?'ytdSep':''}" style="text-align:right">${c}</th>`))
        .concat([`<th style="text-align:right">%YTD</th>`])
        .join('')
      + '</tr>';

    function g(obj, keys){
      for(const k of keys){
        if(obj && obj[k] != null) return obj[k];
      }
      return null;
    }

    const metrics = [
      { kind:'section', label:'Hospitais' },
      { label:'Receita Bruta', kind:'sum', get:x=>x.receitaBrutaHospitais },
      { label:'EBITDA',       kind:'sum', get:x=>x.ebitdaHospitais },
      { label:'Margem',       kind:'pct', get:x=>x.margemEbitdaHospitaisPct },

      { kind:'section', label:'SulAmérica' },
      { label:'Receita Bruta', kind:'sum', get:x=>g(x, ['receitaBrutaSulamerica','receitaBrutaSulAmerica','receitaBrutaSulAm']) },
      { label:'EBITDA',        kind:'sum', get:x=>g(x, ['ebitdaSulamerica','ebitdaSulAmerica','ebitdaSulAm']) },
      { label:'Margem',        kind:'pct', get:x=>g(x, ['margemEbitdaSulamericaPct','margemEbitdaSulAmericaPct','margemEbitdaSulAmPct']) },
      { label:'MLR',           kind:'pct', get:x=>g(x, ['mlrSulamericaPct','mlrSulAmericaPct','mlrSulAmPct','mlrPct']) },

      { kind:'section', label:'Consolidado' },
      { label:'Receita Bruta', kind:'sum', get:x=>x.receitaBrutaTotal },
      { label:'EBITDA',        kind:'sum', get:x=>x.ebitdaTotal },
      { label:'Margem',        kind:'pct', get:x=>x.margemEbitdaTotalPct },
      { label:'Lucro Líquido', kind:'sum', get:x=>x.lucroLiquido },
    ];

    function fmtByKind(kind, v){
      if(kind==='pct') return fmtPctShort(v);
      if(kind==='x') return fmtX(v);
      return fmtMoneyShort(v);
    }

    function deltaFor(kind, cur, prev){
      const c = Number(cur);
      const p = Number(prev);
      if(!Number.isFinite(c) || !Number.isFinite(p)) return null;
      if(kind === 'pct'){
        // percentage points
        return c - p;
      }
      if(p === 0) return null;
      // percent change
      return (c/p - 1) * 100;
    }

    function fmtDelta(kind, v){
      if(v == null) return '—';
      if(kind === 'pct') return `${fmtP(v,1)} p.p.`;
      return fmtP(v,1);
    }

    const colSpan = 1 + qCols.length + 2 + yCols.length + 1;

    body.innerHTML = metrics.map(m=>{
      if(m.kind === 'section'){
        return `<tr><td colspan="${colSpan}" style="padding:6px 10px;background:#FAFAFA;color:var(--text-muted);font-size:0.65rem;letter-spacing:0.08em;text-transform:uppercase;">${esc(m.label)}</td></tr>`;
      }

      const tds = rows.map(r=>`<td style="text-align:right">${fmtByKind(m.kind, m.get(r))}</td>`).join('');

      const curRow = byQuarter.get(lastQ);
      const prevRow = byQuarter.get(prevQuarterKey(lastQ) || '');
      const yoyRow = byQuarter.get(yoyKey(lastQ) || '');
      const curV = curRow ? m.get(curRow) : null;
      const prevV = prevRow ? m.get(prevRow) : null;
      const yoyV = yoyRow ? m.get(yoyRow) : null;
      const yoy = deltaFor(m.kind, curV, yoyV);
      const qoq = deltaFor(m.kind, curV, prevV);

      const yoyCls = (yoy>0)?'mkUp':(yoy<0)?'mkDown':'mkNeu';
      const yoyTd = `<td class="${yoyCls}" style="text-align:right">${fmtDelta(m.kind, yoy)}</td>`;
      const qoqTd = `<td style="text-align:right" class="${(qoq>0)?'mkUp':(qoq<0)?'mkDown':'mkNeu'}">${fmtDelta(m.kind, qoq)}</td>`;

      // order: older YTD first (y0), then current (y1)
      let ytd0v=null, ytd1v=null;
      let ytd0='', ytd1='';
      if(y0){
        const v = (m.kind==='pct' || m.kind==='x') ? ytdLast(m.get, y0) : ytdSum(m.get, y0);
        ytd0v = (v==null ? null : Number(v));
        ytd0 = `<td class="ytdSep" style="text-align:right">${fmtByKind(m.kind, v)}</td>`;
      }
      if(y1){
        const v = (m.kind==='pct' || m.kind==='x') ? ytdLast(m.get, y1) : ytdSum(m.get, y1);
        ytd1v = (v==null ? null : Number(v));
        ytd1 = `<td style="text-align:right">${fmtByKind(m.kind, v)}</td>`;
      }

      const ytdVar = deltaFor(m.kind, ytd1v, ytd0v);
      const ytdVarCls = (ytdVar>0)?'mkUp':(ytdVar<0)?'mkDown':'mkNeu';
      const ytdVarTd = `<td style="text-align:right" class="${ytdVarCls}">${fmtDelta(m.kind, ytdVar)}</td>`;

      return `<tr><td class="name-cell">${m.label}</td>${tds}${yoyTd}${qoqTd}${ytd0}${ytd1}${ytdVarTd}</tr>`;
    }).join('');

  } catch {
    head.innerHTML = '<tr><th style="color:var(--text-muted)">Falha ao carregar.</th></tr>';
    body.innerHTML = '<tr><td style="color:var(--text-muted)">Falha ao carregar.</td></tr>';
  }
}

let __earningsCountdownTimer = null;

async function loadNextEarningsCountdown(){
  const el = document.getElementById('earningsCountdown');
  if(!el) return;

  function parseIsoDate(s){
    const raw = String(s||'').trim();
    // Accept DD/MM/YYYY
    const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(m){
      const dd = Number(m[1]), mm = Number(m[2]), yy = Number(m[3]);
      if(dd>=1 && dd<=31 && mm>=1 && mm<=12 && yy>=2000){
        // anchor midday UTC to avoid timezone date-shift
        return new Date(Date.UTC(yy, mm-1, dd, 12, 0, 0));
      }
    }
    const d = Date.parse(raw);
    return Number.isFinite(d) ? new Date(d) : null;
  }
  function fmtDt(d){
    if(!d) return '—';
    const iso = d.toISOString().slice(0,10);
    return fmtDatePt(iso);
  }

  try{
    const r = await fetch('/api/rdor3/ri_calendar.json', { cache:'no-store' });
    if(!r.ok) throw new Error('http_'+r.status);
    const j = await r.json();
    const items = Array.isArray(j?.items) ? j.items : [];

    const now = new Date();
    const upcoming = items.map(it=>({
      title: String(it?.title||''),
      date: parseIsoDate(it?.date),
      raw: it
    })).filter(x=>x.date && x.date.getTime() >= (now.getTime() - 6*60*60*1000));

    // Prefer items that look like results/earnings; fallback to earliest upcoming.
    const isEarnings = (t)=>/resultado|earnings|divulga|trimestre|1t|2t|3t|4t/i.test(String(t||''));
    const pool = upcoming.filter(x=>isEarnings(x.title));
    const cand = (pool.length ? pool : upcoming).sort((a,b)=>a.date-b.date)[0];

    if(!cand){
      el.textContent = 'Sem data futura.';
      return;
    }

    const title = cand.title ? esc(cand.title) : 'Divulgação de resultado';
    const dt = cand.date;

    try{
      const tEl = document.getElementById('earningsTitle');
      if(tEl){
        const iso = dt ? dt.toISOString().slice(0,10) : '';
        const nice = iso ? fmtDatePt(iso) : '';
        tEl.textContent = nice ? `Próximo Resultado (${nice})` : 'Próximo Resultado';
      }
    }catch{}

    clearInterval(__earningsCountdownTimer);
    function tick(){
      const ms = dt.getTime() - Date.now();
      if(ms <= 0){
        el.innerHTML = `
          <div class="countdownGrid">
            <div class="cdBox"><div class="cdNum">00</div><div class="cdLab">Days</div></div>
            <div class="cdBox"><div class="cdNum">00</div><div class="cdLab">Hrs</div></div>
            <div class="cdBox"><div class="cdNum">00</div><div class="cdLab">Mins</div></div>
            <div class="cdBox"><div class="cdNum">00</div><div class="cdLab">Secs</div></div>
          </div>
        `;
        return;
      }
      const s = Math.floor(ms/1000);
      const dd = Math.floor(s/86400);
      const hh = Math.floor((s%86400)/3600);
      const mm = Math.floor((s%3600)/60);
      const ss = Math.floor(s%60);

      el.innerHTML = `
        <div class="countdownGrid">
          <div class="cdBox"><div class="cdNum">${String(dd).padStart(2,'0')}</div><div class="cdLab">Days</div></div>
          <div class="cdBox"><div class="cdNum">${String(hh).padStart(2,'0')}</div><div class="cdLab">Hrs</div></div>
          <div class="cdBox"><div class="cdNum">${String(mm).padStart(2,'0')}</div><div class="cdLab">Mins</div></div>
          <div class="cdBox"><div class="cdNum">${String(ss).padStart(2,'0')}</div><div class="cdLab">Secs</div></div>
        </div>
      `;
    }
    tick();
    __earningsCountdownTimer = setInterval(tick, 1000);

  }catch{
    el.textContent = 'Falha ao carregar.';
  }
}

async function loadShortInterest(){
  const val = document.getElementById('shortInterestValue');
  const sub = document.getElementById('shortInterestSub');
  if(!val || !sub) return;

  try{
    const r = await fetch('/api/rdor3/short_interest.json', { cache:'no-store' });
    if(!r.ok) throw new Error('http_'+r.status);
    const j = await r.json();
    const it = (Array.isArray(j?.items) && j.items.length) ? j.items[0] : null;

    const dt = it?.date ? fmtDatePt(it.date) : '—';
    let siPct = (it?.shortInterestPct!=null && Number.isFinite(Number(it.shortInterestPct))) ? Number(it.shortInterestPct) : null;
    const days = (it?.daysToCover!=null && Number.isFinite(Number(it.daysToCover))) ? Number(it.daysToCover) : null;

    // Defensive: some sources return short interest as fraction (0.0065) instead of percent (0.65).
    if(siPct!=null && siPct > 0 && siPct < 0.05) siPct = siPct * 100;

    val.textContent = (siPct==null) ? '—' : `${fmt(siPct,2)}%`;
    sub.textContent = `DTC: ${(days==null)?'—':fmt(days,1)+'d'} · ${dt}`;
  }catch{
    val.textContent = '—';
    sub.textContent = 'Falha ao carregar.';
  }
}

async function loadNewsTicker(){
  const wrap = document.getElementById('newsTicker');
  if(!wrap) return;

  const cacheKey = 'rdor3_newsTicker_v1';
  const now = Date.now();
  try{
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if(cached && (now - cached.ts) < 10*60*1000 && cached.text){
      wrap.style.display = 'block';
      wrap.innerHTML = `<div class="track">${esc(cached.text)}</div>`;
      return;
    }
  }catch{}

  try{
    const news = await fetch('/api/news.json', { cache:'no-store' }).then(r=>r.json());
    const items = [];
    (news?.brazilMacro||[]).slice(0,8).forEach(x=>items.push({ title:x.title, source:x.source||x.site||'' }));
    (news?.redeDor||[]).slice(0,8).forEach(x=>items.push({ title:x.title, source:x.source||x.site||'' }));

    // build two blocks: Brasil Macro then Rede D'Or
    const macro = (news?.brazilMacro||[]).slice(0,8).map(x=>({ title:x.title, source:x.source||x.site||'' }));
    const rDor  = (news?.redeDor||[]).slice(0,10).map(x=>({ title:x.title, source:x.source||x.site||'' }));

    const prompt = `Crie um ticker estilo telejornal, em 1 linha, com 2 blocos nessa ordem: (1) BRASIL MACRO, (2) REDE D'OR.\n\nFormato obrigatório:\nBRASIL MACRO: Título (Fonte) • Título (Fonte) • ...   |   REDE D'OR: Título (Fonte) • Título (Fonte) • ...\n\nRegras: sem emojis; sem hashtags; sem quebras de linha; máximo 420 caracteres; fontes sempre entre parênteses; mantenha a ordem dos blocos.\n\nManchetes BRASIL MACRO:\n${macro.map(i=>`- ${i.title} (${i.source||'fonte'})`).join('\n')}\n\nManchetes REDE D'OR:\n${rDor.map(i=>`- ${i.title} (${i.source||'fonte'})`).join('\n')}`;

    const ai = await fetch('/api/ai/openai', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({ prompt })
    }).then(r=>r.json());

    let text = String(ai?.resposta || '').replace(/\s+/g,' ').trim();
    if(!text) return;

    // normalize spacing around separators (avoid giant gaps)
    text = text
      .replace(/\s*\|\s*/g, ' | ')
      .replace(/\s*•\s*/g, ' • ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    wrap.style.display = 'block';
    // emphasize block labels
    const rich = text
      .replace(/^BRASIL MACRO:/i, '<b>BRASIL MACRO:</b>')
      .replace(/\|\s*REDE D[’\']OR:/i, ' | <b>REDE D\'OR:</b>');
    wrap.innerHTML = `<div class="track">${rich}</div>`;
    try{ localStorage.setItem(cacheKey, JSON.stringify({ ts: now, text })); }catch{}
  }catch{}
}

async function init(){
  wirePeriodTabs();
  await loadFundamentals();
  await loadMain();

  // consenso por casa (base editável)
  const byHouse = await loadConsensusByHouse();
  if(byHouse){
    renderConsensusByHouse(byHouse);
    wireConsensusHouseEditor({ items: (byHouse.items||[]).map(x=>({ ...x })) });
  } else {
    const body = document.getElementById('houseBody');
    if(body) body.innerHTML = `<tr><td colspan="5" style="color:var(--text-muted)">Sem base.</td></tr>`;
    wireConsensusHouseEditor({ items: [] });
  }

  await loadMarketHighlights();
  await loadQuarterFinancials();
  await loadNextEarningsCountdown();
  await loadShortInterest();
  await loadNewsTicker();
}

window.forceRefresh = async function(){
  const btn = document.getElementById('btn-refresh');
  if(btn) btn.classList.add('spinning');
  // bust server cache by waiting >0; we don't have a force flag, so just load twice after TTL
  await loadMain();
  await loadMarketHighlights();
  await loadShortInterest().catch(()=>{});
  if(btn) btn.classList.remove('spinning');
};

init();
