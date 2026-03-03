/* engine.js — MatchEngine v1.0
   Simulador de futebol ao vivo, Brasileirão 2025
   Tick = 30s de jogo real. Partida = 180 ticks (90 min).
*/

// ─── Atributos derivados dos dados brutos ────────────────────────────────────
function deriveAttrs(p) {
  const base = (p.overall_rating || p.overall || 50);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

  const pos = (p.position || '').toUpperCase();
  const isFW = ['F','ST','CF','SS'].some(x => pos.includes(x));
  const isMF = ['M','AM','DM','CM','CAM','CDM','LM','RM'].some(x => pos.includes(x));
  const isDEF = ['D','CB','LB','RB','WB'].some(x => pos.includes(x));
  const isGK = pos === 'GK';

  const shotAcc  = p.shotsOnTarget && p.totalShots ? p.shotsOnTarget / p.totalShots : 0.4;
  const passAcc  = (p.accuratePassesPercentage || 70) / 100;
  const dribAcc  = (p.successfulDribblesPercentage || 40) / 100;
  const xg       = p.expectedGoals || 0;
  const apps     = p.appearances || 1;
  const height   = p.height_cm || 178;

  const finishing   = clamp(base + xg * 3 + shotAcc * 12 + (isFW ? 6 : 0), 40, 95);
  const dribbling   = clamp(base + dribAcc * 18 + (isMF || isFW ? 4 : 0), 40, 95);
  const pace        = clamp(base + (isFW ? 8 : isMF ? 5 : 0) - (height > 185 ? 3 : 0), 40, 95);
  const passing     = clamp(base + passAcc * 15 + (p.keyPasses || 0) * 0.4, 40, 95);
  const positioning = clamp(base + (p.keyPasses || 0) * 0.5 + (p.bigChancesCreated || 0) * 1.5 + (isDEF ? (p.clearances || 0) * 0.3 : 0), 40, 95);
  const composure   = clamp(base + (p.rating || 6.5) * 1.5 - (p.bigChancesMissed || 0) * 1.5, 40, 95);
  const strength    = clamp(base + (height > 183 ? 5 : 0) + (p.tackles || 0) * 0.3, 40, 95);
  const decision    = clamp(base + passAcc * 10 + (p.keyPasses || 0) * 0.5, 40, 95);
  const tackling    = clamp(base + (p.tackles || 0) * 0.6 + (p.interceptions || 0) * 0.5 + (p.clearances || 0) * 0.3, 40, 95);
  const stamina     = clamp(base + Math.min(apps, 38) * 0.3, 40, 95);
  const gkSkill     = isGK ? clamp(base + (p.saves || 0) * 0.4, 40, 95) : 0;

  return { finishing, dribbling, pace, passing, positioning, composure, strength, decision, tackling, stamina, gkSkill, isGK, isFW, isMF, isDEF };
}

