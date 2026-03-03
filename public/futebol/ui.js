/* ui.js — Controller do Simulador GuerraFoot
   Carrega dados, monta escalações, game loop, renderização.
*/

// ─── Estado global ─────────────────────────────────────────────────────────
const DATA = { times: [], players: [] };
let engine    = null;
let gameLoop  = null;
let speed     = 2;    // 1x | 2x | 4x
let paused    = false;
let activeSubSide = 'home'; // controle de substituição exibida

// Velocidade: ticks por segundo
const SPEED_MAP = { 1: 500, 2: 250, 4: 100 };

// ─── Init ──────────────────────────────────────────────────────────────────
async function init() {
  try {
    const [timesRes, playersRes] = await Promise.all([
      fetch('/guerrafoot/times2025.json'),
      fetch('/guerrafoot/players2025.json'),
    ]);
    const timesRaw = await timesRes.json();
    // times2025.json é um objeto { "Nome do Time": { ...info } }
    DATA.times = Object.entries(timesRaw).map(([name, info]) => ({ name, ...info }));
    DATA.players = await playersRes.json();
    populateSelects();
    updateLineupPreview();
    document.getElementById('btn-start').textContent = '▶ Iniciar Partida';
    document.getElementById('btn-start').disabled = false;
  } catch (e) {
    document.getElementById('btn-start').textContent = 'Erro ao carregar dados';
    console.error(e);
  }
}

// ─── Pré-jogo: selects e preview ──────────────────────────────────────────
function populateSelects() {
  const homeEl = document.getElementById('select-home');
  const awayEl = document.getElementById('select-away');
  DATA.times.forEach((t, i) => {
    homeEl.innerHTML += `<option value="${i}">${t.name}</option>`;
    awayEl.innerHTML += `<option value="${i}">${t.name}</option>`;
  });
  // default: times diferentes
  awayEl.value = 1;
  homeEl.addEventListener('change', updateLineupPreview);
  awayEl.addEventListener('change', updateLineupPreview);
}

function getTeamPlayers(teamName) {
  return DATA.players.filter(p => p.team === teamName);
}

function updateLineupPreview() {
  const hi = +document.getElementById('select-home').value;
  const ai = +document.getElementById('select-away').value;
  const ht = DATA.times[hi];
  const at = DATA.times[ai];
  if (!ht || !at) return;

  const hp = getTeamPlayers(ht.name);
  const ap = getTeamPlayers(at.name);

  renderLineupPreview('home', ht.name, hp);
  renderLineupPreview('away', at.name, ap);
}

function posGroup(p) {
  const pos = (p.position || '').toUpperCase();
  if (pos === 'GK') return 'GK';
  if (['D','CB','LB','RB','WB','DF'].some(x => pos.startsWith(x))) return 'DEF';
  if (['M','AM','DM','CM','CAM','CDM','LM','RM','MF'].some(x => pos.startsWith(x))) return 'MID';
  return 'ATK';
}

function renderLineupPreview(side, teamName, players) {
  document.getElementById(`${side}-lineup-title`).textContent = teamName;
  const list = document.getElementById(`${side}-lineup-list`);
  list.innerHTML = '';

  // Ordena por overall e pega top 11
  const sorted = [...players].sort((a, b) => (b.overall_rating || b.overall || 0) - (a.overall_rating || a.overall || 0));
  // tenta montar 1GK+4DEF+3MID+3ATK
  const byPos = { GK: [], DEF: [], MID: [], ATK: [] };
  sorted.forEach(p => byPos[posGroup(p)].push(p));
  const xi = [
    ...byPos.GK.slice(0, 1),
    ...byPos.DEF.slice(0, 4),
    ...byPos.MID.slice(0, 3),
    ...byPos.ATK.slice(0, 3),
  ];
  while (xi.length < 11) {
    const used = new Set(xi.map(p => p.id));
    const next = sorted.find(p => !used.has(p.id));
    if (!next) break;
    xi.push(next);
  }

  xi.slice(0, 11).forEach(p => {
    const pg  = posGroup(p);
    const rat = p.overall_rating || p.overall || '?';
    const num = p.jerseyNumber || '—';
    const li  = document.createElement('li');
    li.innerHTML = `
      <span class="pos-badge ${pg}">${pg}</span>
      <span class="jersey-num">${num}</span>
      <span class="player-name">${p.name || 'Jogador'}</span>
      <span class="player-rating">${rat}</span>`;
    list.appendChild(li);
  });
}

