(() => {
  'use strict';

  // ---------- Constantes ----------
  const W = 960, H = 540;
  const DT = 1 / 120;
  const SEG = 16;           // largura de cada segmento do terreno (px)
  const G = 1500;           // gravidade (px/s²)
  const WHEEL_R = 17;
  const START_LIVES = 4;
  const TURBO_MAX = 3;

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  const cv = $('game'), ctx = cv.getContext('2d');
  const mm = $('minimap'), mctx = mm.getContext('2d');

  // A lógica continua em 960x540; o canvas só ganha mais pixels para ficar nítido em telas grandes
  let renderScale = 1;
  function fit() {
    const s = Math.min(innerWidth / W, innerHeight / H);
    $('stage').style.transform = `translate(-50%, -50%) scale(${s})`;
    const k = clamp(s * (window.devicePixelRatio || 1), 1, 2);
    if (Math.abs(k - renderScale) > 0.01 || cv.width !== Math.round(W * k)) {
      renderScale = k;
      cv.width = Math.round(W * k);
      cv.height = Math.round(H * k);
    }
  }
  addEventListener('resize', fit);
  fit();

  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Fases ----------
  // Tipos de vegetação/pedra sorteados ao longo da pista (os desenhos ficam em js/sprites.js)
  const THEMES = {
    green: { deco: ['bush', 'oak', 'bush', 'rock', 'poplar', 'oak', 'grass'] },
    canyon: { deco: ['cactus', 'rock', 'shrub', 'cactus', 'deadtree', 'shrub'] },
    snow: { deco: ['snowpine', 'snowpine', 'rock', 'bush', 'deadtree', 'snowpine'] },
    autumn: { deco: ['oak', 'bush', 'oak', 'rock', 'poplar', 'grass', 'oak'] },
    volcano: { deco: ['deadtree', 'rock', 'shrub', 'rock', 'deadtree'] },
    night: { deco: ['pine', 'oak', 'bush', 'pine', 'rock', 'grass'] },
  };

  const LEVELS = [
    { name: 'Campos Verdes', theme: 'green', seed: 1337, length: 8000, diff: 0.55, time: 120, stars: 8, turbos: 3 },
    { name: 'Floresta de Outono', theme: 'autumn', seed: 2024, length: 9000, diff: 0.68, time: 135, stars: 8, turbos: 3 },
    { name: 'Cânion Seco', theme: 'canyon', seed: 4242, length: 10000, diff: 0.8, time: 150, stars: 8, turbos: 3 },
    { name: 'Pico Nevado', theme: 'snow', seed: 9001, length: 12000, diff: 1.05, time: 180, stars: 8, turbos: 4, rampScale: 0.75, dropScale: 2.2, maxGrade: 0.8, maxDown: 0.55, hillScale: 0.75 },
    { name: 'Vale Vulcânico', theme: 'volcano', seed: 6661, length: 12500, diff: 1.12, time: 190, stars: 10, turbos: 4, rampScale: 0.78, dropScale: 2.2, maxGrade: 0.8, maxDown: 0.75 },
    { name: 'Serra ao Luar', theme: 'night', seed: 7777, length: 13500, diff: 1.18, time: 205, stars: 10, turbos: 5, rampScale: 0.75, dropScale: 2.2, maxGrade: 0.82, maxDown: 0.42, hillScale: 0.9 },
  ];

  let T = null; // dados da fase atual

  function buildLevel(idx) {
    const L = LEVELS[idx], th = THEMES[L.theme], r = rng(L.seed);
    const n = Math.ceil((L.length + 600) / SEG) + 2;
    const ys = new Float32Array(n);
    const ph = [r() * 6.28, r() * 6.28, r() * 6.28];

    const ramps = [];
    for (let x = 1100; ;) {
      x += 650 + r() * 900;
      if (x > L.length - 1100) break;
      const w = 120 + r() * 140;
      // rampScale/dropScale (opcionais por fase) baixam as rampas e alongam a descida depois delas
      ramps.push({ x0: x, w, h: (45 + r() * 55) * (0.6 + L.diff * 0.6) * (L.rampScale || 1), drop: (26 + r() * 30) * (L.dropScale || 1) });
      x += w + 250;
    }

    for (let i = 0; i < n; i++) {
      const x = i * SEG;
      const env = clamp((x - 500) / 700, 0, 1) * clamp((L.length - 400 - x) / 600, 0, 1);
      let y = -Math.min(x, L.length) * 0.04 * L.diff +
        env * L.diff * (L.hillScale || 1) * (80 * Math.sin(x / 460 + ph[0]) + 42 * Math.sin(x / 190 + ph[1]) + 16 * Math.sin(x / 80 + ph[2]));
      for (const R of ramps) {
        const d = x - R.x0;
        if (d >= 0 && d < R.w) y -= R.h * (d / R.w) * env;
        else if (d >= R.w && d < R.w + R.drop) y -= R.h * (1 - (d - R.w) / R.drop) * env;
      }
      ys[i] = y;
    }
    // maxGrade / maxDown (opcionais por fase): limitam a inclinação das subidas e das descidas;
    // um penhasco vira uma descida longa que reencontra o relevo original mais adiante
    if (L.maxGrade || L.maxDown) {
      const up = (L.maxGrade || 99) * SEG, down = (L.maxDown || 99) * SEG;
      for (let i = 1; i < n; i++) {
        if (ys[i] < ys[i - 1] - up) ys[i] = ys[i - 1] - up;
        else if (ys[i] > ys[i - 1] + down) ys[i] = ys[i - 1] + down;
      }
    }

    const lvl = { L, th, ys, n, ramps, idx, SEG, length: L.length, groundY };
    T = lvl;

    lvl.finishX = L.length - 250;
    lvl.cps = [0.33, 0.66].map((f) => ({ x: Math.round(L.length * f), hit: false }));

    lvl.stars = [];
    const span = L.length - 1500;
    for (let i = 0; i < L.stars; i++) {
      const x = 750 + (i + 0.5) * (span / L.stars) + (r() - 0.5) * 220;
      const high = r() < 0.45;
      lvl.stars.push({ x, y: groundY(x) - 38 - (high ? 70 + r() * 60 : 0), got: false, ph: r() * 6 });
    }
    lvl.turbos = [];
    for (let i = 0; i < L.turbos; i++) {
      const x = 1000 + (i + 0.5) * ((L.length - 1800) / L.turbos) + (r() - 0.5) * 300;
      lvl.turbos.push({ x, y: groundY(x) - 34, got: false, ph: r() * 6 });
    }

    lvl.decor = [];
    for (let x = 120; x < L.length + 500; x += 90 + r() * 240) {
      lvl.decor.push({ x, type: th.deco[Math.floor(r() * th.deco.length)], s: 0.7 + r() * 0.6, v: r() });
    }

    buildMinimap(lvl);
    return lvl;
  }

  function groundY(x) {
    const ys = T.ys;
    let i = Math.floor(x / SEG);
    i = clamp(i, 0, T.n - 2);
    const t = clamp((x - i * SEG) / SEG, 0, 1);
    return ys[i] + (ys[i + 1] - ys[i]) * t;
  }

  // ---------- Moto (a física fica em js/physics.js) ----------
  let bike = null;
  let vb = null; // vista interpolada da moto, usada só no desenho e na câmera

  function spawnBike(x) {
    bike = Serra.Physics.createBike(x, T);
    vb = Serra.Physics.view(bike, 1);
  }

  // Ponto de renascimento: o trecho mais plano até 320 px antes do checkpoint,
  // para não recomeçar parado no meio de uma subida íngreme
  function respawnX(cpx) {
    if (cpx <= 200) return cpx;
    let best = cpx, bestScore = Infinity;
    for (let x = cpx - 320; x <= cpx; x += 8) {
      const slope = Math.abs(groundY(x + 40) - groundY(x - 40)) / 80;
      const score = slope + (cpx - x) * 0.0004;
      if (score < bestScore) { bestScore = score; best = x; }
    }
    return best;
  }

  function physics(dt) {
    const b = bike;
    const ctrl = game.state === 'play';
    const input = {
      throttle: ctrl && keys.up ? 1 : 0,
      brake: ctrl && keys.down ? 1 : 0,
      lean: ctrl ? (keys.left ? 1 : 0) - (keys.right ? 1 : 0) : 0,
      turbo: ctrl && keys.turbo && game.turbo > 0,
    };
    if (input.turbo) game.turbo = Math.max(0, game.turbo - dt * 0.6);
    game.turboOn = input.turbo;
    b.lean = lerp(b.lean, input.lean, 0.08);

    Serra.Physics.step(b, input, dt, T);

    // Rotação acumulada no ar (para contar mortais)
    const a = Math.atan2(b.F.y - b.R.y, b.F.x - b.R.x);
    let da = a - b.lastA;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    b.lastA = a;

    if (game.state !== 'play') return;

    // Queda: cabeça ou corpo no chão, impacto forte demais ou pouso muito torto
    if (Serra.Physics.crashCheck(b)) { crash(); return; }

    const nowAir = !b.gR && !b.gF;
    if (nowAir) { b.airT += dt; b.airRot += da; b.airVy = ((b.R.y - b.R.py) + (b.F.y - b.F.py)) / 2; }
    else {
      if (b.airT > 0) landed();
      b.airT = 0; b.airRot = 0;
    }

    if (b.gR && input.throttle && Math.random() < (input.turbo ? 0.6 : 0.3)) dust(b.R.x - 10, b.R.y + WHEEL_R - 4, input.turbo);
  }

  function landed() {
    const b = bike;
    landingFX(b);
    const flips = Math.floor((Math.abs(b.airRot) + 0.6) / (Math.PI * 2));
    if (flips > 0) {
      const pts = 500 * flips * flips;
      addScore(pts);
      const name = b.airRot > 0 ? 'Mortal para frente' : 'Mortal para trás';
      toast(`${name}${flips > 1 ? ' x' + flips : ''}! +${pts}`, 'gold');
      sfx([523, 659, 784, 1046], 0.08, 'square', 0.05);
    }
    if (b.airT > 0.75) {
      const pts = Math.round(b.airT * 10) * 10;
      addScore(pts);
      toast(`Salto ${b.airT.toFixed(1)}s +${pts}`);
    }
  }

  // ---------- Estado do jogo ----------
  const game = {
    state: 'menu', level: 0, lives: START_LIVES, score: 0, time: 0, turbo: TURBO_MAX, turboOn: false,
    lastCP: 140, crashT: 0, starsGot: 0, levelStart: 0, clock: 0, best: 0, shake: 0,
  };
  try { game.best = parseInt(localStorage.getItem('serraTurbo.best') || '0', 10) || 0; } catch (e) { /* sem storage */ }
  // quantas fases já foram liberadas neste navegador (a primeira sempre está)
  game.unlocked = 1;
  try { game.unlocked = clamp(parseInt(localStorage.getItem('serraTurbo.unlocked') || '1', 10) || 1, 1, LEVELS.length); } catch (e) { /* sem storage */ }

  function unlockLevel(n) {
    if (n <= game.unlocked) return;
    game.unlocked = Math.min(n, LEVELS.length);
    try { localStorage.setItem('serraTurbo.unlocked', String(game.unlocked)); } catch (e) { /* sem storage */ }
  }

  function saveBest() {
    if (game.score > game.best) {
      game.best = game.score;
      try { localStorage.setItem('serraTurbo.best', String(game.best)); } catch (e) { /* sem storage */ }
    }
  }

  function addScore(n) { game.score += n; }

  function loadLevel(i) {
    game.level = i;
    assets = Serra.Assets.get(LEVELS[i].theme);
    buildLevel(i);
    game.time = LEVELS[i].time;
    game.turbo = TURBO_MAX;
    game.lastCP = 140;
    game.starsGot = 0;
    game.levelStart = game.score;
    spawnBike(respawnX(game.lastCP));
    Serra.Particles.clear();
    snapCamera();
    hudCache = {};
    buildProgressTicks();
  }

  function startGame(first) {
    game.lives = START_LIVES;
    game.score = 0;
    enterLevel(first || 0);
  }

  function showLevelSelect() {
    setState('menu');
    showCard(`
      <div class="sub">Escolha a fase</div>
      <h2>Fases</h2>
      <div class="levels">
        ${LEVELS.map((L, i) => {
          const art = Serra.ART[L.theme], locked = i >= game.unlocked;
          return `<button type="button" class="lvl-btn${locked ? ' locked' : ''}" data-lvl="${i}" ${locked ? 'disabled aria-disabled="true"' : ''}
            style="--c1:${art.sky[0]};--c2:${art.sky[2]};--c3:${art.dirt.base}">
            <span class="lvl-num">${i + 1}</span>
            <span class="lvl-name">${L.name}</span>
            <span class="lvl-info">${locked ? 'Bloqueada' : fmtTime(L.time) + ' · ' + L.stars + ' estrelas'}</span>
          </button>`;
        }).join('')}
      </div>
      <p class="hint">Complete uma fase para liberar a próxima.</p>
    `, [{ label: 'Voltar', ghost: true, fn: showMenu }]);
    document.querySelectorAll('.lvl-btn:not(.locked)').forEach((el) => {
      el.addEventListener('click', () => { initAudio(); hideCard(); startGame(Number(el.dataset.lvl)); });
    });
    const first = document.querySelector('.lvl-btn:not(.locked)');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 40);
  }

  // Garante que os gráficos do ambiente da fase já foram gerados antes de abri-la
  function enterLevel(i) {
    const key = LEVELS[i].theme;
    if (Serra.Assets.has(key)) { loadLevel(i); showIntro(); return; }
    setState('loading');
    showLoading('Preparando ' + LEVELS[i].name);
    Serra.Assets.build(key, setLoading)
      .then(() => { hideCard(); loadLevel(i); showIntro(); })
      .catch((e) => { console.error(e); showLoadError(); });
  }

  function showIntro() {
    const L = LEVELS[game.level];
    setState('intro');
    showCard(`
      <div class="sub">Fase ${game.level + 1} de ${LEVELS.length}</div>
      <h2>${L.name}</h2>
      <p>Chegue à bandeira quadriculada em até <b>${fmtTime(L.time)}</b>.<br>
      Pegue as <b>${L.stars} estrelas</b> e as cápsulas azuis de turbo pelo caminho.</p>
    `, [{ label: 'Acelerar!', fn: () => { hideCard(); setState('play'); } }]);
  }

  function crash() {
    if (game.state !== 'play') return;
    setState('crash');
    game.crashT = 1.7;
    bigMsg('QUEDA!');
    sfx([180, 110, 70], 0.13, 'sawtooth', 0.08);
    Serra.BikeRenderer.onCrash(bike);
    if (assets) Serra.Particles.crash(bike.H.x, bike.H.y, assets.art);
    game.shake = 9;
  }

  function loseLife(reason) {
    game.lives--;
    bigMsg('');
    if (game.lives <= 0) { gameOver(reason); return; }
    spawnBike(respawnX(game.lastCP));
    snapCamera(true);
    setState('play');
  }

  function gameOver(reason) {
    saveBest();
    setState('over');
    showCard(`
      <div class="sub">Fim de jogo</div>
      <h2>${reason === 'time' ? 'O tempo acabou' : 'Sem vidas'}</h2>
      <div class="stats">
        <span>Fase alcançada</span><span>${game.level + 1}</span>
        <span>Recorde</span><span>${game.best}</span>
        <span class="total">Pontuação</span><span class="total">${game.score}</span>
      </div>
    `, [{ label: 'Jogar de novo', fn: () => { hideCard(); startGame(); } },
        { label: 'Menu', ghost: true, fn: showMenu }]);
  }

  function levelComplete() {
    setState('done');
    const L = LEVELS[game.level];
    const timeBonus = Math.ceil(game.time) * 10;
    const allStars = game.starsGot === L.stars ? 1000 : 0;
    const lifeBonus = 0;
    const levelPts = game.score - game.levelStart;
    addScore(timeBonus + allStars + lifeBonus);
    saveBest();
    unlockLevel(game.level + 2);
    sfx([392, 523, 659, 784, 1046], 0.1, 'triangle', 0.07);
    const last = game.level === LEVELS.length - 1;
    showCard(`
      <div class="sub">${last ? 'Campeão da serra' : 'Fase concluída'}</div>
      <h2>${last ? 'Você venceu!' : L.name}</h2>
      <div class="stats">
        <span>Pontos na fase</span><span>${levelPts}</span>
        <span>Estrelas</span><span>${game.starsGot}/${L.stars}</span>
        <span>Bônus de tempo</span><span>+${timeBonus}</span>
        ${allStars ? '<span>Todas as estrelas</span><span>+1000</span>' : ''}
        <span class="total">Total</span><span class="total">${game.score}</span>
      </div>
      ${last ? `<p>Recorde: <b>${game.best}</b></p>` : ''}
    `, last
      ? [{ label: 'Jogar de novo', fn: () => { hideCard(); startGame(); } }, { label: 'Menu', ghost: true, fn: showMenu }]
      : [{ label: 'Próxima fase', fn: () => { hideCard(); enterLevel(game.level + 1); } }]);
  }

  function showMenu() {
    setState('menu');
    if (!T || T.idx !== 0) { loadLevel(0); }
    showCard(`
      <div class="sub">Motocross de montanha</div>
      <h1>SERRA TURBO</h1>
      <div class="keys">
        <kbd>↑ / W</kbd><span>Acelerar</span>
        <kbd>↓ / S</kbd><span>Frear e dar ré</span>
        <kbd>← / A</kbd><span>Inclinar para trás (empinar)</span>
        <kbd>→ / D</kbd><span>Inclinar para frente</span>
        <kbd>Espaço</kbd><span>Turbo</span>
        <kbd>P</kbd><span>Pausar &nbsp;·&nbsp; <kbd>M</kbd> Som</span>
      </div>
      <p>Faça mortais no ar para ganhar pontos extras. Não deixe o capacete bater no chão.</p>
      ${game.best ? `<p class="hint">Recorde neste navegador: ${game.best}</p>` : ''}
    `, [{ label: 'Jogar', fn: () => { hideCard(); startGame(); } },
        { label: `Fases (${game.unlocked}/${LEVELS.length})`, ghost: true, fn: showLevelSelect }]);
  }

  function togglePause() {
    if (game.state === 'play') {
      setState('pause');
      showCard(`<div class="sub">Jogo parado</div><h2>Pausa</h2>`,
        [{ label: 'Continuar', fn: () => { hideCard(); setState('play'); } },
         { label: 'Reiniciar fase', ghost: true, fn: () => { hideCard(); const s = game.levelStart; game.score = s; loadLevel(game.level); game.score = s; showIntro(); } }]);
    } else if (game.state === 'pause') {
      hideCard(); setState('play');
    }
  }

  function setState(s) {
    game.state = s;
    document.body.classList.toggle('playing', s === 'play' || s === 'crash' || s === 'pause');
    for (const k in keys) keys[k] = false;
    document.querySelectorAll('#touch button').forEach((b) => b.classList.remove('active'));
  }

  // ---------- Lógica por quadro ----------
  function logic(dt) {
    if (game.state === 'crash') {
      game.crashT -= dt;
      if (game.crashT <= 0) loseLife('crash');
      return;
    }
    if (game.state !== 'play') return;

    game.time -= dt;
    if (game.time <= 0) {
      game.time = 0;
      bigMsg('TEMPO!');
      sfx([300, 200, 120], 0.15, 'sawtooth', 0.07);
      game.lives--;
      setTimeout(() => {
        bigMsg('');
        if (game.lives <= 0) { gameOver('time'); return; }
        game.time = LEVELS[game.level].time;
        spawnBike(respawnX(game.lastCP)); snapCamera(true); setState('play');
      }, 1200);
      setState('crash');
      game.crashT = 999;
      return;
    }

    const b = bike;
    const cx = (b.R.x + b.F.x) / 2, cy = (b.R.y + b.F.y) / 2;

    for (const s of T.stars) {
      if (s.got) continue;
      if (Math.hypot(s.x - cx, s.y - cy) < 42 || Math.hypot(s.x - b.H.x, s.y - b.H.y) < 26) {
        s.got = true; game.starsGot++; addScore(100);
        toast('+100', 'gold');
        sfx([880, 1320], 0.07, 'square', 0.05);
        spark(s.x, s.y, '#ffd23f');
      }
    }
    for (const tb of T.turbos) {
      if (tb.got) continue;
      if (Math.hypot(tb.x - cx, tb.y - cy) < 42) {
        tb.got = true; game.turbo = Math.min(TURBO_MAX, game.turbo + 1); addScore(50);
        toast('Turbo +1', 'blue');
        sfx([440, 660, 990], 0.06, 'triangle', 0.06);
        spark(tb.x, tb.y, '#38c6ff');
      }
    }
    for (const cp of T.cps) {
      if (!cp.hit && cx > cp.x) {
        cp.hit = true; game.lastCP = cp.x; addScore(200);
        toast('Checkpoint! +200');
        sfx([660, 880], 0.09, 'triangle', 0.06);
      }
    }
    if (cx >= T.finishX) levelComplete();
  }

  // ---------- Partículas ----------
  // A física chama dust() ao acelerar; os efeitos em si ficam no pool de js/particles.js
  function dust(x, y, turbo) {
    if (!assets) return;
    const b = bike, a = Math.atan2(b.F.y - b.R.y, b.F.x - b.R.x);
    Serra.Particles.roost(x, y, assets.art, turbo ? 1.4 : 1, Math.cos(a), Math.sin(a));
  }
  function spark(x, y, hexColor) {
    const n = parseInt(hexColor.slice(1), 16);
    Serra.Particles.burst(x, y, [(n >> 16) & 255, (n >> 8) & 255, n & 255], 14);
  }
  function landingFX(b) {
    const impact = Math.max(0, b.airVy || 0);
    Serra.BikeRenderer.onLand(impact);
    if (assets && impact > 2.2) {
      Serra.Particles.land((b.R.x + b.F.x) / 2, groundY((b.R.x + b.F.x) / 2), assets.art, impact);
      game.shake = Math.max(game.shake, Math.min(7, impact * 0.6));
    }
  }

  // Efeitos visuais contínuos (rodando no quadro, fora da física)
  let fxAcc = 0;
  function visualFX(dt) {
    if (!assets || !bike) return;
    const b = bike, art = assets.art;
    Serra.BikeRenderer.update(dt, vb || b, {
      lean: game.state === 'play' ? (keys.left ? 1 : 0) - (keys.right ? 1 : 0) : 0,
      turbo: game.turboOn,
    }, groundY);
    fxAcc += dt;
    while (fxAcc > 1 / 60) {
      fxAcc -= 1 / 60;
      if (game.state !== 'play') continue;
      const speed = Math.abs(b.R.x - b.R.px);
      if (game.turboOn) {
        const ex = Serra.BikeRenderer.vis.exhaust;
        Serra.Particles.flame(ex.x, ex.y, ex.a);
      }
      if (keys.down && speed > 2.5) {
        if (b.gR) Serra.Particles.skid(b.R.x, b.R.y + WHEEL_R - 2, art);
        if (b.gF) Serra.Particles.skid(b.F.x, b.F.y + WHEEL_R - 2, art);
      }
      if (b.gR && speed > 4 && Math.random() < 0.25) Serra.Particles.skid(b.R.x - 8, b.R.y + WHEEL_R - 2, art);
    }
    Serra.Particles.update(dt, groundY);
    game.shake = Math.max(0, game.shake - dt * 22);
  }

  // ---------- Câmera ----------
  const cam = { x: 0, y: 0 };
  function camTarget() {
    const v = vb || bike;
    const cx = (v.R.x + v.F.x) / 2, cy = (v.R.y + v.F.y) / 2;
    const vx = (bike.R.x - bike.R.px);
    return { x: Math.max(-40, cx - W * 0.34 + clamp(vx * 14, -60, 150)), y: cy - H * 0.6 };
  }
  function snapCamera(soft) {
    const t = camTarget();
    if (soft) { cam.x = lerp(cam.x, t.x, 0.6); cam.y = lerp(cam.y, t.y, 0.6); }
    else { cam.x = t.x; cam.y = t.y; }
  }
  function updateCamera(dt) {
    const t = camTarget();
    cam.x += (t.x - cam.x) * Math.min(1, dt * 5);
    cam.y += (t.y - cam.y) * Math.min(1, dt * 3.5);
  }

  // ---------- Desenho ----------
  let assets = null;

  function render() {
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    if (!assets || !T || !bike) { Serra.Scenery.drawPlaceholder(ctx); return; }
    const Sc = Serra.Scenery;
    const sh = game.shake > 0.2 ? game.shake : 0;
    const view = { x: cam.x + (Math.random() - 0.5) * sh, y: cam.y + (Math.random() - 0.5) * sh };

    Sc.drawSky(ctx, assets, view, game.clock);
    Sc.drawLayers(ctx, assets, view);
    Sc.drawWeather(ctx, assets, view, frameDt, false);

    ctx.save();
    ctx.translate(-Math.round(view.x * renderScale) / renderScale, -Math.round(view.y * renderScale) / renderScale);
    Sc.drawTrackDecor(ctx, T, assets, view);
    Sc.drawTerrain(ctx, T, assets, view);
    Sc.drawItems(ctx, T, game.clock, view);
    Serra.Particles.draw(ctx, false);
    Serra.BikeRenderer.draw(ctx, vb || bike, groundY, { wheelR: WHEEL_R, clock: game.clock });
    Sc.drawTrackEdge(ctx, T, assets, view);
    Serra.Particles.draw(ctx, true);
    ctx.restore();

    Sc.drawForeground(ctx, T, assets, view);
    Sc.drawWeather(ctx, assets, view, frameDt, true);
    Sc.drawScreenFX(ctx, assets, view, frameDt, game.turboOn);
  }

  // ---------- Minimapa ----------
  let mmBase = null;
  function buildMinimap(lvl) {
    const c = document.createElement('canvas');
    c.width = mm.width; c.height = mm.height;
    const m = c.getContext('2d');
    let minY = Infinity, maxY = -Infinity;
    for (const y of lvl.ys) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const pad = 10;
    const sx = (c.width - pad * 2) / (lvl.n * SEG);
    const sy = Math.min((c.height - pad * 2) / Math.max(1, maxY - minY + 120), sx * 3);
    const map = (x, y) => [pad + x * sx, c.height - pad - (maxY - y) * sy - 4];
    const art = Serra.ART[lvl.L.theme];
    const bg = m.createLinearGradient(0, 0, 0, c.height);
    bg.addColorStop(0, art.sky[0]); bg.addColorStop(1, art.sky[2]);
    m.fillStyle = bg; m.fillRect(0, 0, c.width, c.height);
    m.beginPath();
    m.moveTo(pad, c.height);
    for (let i = 0; i < lvl.n; i += 3) { const [px, py] = map(i * SEG, lvl.ys[i]); m.lineTo(px, py); }
    m.lineTo(c.width - pad, c.height); m.closePath();
    const gg = m.createLinearGradient(0, 10, 0, c.height);
    gg.addColorStop(0, art.dirt.light); gg.addColorStop(1, art.dirt.deep);
    m.fillStyle = gg; m.fill();
    m.strokeStyle = art.grass[1]; m.lineWidth = 2.5; m.lineJoin = 'round';
    m.beginPath();
    for (let i = 0; i < lvl.n; i += 3) { const [px, py] = map(i * SEG, lvl.ys[i]); m.lineTo(px, py); }
    m.stroke();
    const [fxp, fyp] = map(lvl.finishX, groundY(lvl.finishX));
    m.fillStyle = '#fff'; m.fillRect(fxp - 1, fyp - 14, 2, 14);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { m.fillStyle = (i + j) % 2 ? '#111' : '#fff'; m.fillRect(fxp + 1 + i * 3, fyp - 14 + j * 3, 3, 3); }
    mmBase = { c, map };
  }
  function drawMinimap() {
    mctx.clearRect(0, 0, mm.width, mm.height);
    if (!mmBase) return;
    mctx.drawImage(mmBase.c, 0, 0);
    for (const cp of T.cps) {
      const [x, y] = mmBase.map(cp.x, groundY(cp.x));
      mctx.fillStyle = '#fff'; mctx.fillRect(x - 0.5, y - 10, 1.5, 10);
      mctx.fillStyle = cp.hit ? '#3fd36b' : '#ff9a3d'; mctx.fillRect(x + 1, y - 10, 5, 4);
    }
    const cx = (bike.R.x + bike.F.x) / 2, cy = (bike.R.y + bike.F.y) / 2;
    const [x, y] = mmBase.map(cx, cy);
    mctx.fillStyle = 'rgba(255,255,255,0.35)'; mctx.beginPath(); mctx.arc(x, y - 3, 7 + Math.sin(game.clock * 6) * 1.5, 0, Math.PI * 2); mctx.fill();
    mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(x, y - 3, 4, 0, Math.PI * 2); mctx.fill();
    mctx.strokeStyle = '#e2381f'; mctx.lineWidth = 2; mctx.stroke();
  }

  // ---------- HUD ----------
  const HELMET_SVG = '<svg viewBox="0 0 34 28" aria-hidden="true"><path d="M3 18C2 9 9 2.5 17.5 2.5 25 2.5 30 7.5 30.5 13.5l2.5 6.5c-1.2 3.6-4.5 5.5-9.5 5.5H9.5C5.5 25.5 3.4 22.6 3 18z" fill="#f6f6f3" stroke="#17191d" stroke-width="2"/><path d="M4.2 10.5h25.6v3.6H4.2z" fill="#e2381f"/><path d="M4.4 14.1h25.4v1.8H4.4z" fill="#1f63d6"/><rect x="19" y="11" width="12" height="8" rx="3" fill="#17191d"/><rect x="20.6" y="12.4" width="8.8" height="5.2" rx="2" fill="#ff8f2e"/><rect x="21.4" y="13" width="3" height="1.6" fill="#fff" opacity=".8"/><path d="M14 3l18 2.2-1.2 3.6L15.5 7.2z" fill="#f6f6f3" stroke="#17191d" stroke-width="1.5"/></svg>';
  const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z"/></svg>';
  let hudCache = {};
  const turboBars = Array.from(document.querySelectorAll('#turbo b'));
  let tickEls = [];
  function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }

  function buildProgressTicks() {
    const box = $('progTicks');
    box.innerHTML = T.cps.map((cp) => `<i style="left:${(cp.x / T.finishX) * 100}%"></i>`).join('');
    tickEls = Array.from(box.children);
  }

  function updateHUD() {
    if (!T || !bike) return;
    if (hudCache.lives !== game.lives) {
      hudCache.lives = game.lives;
      $('lives').innerHTML = Array.from({ length: START_LIVES }, (_, i) => `<span class="helmet${i < game.lives ? '' : ' lost'}">${HELMET_SVG}</span>`).join('');
    }
    setText('time', fmtTime(game.time));
    const warn = game.time < 15 && game.state === 'play';
    if (hudCache.warn !== warn) { hudCache.warn = warn; $('timeBox').classList.toggle('warn', warn); }
    setText('score', String(game.score));
    setText('levelNum', String(game.level + 1));
    setText('levelName', LEVELS[game.level].name);
    turboBars.forEach((b, i) => {
      const w = Math.round(clamp(game.turbo - i, 0, 1) * 100);
      if (hudCache['tb' + i] !== w) { hudCache['tb' + i] = w; b.style.transform = `scaleX(${w / 100})`; b.parentNode.classList.toggle('full', w === 100); }
    });
    if (hudCache.turboOn !== game.turboOn) { hudCache.turboOn = game.turboOn; $('turbo').classList.toggle('on', game.turboOn); }
    const starsKey = `${game.starsGot}/${T.L.stars}`;
    if (hudCache.stars !== starsKey) {
      const gained = hudCache.stars !== undefined;
      hudCache.stars = starsKey;
      $('stars').innerHTML = T.stars.map((s, i) => `<span class="${i < game.starsGot ? 'got' : ''}${gained && i === game.starsGot - 1 ? ' pop' : ''}">${STAR_SVG}</span>`).join('');
      setText('starCount', starsKey);
    }
    tickEls.forEach((el, i) => { const hit = T.cps[i].hit; if (el.dataset.hit !== String(hit)) { el.dataset.hit = String(hit); el.classList.toggle('hit', hit); } });
    const cx = (bike.R.x + bike.F.x) / 2;
    const pr = Math.round(clamp(cx / T.finishX, 0, 1) * 1000) / 10;
    if (hudCache.pr !== pr) {
      hudCache.pr = pr;
      $('prog').style.transform = `scaleX(${pr / 100})`;
      $('progIcon').style.left = pr + '%';
    }
    drawMinimap();
  }

  function toast(text, cls) {
    const d = document.createElement('div');
    d.className = 'toast' + (cls ? ' ' + cls : '');
    d.textContent = text;
    $('toasts').appendChild(d);
    setTimeout(() => d.remove(), 1450);
  }
  function bigMsg(text) {
    const el = $('bigmsg');
    el.textContent = text;
    el.classList.toggle('show', !!text);
  }

  // ---------- Telas ----------
  let cardButtons = [];
  function showCard(html, buttons) {
    const card = $('card');
    card.innerHTML = html + '<div class="btn-row"></div>';
    const row = card.querySelector('.btn-row');
    cardButtons = buttons;
    buttons.forEach((b, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.id = 'cardBtn' + i;
      el.className = 'btn' + (b.ghost ? ' ghost' : '');
      el.textContent = b.label;
      el.addEventListener('click', () => { initAudio(); b.fn(); });
      row.appendChild(el);
    });
    $('overlay').classList.add('show');
    const first = row.querySelector('button');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
  }
  function hideCard() { $('overlay').classList.remove('show'); cardButtons = []; }

  // ---------- Entrada ----------
  const keys = { up: false, down: false, left: false, right: false, turbo: false };
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'turbo', ShiftLeft: 'turbo',
  };
  addEventListener('keydown', (e) => {
    initAudio();
    const k = KEYMAP[e.code];
    if (k) {
      if (game.state === 'play') { keys[k] = true; e.preventDefault(); return; }
      if (e.code.startsWith('Arrow')) e.preventDefault();
      if (e.code === 'Space' && !document.activeElement?.classList.contains('btn')) e.preventDefault();
    }
    if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); e.preventDefault(); }
    if (e.code === 'KeyM') toggleMute();
  });
  addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (game.state === 'play') togglePause(); });

  document.querySelectorAll('#touch button').forEach((btn) => {
    const k = btn.dataset.key;
    const on = (e) => { e.preventDefault(); initAudio(); if (game.state === 'play') { keys[k] = true; btn.classList.add('active'); } };
    const off = (e) => { e.preventDefault(); keys[k] = false; btn.classList.remove('active'); };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', off);
  });
  $('btnPause').addEventListener('click', togglePause);
  $('btnMute').addEventListener('click', () => { initAudio(); toggleMute(); });

  // ---------- Áudio ----------
  let AC = null, eng = null, muted = false;
  try { muted = localStorage.getItem('serraTurbo.muted') === '1'; } catch (e) { /* sem storage */ }
  $('btnMute').classList.toggle('off', muted);

  function initAudio() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const o = AC.createOscillator(); o.type = 'sawtooth';
      const o2 = AC.createOscillator(); o2.type = 'square';
      const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
      const g = AC.createGain(); g.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(AC.destination);
      o.start(); o2.start();
      eng = { o, o2, g, f };
    } catch (e) { AC = null; }
  }
  function toggleMute() {
    muted = !muted;
    $('btnMute').classList.toggle('off', muted);
    try { localStorage.setItem('serraTurbo.muted', muted ? '1' : '0'); } catch (e) { /* sem storage */ }
  }
  function engineUpdate() {
    if (!eng) return;
    const on = (game.state === 'play' || game.state === 'crash') && !muted;
    const now = AC.currentTime;
    eng.g.gain.setTargetAtTime(on ? (game.state === 'crash' ? 0.01 : 0.045) : 0, now, 0.08);
    const sp = Math.abs(bike ? bike.vt : 0);
    const base = 42 + sp * 9 + (keys.up ? 22 : 0) + (game.turboOn ? 35 : 0);
    eng.o.frequency.setTargetAtTime(base, now, 0.06);
    eng.o2.frequency.setTargetAtTime(base * 0.5, now, 0.06);
    eng.f.frequency.setTargetAtTime(400 + sp * 60 + (keys.up ? 200 : 0), now, 0.08);
  }
  function sfx(freqs, dur, type, vol) {
    if (!AC || muted) return;
    const t0 = AC.currentTime;
    freqs.forEach((fq, i) => {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = type; o.frequency.value = fq;
      const t = t0 + i * dur;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(AC.destination);
      o.start(t); o.stop(t + dur + 0.02);
    });
  }

  // ---------- Carregamento ----------
  function showLoading(title) {
    showCard(`
      <div class="sub">Serra Turbo</div>
      <h2>${title}</h2>
      <div class="loadbar"><div id="loadFill"></div></div>
      <p class="hint" id="loadTxt">Pintando montanhas, árvores e terreno…</p>
    `, []);
  }
  function setLoading(p) {
    const el = $('loadFill');
    if (el) el.style.transform = `scaleX(${p})`;
  }
  function showLoadError() {
    showCard(`<div class="sub">Algo deu errado</div><h2>Não foi possível gerar os gráficos</h2>
      <p>Recarregue a página. Se continuar, tente outro navegador.</p>`, [{ label: 'Recarregar', fn: () => location.reload() }]);
  }

  // ---------- Loop principal ----------
  let last = performance.now(), acc = 0, frameDt = 1 / 60;
  // A física avança sempre em passos fixos de 1/120 s, qualquer que seja o FPS;
  // a sobra de tempo vira a interpolação usada no desenho
  function advance(dt) {
    if (game.state === 'play' || game.state === 'crash') {
      acc += dt;
      while (acc >= DT) { physics(DT); acc -= DT; }
      logic(dt);
    } else {
      acc = 0;
    }
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    frameDt = dt;
    last = now;
    game.clock += dt;
    advance(dt);
    if (bike) {
      vb = Serra.Physics.view(bike, acc / DT);
      updateCamera(dt);
      visualFX(dt);
    }
    render();
    updateHUD();
    engineUpdate();
    requestAnimationFrame(frame);
  }

  // Ganchos de teste no console
  window.__serra = {
    game, keys, get bike() { return bike; }, get level() { return T; },
    step(n) { for (let i = 0; i < n; i++) { physics(DT); logic(DT); } vb = Serra.Physics.view(bike, 1); updateCamera(1); visualFX(1 / 60); render(); updateHUD(); },
    advance(dt) { advance(dt); },
    sim(n) { for (let i = 0; i < n; i++) { physics(DT); logic(DT); } },
    load(i) { loadLevel(i); hideCard(); setState('play'); },
    levels: LEVELS,
  };

  requestAnimationFrame(frame);
  setState('loading');
  showLoading('Preparando a serra');
  Serra.Assets.build(LEVELS[0].theme, setLoading)
    .then(() => { hideCard(); showMenu(); })
    .catch((e) => { console.error(e); showLoadError(); });
})();