// ─── Narração ────────────────────────────────────────────────────────────────
const TEMPLATES = {
  goal: [
    '{player} balança as redes! {team} abre {score}!',
    'GOOOL! {player} não perdoa e faz {score}!',
    '{player} recebe, domina e manda pra rede! {score}',
    'Que jogada! {player} marca pro {team}! {score}',
    '{player} estava no lugar certo! Golaço! {score}',
  ],
  goal_header: [
    '{player} de cabeça! Perfeito! {score}',
    'Cruzamento na medida, {player} cabeceia! {score}',
    '{player} sobe mais que todos e manda pra rede! {score}',
  ],
  goal_freekick: [
    '{player} cobra a falta direto! Que golaço! {score}',
    'Falta caprichada de {player}! {team} amplia! {score}',
    '{player} na bola parada é outro nível! {score}',
  ],
  goal_own: [
    'Gol contra! {player} infeliz, bola na própria rede! {score}',
    'Que azar de {player}! Gol contra involuntário! {score}',
  ],
  save: [
    'Grande defesa do goleiro! {rival} por pouco!',
    'Que intervenção! O goleiro tirou do ângulo!',
    'Incrível! O goleiro voou para defender o chute de {player}!',
    'Milagre do goleiro! O {rival} quase abriu o placar!',
    '{player} chuta forte, mas o goleiro estava bem posicionado!',
  ],
  miss: [
    '{player} chuta e manda por cima do gol!',
    'Que desperdício de {player}! A bola foi à direita do gol.',
    '{player} fica cara a cara mas desperdiça a chance!',
    'Pressão do {team}! Mas {player} não aproveita.',
    'A bola passou rente à trave depois do chute de {player}!',
  ],
  corner: [
    'Escanteio para o {team}! {player} vai cobrar.',
    'Bola no escanteio! {team} cresce no jogo.',
    'Pressão do {team}! Cobrança de escanteio agora.',
  ],
  freekick: [
    'Falta perigosa para o {team}! {player} se prepara para cobrar.',
    'Árbitro marca falta. {player} vai para a bola.',
    'Falta na entrada da área. Grande oportunidade para o {team}!',
  ],
  foul: [
    'Falta cometida por {player}. Árbitro não deixa passar.',
    '{player} intercepta duro e o árbitro para o jogo.',
    'Jogo brusco de {player}. Árbitro assobia.',
    'Falta dura de {player}. Protestos em campo.',
  ],
  yellow: [
    'CARTÃO AMARELO para {player}! Reclamação excessiva.',
    'Árbitro mostra o amarelo para {player} após falta dura.',
    '{player} recebe o amarelo. Cuidado para não ser expulso!',
    'Cartão amarelo! {player} vai ter que se controlar.',
  ],
  red: [
    'CARTÃO VERMELHO! {player} é expulso de campo!',
    'Falta violenta de {player}! Vermelho direto, expulsão!',
    '{player} recebe o segundo amarelo e está fora! {team} em desvantagem.',
  ],
  injury: [
    '{player} fica no chão reclamando de dores. Parece sério.',
    'Jogo parado! {player} precisa de atendimento médico.',
    'Preocupação com {player}, que saiu mancando do campo.',
  ],
  pressure: [
    '{team} em busca do empate! Campo todo no ataque!',
    'Os minutos finais prometem! {team} não aceita o resultado.',
    'Pressão total do {team}! O {rival} se defende como pode.',
    'Reta final! {team} arrisca tudo em busca do gol.',
  ],
  var_check: [
    'VAR em andamento... Árbitro revisa o lance no vídeo.',
    'Revisão do VAR! A jogada está sendo analisada.',
    'Árbitro chamado para checar o monitor de campo. VAR!',
  ],
  var_confirm: [
    'Gol confirmado pelo VAR! A decisão se mantém.',
    'VAR confirma! O lance foi regular. Gol válido!',
  ],
  var_reverse: [
    'VAR anula o gol! Impedimento flagrado na revisão.',
    'Gol anulado! O VAR identificou irregularidade no lance.',
    'Reviravolta! O VAR cancela o gol após revisão.',
  ],
  halftime: [
    'Apita o árbitro! Fim do primeiro tempo.',
    'Intervalo! As equipes se recolhem ao vestiário.',
  ],
  kickoff2: [
    'Começa o segundo tempo! A bola rola novamente.',
    'Reinício da partida! Segundo tempo em andamento.',
  ],
  fulltime: [
    'Apita final! Fim de jogo!',
    'Acabou! O árbitro encerra a partida.',
    'Fim de jogo! O placar está definido.',
  ],
};

function pick(key, vars = {}) {
  const arr = TEMPLATES[key] || ['...'];
  let t = arr[Math.floor(Math.random() * arr.length)];
  Object.entries(vars).forEach(([k, v]) => { t = t.replaceAll(`{${k}}`, v); });
  return t;
}