// ─── Iniciar partida ─────────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', startMatch);

function startMatch() {
  const hi = +document.getElementById('select-home').value;
  const ai = +document.getElementById('select-away').value;
  const ht = DATA.times[hi];
  const at = DATA.times[ai];
  if (!ht || !at || hi === ai) {
    alert('Selecione dois times diferentes!');
    return;
  }

  const hp = getTeamPlayers(ht.name);
  const ap = getTeamPlayers(at.name);

  engine = new MatchEngine(ht, at, hp, ap, { mode: 'league' });
  engine.advance(); // PRE_GAME → FIRST_HALF

  // Montar UI
  document.getElementById('name-home').textContent = ht.name;
  document.getElementById('name-away').textContent = at.name;
  document.getElementById('field-label-home').textContent = abbreviate(ht.name);
  document.getElementById('field-label-away').textContent = abbreviate(at.name);
  initCrest('crest-home', ht.name, 'home');
  initCrest('crest-away', at.name, 'away');

  document.getElementById('screen-pre').style.display  = 'none';
  document.getElementById('screen-live').style.display = 'block';
  document.getElementById('finished-overlay').classList.remove('show');

  populateSubSelects();
  renderState();
  startLoop();
}

function abbreviate(name) {
  const parts = name.split(' ');
  if (parts.length === 1) return name.slice(0, 4).toUpperCase();
  return parts.map(w => w[0]).join('').toUpperCase().slice(0, 4);
}

function initCrest(id, name, side) {
  const el  = document.getElementById(id);
  const abbr = abbreviate(name);
  el.textContent = abbr.slice(0, 2);
  el.style.background = side === 'home' ? '#1a3a5c' : '#5c1a1a';
}

// ─── Game Loop ────────────────────────────────────────────────────────────
function startLoop() {
  clearInterval(gameLoop);
  gameLoop = setInterval(tick, SPEED_MAP[speed]);
}

function tick() {
  if (!engine || paused) return;
  engine.advance();
  renderState();

  const st = engine.getState();
  if (st.phase === 'HALF_TIME') {
    clearInterval(gameLoop);
    showHalftime(st);
  }
  if (st.phase === 'FINISHED') {
    clearInterval(gameLoop);
    showFinished(st);
  }
}

// ─── Renderização ─────────────────────────────────────────────────────────
function renderState() {
  const st = engine.getState();
  const s  = st.score;

  // Placar e minuto
  document.getElementById('score-home').textContent = s.home;
  document.getElementById('score-away').textContent = s.away;
  document.getElementById('minute-display').textContent = `${st.minute}'`;

  // Phase badge
  const badge = document.getElementById('phase-badge');
  if (st.phase === 'FIRST_HALF' || st.phase === 'SECOND_HALF') {
    badge.textContent = 'AO VIVO'; badge.className = 'phase-badge live';
  } else if (st.phase === 'HALF_TIME') {
    badge.textContent = 'INTERVALO'; badge.className = 'phase-badge ht';
  } else if (st.phase === 'FINISHED') {
    badge.textContent = 'FIM'; badge.className = 'phase-badge ft';
  }

  // Stats
  const hs = st.stats.home;
  const as = st.stats.away;
  setStatBar('poss',    st.possession.home,  st.possession.away,  '%');
  setStatBar('shots',   hs.shots,            as.shots,            '');
  setStatBar('xg',      hs.xG,               as.xG,               '');
  document.getElementById('stat-poss-home').textContent   = `${st.possession.home}%`;
  document.getElementById('stat-poss-away').textContent   = `${st.possession.away}%`;
  document.getElementById('stat-shots-home').textContent  = hs.shots;
  document.getElementById('stat-shots-away').textContent  = as.shots;
  document.getElementById('stat-xg-home').textContent     = hs.xG.toFixed(1);
  document.getElementById('stat-xg-away').textContent     = as.xG.toFixed(1);
  document.getElementById('stat-sot-home').textContent    = hs.shotsOnTarget;
  document.getElementById('stat-sot-away').textContent    = as.shotsOnTarget;
  document.getElementById('stat-fouls-home').textContent  = hs.fouls;
  document.getElementById('stat-fouls-away').textContent  = as.fouls;
  document.getElementById('stat-corners-home').textContent = hs.corners;
  document.getElementById('stat-corners-away').textContent = as.corners;
  document.getElementById('stat-yellow-home').textContent = `${hs.yellowCards}🟨 ${hs.redCards > 0 ? hs.redCards + '🟥' : ''}`;
  document.getElementById('stat-yellow-away').textContent = `${as.yellowCards}🟨 ${as.redCards > 0 ? as.redCards + '🟥' : ''}`;

  // Momentum
  renderMomentum(st.momentum);

  // Campo — bola
  moveBall(st.ballSector);

  // Narração
  renderCommentary(st.events);
}