// ─── Escalação automática ────────────────────────────────────────────────────
function buildLineup(players) {
  // Retorna 11 titulares: 1 GK + 4 DEF + 3 MID + 3 ATK (melhor overall por posição)
  const byPos = { GK: [], DEF: [], MID: [], ATK: [] };
  for (const p of players) {
    const pos = (p.position || '').toUpperCase();
    if (pos === 'GK') byPos.GK.push(p);
    else if (['D','CB','LB','RB','WB','DF'].some(x => pos.startsWith(x))) byPos.DEF.push(p);
    else if (['M','AM','DM','CM','CAM','CDM','LM','RM','MF'].some(x => pos.startsWith(x))) byPos.MID.push(p);
    else byPos.ATK.push(p);
  }
  const top = (arr, n) => [...arr].sort((a, b) => (b.overall_rating || b.overall || 0) - (a.overall_rating || a.overall || 0)).slice(0, n);
  const starters = [
    ...top(byPos.GK, 1),
    ...top(byPos.DEF, 4),
    ...top(byPos.MID, 3),
    ...top(byPos.ATK, 3),
  ];
  // fallback: preenche com os melhores disponíveis se faltarem posições
  if (starters.length < 11) {
    const used = new Set(starters.map(p => p.id));
    const rest = players.filter(p => !used.has(p.id)).sort((a, b) => (b.overall_rating || b.overall || 0) - (a.overall_rating || a.overall || 0));
    while (starters.length < 11 && rest.length) starters.push(rest.shift());
  }
  // reservas (próximos 7)
  const usedIds = new Set(starters.map(p => p.id));
  const bench = players.filter(p => !usedIds.has(p.id))
    .sort((a, b) => (b.overall_rating || b.overall || 0) - (a.overall_rating || a.overall || 0))
    .slice(0, 7);

  return { starters: starters.slice(0, 11), bench };
}

// ─── Classe principal ─────────────────────────────────────────────────────────
class MatchEngine {
  constructor(homeTeam, awayTeam, homePlayers, awayPlayers, options = {}) {
    this.home = homeTeam;
    this.away = awayTeam;

    const hLineup = buildLineup(homePlayers);
    const aLineup = buildLineup(awayPlayers);

    this.homePlayers = hLineup.starters.map(p => this._initPlayer(p, 'home'));
    this.awayPlayers = aLineup.starters.map(p => this._initPlayer(p, 'away'));
    this.homeBench   = hLineup.bench.map(p => this._initPlayer(p, 'home'));
    this.awayBench   = aLineup.bench.map(p => this._initPlayer(p, 'away'));

    this.score  = { home: 0, away: 0 };
    this.minute = 0;
    this.tick   = 0;  // ticks processados
    this.phase  = 'PRE_GAME';  // PRE_GAME FIRST_HALF HALF_TIME SECOND_HALF FINISHED
    this.events = [];          // log de eventos

    // Momentum: positivo = home domina, negativo = away domina
    this.momentum = 0;

    // Estatísticas
    this.stats = {
      home: { shots: 0, shotsOnTarget: 0, possession: 0, fouls: 0, corners: 0, xG: 0, yellowCards: 0, redCards: 0 },
      away: { shots: 0, shotsOnTarget: 0, possession: 0, fouls: 0, corners: 0, xG: 0, yellowCards: 0, redCards: 0 },
    };
    this.totalTicks = 0;  // para % posse

    // Posição da bola no campo: 'home_gk' | 'home_def' | 'mid' | 'away_def' | 'away_gk'
    this.ballSector = 'mid';
    this.ballSide   = 'neutral';  // 'home' | 'away' | 'neutral'

    // Substituições realizadas
    this.subs = { home: 0, away: 0 };
    this.maxSubs = 5;

    // Acumuladores de tempo extra
    this._extraMinutes = 0;
    this._injuryTime   = 0;

    this.options = { mode: 'league', ...options };
  }

  _initPlayer(p, side) {
    const attrs = deriveAttrs(p);
    return {
      ...p,
      side,
      attrs,
      currentStamina: attrs.stamina,
      yellowCards: 0,
      redCard: false,
      injured: false,
      active: true,
    };
  }

  // Equipes ativas em campo
  _activePlayers(side) {
    const list = side === 'home' ? this.homePlayers : this.awayPlayers;
    return list.filter(p => p.active && !p.redCard);
  }

  // Jogador aleatório ponderado por atributo
  _pickPlayer(side, attrKey, weights = null) {
    const players = this._activePlayers(side);
    if (!players.length) return null;
    const scores = players.map(p => {
      const base = (p.attrs[attrKey] || 60);
      const stamMod = p.currentStamina < 25 ? 0.7 : 1;
      return base * stamMod;
    });
    const total = scores.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < players.length; i++) {
      r -= scores[i];
      if (r <= 0) return players[i];
    }
    return players[players.length - 1];
  }

  _pickGK(side) {
    const list = side === 'home' ? this.homePlayers : this.awayPlayers;
    return list.find(p => p.attrs.isGK && p.active) || list[0];
  }

  _teamRating(side) {
    const players = this._activePlayers(side);
    if (!players.length) return 60;
    return players.reduce((sum, p) => sum + (p.overall_rating || p.overall || 60), 0) / players.length;
  }

  _addEvent(type, text, min, side = null, extra = {}) {
    this.events.unshift({ type, text, min, side, ...extra });
    if (this.events.length > 100) this.events.pop();
  }

  // ─── Tick principal ────────────────────────────────────────────────────────
  advance() {
    if (this.phase === 'PRE_GAME') {
      this.phase = 'FIRST_HALF';
      this.minute = 1;
      return;
    }
    if (this.phase === 'HALF_TIME' || this.phase === 'FINISHED') return;

    this.tick++;
    this.totalTicks++;
    this.minute = this._calcMinute();

    // Decaimento de momentum
    this.momentum *= 0.985;

    // Stamina decay para todos
    const allActive = [...this._activePlayers('home'), ...this._activePlayers('away')];
    allActive.forEach(p => {
      p.currentStamina = Math.max(0, p.currentStamina - 0.15);
    });

    // Determine possession this tick
    const homePassing = this._teamRating('home') + this.momentum * 0.1;
    const awayPassing = this._teamRating('away') - this.momentum * 0.1;
    const homeHasBall = Math.random() * (homePassing + awayPassing) < homePassing;
    const attackSide  = homeHasBall ? 'home' : 'away';
    const defendSide  = homeHasBall ? 'away' : 'home';

    if (homeHasBall) {
      this.stats.home.possession++;
      this.ballSector = 'away_def';
      this.ballSide   = 'home';
    } else {
      this.stats.away.possession++;
      this.ballSector = 'home_def';
      this.ballSide   = 'away';
    }

    // Ação do tick
    this._simulateAction(attackSide, defendSide);

    // Checar lesões
    if (Math.random() < 0.003) this._handleInjury(attackSide);

    // Verificar fase
    this._checkPhase();
  }

  _calcMinute() {
    if (this.phase === 'FIRST_HALF')  return Math.min(45 + this._injuryTime, Math.ceil(this.tick * 0.5));
    if (this.phase === 'SECOND_HALF') return Math.min(90 + this._injuryTime, 45 + Math.ceil((this.tick - 90) * 0.5));
    return this.minute;
  }

  _simulateAction(attSide, defSide) {
    const attacker  = this._pickPlayer(attSide, 'finishing');
    const midfielder = this._pickPlayer(attSide, 'passing');
    const defender  = this._pickPlayer(defSide, 'tackling');
    const gk        = this._pickGK(defSide);
    if (!attacker || !defender) return;

    const min = this.minute;
    const attName  = attacker.name || 'Jogador';
    const midName  = midfielder ? (midfielder.name || 'Jogador') : attName;
    const attTeam  = attSide === 'home' ? this.home.name : this.away.name;
    const defTeam  = defSide === 'home' ? this.home.name : this.away.name;

    // Pressão final
    let pressureBonus = 0;
    if (min > 75) {
      const losing = (attSide === 'home' && this.score.home < this.score.away) ||
                     (attSide === 'away' && this.score.away < this.score.home);
      if (losing) pressureBonus = min > 85 ? 0.25 : 0.15;
      if (losing && Math.random() < 0.04) {
        this._addEvent('pressure', pick('pressure', { team: attTeam, rival: defTeam }), min, attSide);
      }
    }

    // Falta
    const foulChance = 0.08 + (defender.attrs.strength || 60) * 0.0005;
    if (Math.random() < foulChance) {
      this._handleFoul(defSide, defender, attSide, midfielder, midName, attTeam);
      return;
    }

    // Chute
    const shootChance = 0.18 + pressureBonus + attacker.attrs.finishing * 0.001;
    if (Math.random() < shootChance) {
      this._handleShot(attSide, defSide, attacker, defender, gk, attName, attTeam, defTeam);
      return;
    }

    // Cross/corner (menos frequente)
    if (Math.random() < 0.06) {
      this._handleCorner(attSide, defSide, attacker, gk, attName, attTeam, defTeam);
    }
  }

  _handleShot(attSide, defSide, attacker, defender, gk, attName, attTeam, defTeam) {
    const min = this.minute;
    this.stats[attSide].shots++;

    const finAttr  = attacker.attrs.finishing || 60;
    const defAttr  = defender.attrs.tackling  || 60;
    const gkAttr   = gk ? (gk.attrs.gkSkill || 65) : 65;
    const stamMod  = attacker.currentStamina < 25 ? 0.8 : 1;

    const xG = Math.min(0.9, (finAttr / 100) * 0.55 * stamMod * (1 + this.momentum * 0.003));
    this.stats[attSide].xG = +(this.stats[attSide].xG + xG).toFixed(3);

    // On target?
    if (Math.random() > finAttr / 110) {
      this._addEvent('miss', pick('miss', { player: attName, team: attTeam }), min, attSide);
      return;
    }
    this.stats[attSide].shotsOnTarget++;

    // Gol?
    const saveChance = (gkAttr + defAttr * 0.3) / 160;
    if (Math.random() < saveChance) {
      this.momentum += defSide === 'home' ? 3 : -3;
      this.ballSector = 'mid';
      this._addEvent('save', pick('save', { player: attName, rival: attTeam }), min, defSide);
      return;
    }

    // GOOOL
    this._registerGoal(attSide, attacker, attName, attTeam, 'normal');
  }

  _handleCorner(attSide, defSide, attacker, gk, attName, attTeam, defTeam) {
    const min = this.minute;
    this.stats[attSide].corners++;
    this._addEvent('corner', pick('corner', { team: attTeam, player: attName }), min, attSide);

    // Chance de gol de cabeça
    const header = this._pickPlayer(attSide, 'strength');
    if (!header) return;
    const gkAttr = gk ? (gk.attrs.gkSkill || 65) : 65;

    if (Math.random() < 0.12) {
      const saved = Math.random() < gkAttr / 120;
      if (saved) {
        this._addEvent('save', pick('save', { player: header.name, rival: attTeam }), min, defSide);
      } else {
        this._registerGoal(attSide, header, header.name || attName, attTeam, 'header');
      }
    }
  }

  _handleFoul(defSide, defender, attSide, attacker, attName, attTeam) {
    const min = this.minute;
    const defName = defender.name || 'Jogador';
    const defTeam = defSide === 'home' ? this.home.name : this.away.name;

    this.stats[defSide].fouls++;
    this.momentum += defSide === 'home' ? -3 : 3;

    // Cartão?
    let cardGiven = false;
    if (Math.random() < 0.009) {
      // Vermelho direto
      defender.redCard = true;
      defender.active  = false;
      this.stats[defSide].redCards++;
      this._addEvent('red', pick('red', { player: defName, team: defTeam }), min, defSide, { player: defName });
      cardGiven = true;
    } else if (Math.random() < 0.07) {
      // Amarelo
      defender.yellowCards++;
      this.stats[defSide].yellowCards++;
      if (defender.yellowCards >= 2) {
        defender.redCard = true;
        defender.active  = false;
        this.stats[defSide].redCards++;
        this._addEvent('red', pick('red', { player: defName, team: defTeam }), min, defSide, { player: defName });
      } else {
        this._addEvent('yellow', pick('yellow', { player: defName }), min, defSide, { player: defName });
      }
      cardGiven = true;
    }

    if (!cardGiven) {
      if (Math.random() < 0.3) {
        this._addEvent('foul', pick('foul', { player: defName }), min, defSide);
      }
    }

    // Falta perigosa → cobrança
    if (Math.random() < 0.35) {
      this._addEvent('freekick', pick('freekick', { team: attTeam, player: attName }), min, attSide);
      this._handleFreekick(attSide, defSide, attacker, attName, attTeam);
    }
  }

  _handleFreekick(attSide, defSide, attacker, attName, attTeam) {
    const min = this.minute;
    const gk  = this._pickGK(defSide);
    const gkAttr = gk ? (gk.attrs.gkSkill || 65) : 65;
    this.stats[attSide].shots++;

    if (Math.random() < 0.14) {
      this.stats[attSide].shotsOnTarget++;
      if (Math.random() > gkAttr / 110) {
        this._registerGoal(attSide, attacker, attName, attTeam, 'freekick');
        return;
      }
    }
    if (Math.random() < 0.2) this._handleCorner(attSide, defSide, attacker, gk, attName, attTeam, '');
  }

  _registerGoal(side, player, playerName, teamName, type) {
    const min = this.minute;

    // Gol próprio? (raro, 3%)
    const ownGoal = Math.random() < 0.03;
    if (ownGoal) {
      const defSide = side === 'home' ? 'away' : 'home';
      const defPlayer = this._pickPlayer(defSide, 'tackling');
      const defName = defPlayer ? defPlayer.name : 'Defensor';
      this.score[side]++;
      const scoreStr = `${this.score.home}–${this.score.away}`;
      this._addEvent('goal_own', pick('goal_own', { player: defName, score: scoreStr }), min, side, { player: defName, isGoal: true });
      this.momentum += side === 'home' ? 25 : -25;
      return;
    }

    this.score[side]++;
    const scoreStr = `${this.score.home}–${this.score.away}`;
    const tplKey = type === 'header' ? 'goal_header' : type === 'freekick' ? 'goal_freekick' : 'goal';
    const text = pick(tplKey, { player: playerName, team: teamName, score: scoreStr });
    this._addEvent('goal', text, min, side, { player: playerName, isGoal: true });
    this.momentum += side === 'home' ? 25 : -25;
    this.ballSector = 'mid';

    // VAR check
    if (Math.random() < 0.12) {
      setTimeout(() => {}, 0); // assíncrono visual tratado na UI
      this._addEvent('var', pick('var_check'), min, null, { varType: 'check' });
      if (Math.random() < 0.40) {
        this.score[side]--;
        this._addEvent('var', pick('var_reverse'), min, null, { varType: 'reverse' });
      } else {
        this._addEvent('var', pick('var_confirm'), min, null, { varType: 'confirm' });
      }
    }
  }

  _handleInjury(side) {
    const player = this._pickPlayer(side, 'stamina');
    if (!player) return;
    const min = this.minute;
    const name = player.name || 'Jogador';
    this._addEvent('injury', pick('injury', { player: name }), min, side, { player: name });

    const major = Math.random() < 0.35;
    if (major) {
      // Força substituição obrigatória
      const bench = side === 'home' ? this.homeBench : this.awayBench;
      const available = bench.filter(p => p.active);
      const maxSubs = this.maxSubs;
      if (available.length && this.subs[side] < maxSubs) {
        this._doSub(side, player, available[0]);
      } else {
        player.injured = true;
        player.active  = false;
      }
    } else {
      player.currentStamina = Math.max(0, player.currentStamina - 15);
    }
  }

  _doSub(side, outPlayer, inPlayer) {
    outPlayer.active = false;
    inPlayer.active  = true;
    inPlayer.currentStamina = inPlayer.attrs.stamina; // pernas frescas
    this.subs[side]++;
    const bench = side === 'home' ? this.homeBench : this.awayBench;
    const idx = bench.indexOf(inPlayer);
    if (idx >= 0) bench.splice(idx, 1);
    const list = side === 'home' ? this.homePlayers : this.awayPlayers;
    list.push(inPlayer);
  }

  _checkPhase() {
    if (this.phase === 'FIRST_HALF' && this.tick >= 90) {
      this._injuryTime = Math.floor(Math.random() * 3) + 1;
    }
    if (this.phase === 'FIRST_HALF' && this.tick >= 90 + this._injuryTime * 2) {
      this.phase  = 'HALF_TIME';
      this.minute = 45;
      this._addEvent('phase', pick('halftime'), 45, null, { isPhase: true });
      this._injuryTime = 0;
      return;
    }
    if (this.phase === 'SECOND_HALF' && this.tick >= 180) {
      this._injuryTime = Math.floor(Math.random() * 5) + 2;
    }
    if (this.phase === 'SECOND_HALF' && this.tick >= 180 + this._injuryTime * 2) {
      this.phase  = 'FINISHED';
      this.minute = 90;
      this._addEvent('phase', pick('fulltime'), 90, null, { isPhase: true });
    }
  }

  // Chamado externamente pela UI ao clicar "Continuar" no intervalo
  startSecondHalf() {
    if (this.phase !== 'HALF_TIME') return;
    this.phase = 'SECOND_HALF';
    this._addEvent('phase', pick('kickoff2'), 46, null, { isPhase: true });
  }

  // Substituição manual (chamada pela UI)
  applySub(side, outId, inId) {
    if (this.subs[side] >= this.maxSubs) return false;
    const list  = side === 'home' ? this.homePlayers : this.awayPlayers;
    const bench = side === 'home' ? this.homeBench   : this.awayBench;
    const outP  = list.find(p  => p.id == outId);
    const inP   = bench.find(p => p.id == inId);
    if (!outP || !inP) return false;
    this._doSub(side, outP, inP);
    this._addEvent('sub', `Substituição: ${inP.name} entra, ${outP.name} sai.`, this.minute, side, { isSub: true });
    return true;
  }

  // ─── Estado público ────────────────────────────────────────────────────────
  getState() {
    const poss = this.totalTicks > 0
      ? Math.round(this.stats.home.possession / this.totalTicks * 100)
      : 50;
    return {
      phase:      this.phase,
      minute:     this.minute,
      score:      { ...this.score },
      momentum:   this.momentum,
      ballSector: this.ballSector,
      ballSide:   this.ballSide,
      possession: { home: poss, away: 100 - poss },
      events:     this.events,
      subs:       { ...this.subs },
      maxSubs:    this.maxSubs,
      stats:      {
        home: { ...this.stats.home },
        away: { ...this.stats.away },
      },
      homePlayers: this.homePlayers,
      awayPlayers: this.awayPlayers,
      homeBench:   this.homeBench,
      awayBench:   this.awayBench,
    };
  }

  getLineups() {
    return {
      home: { starters: this.homePlayers, bench: this.homeBench },
      away: { starters: this.awayPlayers, bench: this.awayBench },
    };
  }
}