function setStatBar(key, homeVal, awayVal, suffix) {
  const total = (homeVal + awayVal) || 1;
  const pct   = Math.round(homeVal / total * 100);
  document.getElementById(`bar-${key}-home`).style.width = `${pct}%`;
}

function renderMomentum(mom) {
  const fill = document.getElementById('momentum-fill');
  // mom range -100 a 100; center = 50%
  const pct = Math.round(50 + mom * 0.4); // map ±100 → 10%–90%
  if (mom > 0) {
    // home domina — barra da esquerda
    fill.style.left   = `${Math.max(pct, 50)}%`;
    fill.style.right  = 'auto';
    fill.style.width  = `${Math.min(pct - 50, 40)}%`;
    fill.style.background = 'var(--home)';
  } else {
    fill.style.left  = 'auto';
    fill.style.right = `${Math.max(50 - pct, 0)}%`;
    fill.style.width  = `${Math.min(50 - pct, 40)}%`;
    fill.style.background = 'var(--away)';
  }
}

// Bola SVG
const BALL_POS = {
  'home_gk':  { cx: 30,  cy: 90 },
  'home_def': { cx: 100, cy: 90 },
  'mid':      { cx: 200, cy: 90 },
  'away_def': { cx: 300, cy: 90 },
  'away_gk':  { cx: 370, cy: 90 },
};
let lastSector = 'mid';
function moveBall(sector) {
  if (!sector || sector === lastSector) return;
  lastSector = sector;
  const ball = document.getElementById('ball');
  const pos  = BALL_POS[sector] || BALL_POS['mid'];
  // ligeiro randomize vertical
  const cy = pos.cy + (Math.random() * 60 - 30);
  ball.setAttribute('cx', pos.cx);
  ball.setAttribute('cy', Math.round(cy));

  // Iluminar setor ativo
  const sectorMap = {
    'home_gk':  'sector-home-gk',
    'home_def': 'sector-home-def',
    'mid':      'sector-mid',
    'away_def': 'sector-away-def',
    'away_gk':  'sector-away-gk',
  };
  document.querySelectorAll('.field-sector').forEach(el => el.style.opacity = '0.5');
  const activeEl = document.getElementById(sectorMap[sector]);
  if (activeEl) activeEl.style.opacity = '0.95';
}

// Narração — só renderiza novos eventos
let lastEventCount = 0;
function renderCommentary(events) {
  if (events.length === lastEventCount) return;
  lastEventCount = events.length;
  const list = document.getElementById('commentary-list');
  list.innerHTML = '';
  events.forEach(ev => {
    const div = document.createElement('div');
    div.className = 'comm-item ' + commClass(ev.type);
    div.innerHTML = `
      <span class="comm-min">${ev.min}'</span>
      <span class="comm-icon">${commIcon(ev.type)}</span>
      <span class="comm-text">${ev.text}</span>`;
    list.appendChild(div);
  });
  // scroll para topo (evento mais recente)
  list.scrollTop = 0;
}

function commClass(type) {
  const map = {
    goal: 'goal', goal_own: 'goal-own', goal_header: 'goal', goal_freekick: 'goal',
    yellow: 'card-yellow', red: 'card-red',
    var: 'var', phase: 'phase', injury: 'injury',
  };
  return map[type] || '';
}

function commIcon(type) {
  const map = {
    goal: '⚽', goal_own: '😬', goal_header: '⚽', goal_freekick: '⚽',
    save: '🧤', miss: '💨', corner: '🚩', freekick: '🎯',
    foul: '🦵', yellow: '🟨', red: '🟥',
    injury: '🚑', var: '📺', phase: '📣', sub: '🔄', pressure: '🔥',
  };
  return map[type] || '▪';
}

// ─── Intervalo ───────────────────────────────────────────────────────────
function showHalftime(st) {
  const s  = st.score;
  const hs = st.stats.home;
  const as = st.stats.away;
  document.getElementById('ht-score').textContent    = `${s.home} – ${s.away}`;
  document.getElementById('ht-teams').textContent    = `${engine.home.name} × ${engine.away.name}`;
  document.getElementById('ht-shots-home').textContent = hs.shots;
  document.getElementById('ht-shots-away').textContent = as.shots;
  document.getElementById('ht-poss-home').textContent  = `${st.possession.home}%`;
  document.getElementById('ht-poss-away').textContent  = `${st.possession.away}%`;
  document.getElementById('ht-xg-home').textContent    = hs.xG.toFixed(1);
  document.getElementById('ht-xg-away').textContent    = as.xG.toFixed(1);
  document.getElementById('halftime-overlay').classList.add('show');
}

document.getElementById('btn-continue').addEventListener('click', () => {
  document.getElementById('halftime-overlay').classList.remove('show');
  engine.startSecondHalf();
  startLoop();
});

// ─── Fim de jogo ─────────────────────────────────────────────────────────
function showFinished(st) {
  const s = st.score;
  document.getElementById('final-score').textContent = `${s.home} – ${s.away}`;
  document.getElementById('final-teams').textContent = `${engine.home.name} × ${engine.away.name}`;

  // MVP: jogador com mais gols ou melhor rating
  const allPlayers = [...st.homePlayers, ...st.awayPlayers];
  const mvp = allPlayers.sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0))[0];
  document.getElementById('mvp-name').textContent = mvp ? mvp.name : '—';
  document.getElementById('mvp-team').textContent = mvp ? mvp.team : '—';

  document.getElementById('finished-overlay').classList.add('show');
}

document.getElementById('btn-new-game').addEventListener('click', () => {
  clearInterval(gameLoop);
  engine = null;
  lastEventCount = 0;
  lastSector = 'mid';
  document.getElementById('finished-overlay').classList.remove('show');
  document.getElementById('screen-live').style.display = 'none';
  document.getElementById('screen-pre').style.display  = 'block';
  document.getElementById('commentary-list').innerHTML = '';
  updateLineupPreview();
});

// ─── Controles ────────────────────────────────────────────────────────────
document.getElementById('btn-pause').addEventListener('click', () => {
  paused = !paused;
  const btn = document.getElementById('btn-pause');
  btn.textContent = paused ? '▶ Continuar' : '⏸ Pausar';
  btn.classList.toggle('paused', paused);
});

document.querySelectorAll('.speed-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    speed = +btn.dataset.speed;
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (!paused) startLoop();
  });
});

// ─── Substituições ────────────────────────────────────────────────────────
function populateSubSelects() {
  if (!engine) return;
  const st = engine.getState();
  populateSubSide('home', st);
  populateSubSide('away', st);
}

function populateSubSide(side, st) {
  const outEl = document.getElementById('sub-out-select');
  const inEl  = document.getElementById('sub-in-select');
  outEl.innerHTML = `<option value="">Saindo (${side === 'home' ? engine.home.name : engine.away.name})...</option>`;
  inEl.innerHTML  = `<option value="">Entrada...</option>`;

  const players = side === 'home' ? st.homePlayers : st.awayPlayers;
  const bench   = side === 'home' ? st.homeBench   : st.awayBench;

  players.filter(p => p.active && !p.redCard).forEach(p => {
    outEl.innerHTML += `<option value="${p.id}|${side}">${p.name || 'Jogador'} (${p.overall_rating || p.overall || '?'})</option>`;
  });
  bench.forEach(p => {
    inEl.innerHTML += `<option value="${p.id}|${side}">${p.name || 'Jogador'} (${p.overall_rating || p.overall || '?'})</option>`;
  });
}

document.getElementById('btn-sub').addEventListener('click', () => {
  if (!engine) return;
  const outVal = document.getElementById('sub-out-select').value;
  const inVal  = document.getElementById('sub-in-select').value;
  if (!outVal || !inVal) return;

  const [outId, outSide] = outVal.split('|');
  const [inId,  inSide]  = inVal.split('|');
  if (outSide !== inSide) return;

  const ok = engine.applySub(outSide, +outId, +inId);
  if (ok) {
    populateSubSelects();
    renderState();
  }
});

// Atualiza sub selects a cada 10s (entradas/saídas por lesão)
setInterval(() => {
  if (engine) populateSubSelects();
}, 10000);

// ─── Start ────────────────────────────────────────────────────────────────
init();
