// Sistema de partículas com pool fixo: nenhum objeto é criado ou descartado durante o jogo.
(function () {
  'use strict';
  const S = window.Serra;
  const { canvas, hex, TAU } = S.util;
  const MAX = 420;

  const pool = [];
  for (let i = 0; i < MAX; i++) {
    pool.push({ on: false, kind: '', x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 0, max: 1, size: 1, grow: 0, rot: 0, vr: 0, alpha: 1, col: null, add: false, ground: false, front: false });
  }
  let cursor = 0;

  const spriteCache = new Map();
  function soft(rgb, hard) {
    const key = rgb[0] + ',' + rgb[1] + ',' + rgb[2] + (hard ? 'h' : '');
    let c = spriteCache.get(key);
    if (c) return c;
    c = canvas(64, 64);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    const s = `${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0}`;
    g.addColorStop(0, `rgba(${s},${hard ? 1 : 0.8})`);
    g.addColorStop(hard ? 0.3 : 0.45, `rgba(${s},${hard ? 0.75 : 0.4})`);
    g.addColorStop(1, `rgba(${s},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    spriteCache.set(key, c);
    return c;
  }

  // Ocupa a próxima vaga livre; se o pool estiver cheio, o efeito é simplesmente ignorado
  function emit(kind, x, y, vx, vy, life, size, col, opt) {
    for (let k = 0; k < MAX; k++) {
      const p = pool[cursor];
      cursor = (cursor + 1) % MAX;
      if (p.on) continue;
      p.on = true; p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy;
      p.life = life; p.max = life; p.size = size; p.col = col;
      p.g = 0; p.drag = 0; p.grow = 0; p.rot = Math.random() * TAU; p.vr = 0; p.alpha = 1; p.add = false; p.ground = false; p.front = false;
      if (opt) {
        if (opt.g !== undefined) p.g = opt.g;
        if (opt.drag !== undefined) p.drag = opt.drag;
        if (opt.grow !== undefined) p.grow = opt.grow;
        if (opt.vr !== undefined) p.vr = opt.vr;
        if (opt.alpha !== undefined) p.alpha = opt.alpha;
        if (opt.add) p.add = true;
        if (opt.ground) p.ground = true;
        if (opt.front) p.front = true;
      }
      return p;
    }
    return null;
  }

  const rnd = (a, b) => a + Math.random() * (b - a);
  const P = (S.Particles = {});

  P.clear = () => { for (const p of pool) p.on = false; };
  P.count = () => pool.reduce((n, p) => n + (p.on ? 1 : 0), 0);

  // Terra e poeira levantadas pela roda traseira
  P.roost = (x, y, art, power, dirX, dirY) => {
    const dc = hex(art.dirt.base), dl = hex(art.dirt.light), gr = hex(art.grass[1]);
    emit('soft', x, y, -dirX * rnd(40, 120), -rnd(20, 70), rnd(0.5, 0.9), rnd(5, 9), art.dust, { drag: 1.6, grow: rnd(14, 26), alpha: 0.55 });
    if (Math.random() < 0.55 * power) {
      const c = Math.random() < 0.6 ? dc : dl;
      emit('chunk', x, y - 2, -dirX * rnd(120, 260) * power, -rnd(90, 230) * power, rnd(0.6, 1.1), rnd(1.4, 3), c, { g: 900, vr: rnd(-14, 14), ground: true, front: true });
    }
    if (!art.snowy && Math.random() < 0.18 * power) {
      emit('blade', x, y - 3, -dirX * rnd(80, 200), -rnd(120, 220), rnd(0.5, 0.9), rnd(3, 5), gr, { g: 700, vr: rnd(-18, 18), front: true });
    }
  };

  P.skid = (x, y, art) => {
    emit('soft', x, y, rnd(-30, 30), -rnd(10, 40), rnd(0.4, 0.7), rnd(4, 7), art.dust, { drag: 2, grow: rnd(16, 24), alpha: 0.45 });
  };

  P.land = (x, y, art, impact) => {
    const n = Math.min(22, 6 + Math.round(impact * 1.6));
    for (let i = 0; i < n; i++) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      emit('soft', x + rnd(-14, 14), y, dir * rnd(40, 160), -rnd(10, 60), rnd(0.6, 1.1), rnd(5, 10), art.dust, { drag: 2.2, grow: rnd(18, 34), alpha: 0.6 });
    }
    const dc = hex(art.dirt.base);
    for (let i = 0; i < n * 0.7; i++) {
      emit('chunk', x + rnd(-10, 10), y - 2, rnd(-160, 160), -rnd(100, 260), rnd(0.5, 1), rnd(1.3, 2.8), dc, { g: 900, vr: rnd(-14, 14), ground: true, front: true });
    }
  };

  P.flame = (x, y, ang) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    emit('soft', x, y, -c * rnd(160, 260), -s * rnd(160, 260) + rnd(-20, 20), rnd(0.1, 0.18), rnd(5, 8), [255, 170, 60], { add: true, grow: -20, front: true });
    emit('soft', x, y, -c * rnd(100, 160), -s * rnd(100, 160), rnd(0.08, 0.14), rnd(3, 5), [255, 245, 180], { add: true, front: true });
    if (Math.random() < 0.5) emit('soft', x, y, -c * rnd(40, 90), -rnd(20, 50), rnd(0.6, 1), rnd(4, 6), [150, 150, 160], { drag: 1.2, grow: rnd(20, 30), alpha: 0.3 });
  };

  P.burst = (x, y, rgb, n) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rnd(70, 220);
      emit('spark', x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.35, 0.65), rnd(2, 3.5), rgb, { drag: 2.5, add: true, front: true });
    }
    emit('soft', x, y, 0, 0, 0.35, 22, rgb, { grow: 70, add: true, alpha: 0.7, front: true });
  };

  P.crash = (x, y, art) => {
    P.land(x, y, art, 10);
    for (let i = 0; i < 8; i++) emit('spark', x, y, rnd(-200, 200), -rnd(80, 260), rnd(0.3, 0.6), 2, [255, 230, 160], { g: 600, add: true, front: true });
  };

  P.update = (dt, groundY) => {
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size = Math.max(0.5, p.size + p.grow * dt);
      if (p.ground && groundY) {
        const gy = groundY(p.x) - 1;
        if (p.y > gy) { p.y = gy; p.vy *= -0.3; p.vx *= 0.5; p.vr *= 0.5; }
      }
    }
  };

  // front=false: atrás da moto (poeira); front=true: na frente (terra, faíscas, fogo)
  P.draw = (ctx, front) => {
    for (let i = 0; i < MAX; i++) {
      const p = pool[i];
      if (!p.on || p.front !== front) continue;
      const t = p.life / p.max;
      const fade = Math.min(1, (1 - t) * 8) * t;
      ctx.globalAlpha = Math.min(1, p.alpha * (p.kind === 'soft' ? fade * 1.4 : Math.min(1, t * 3)));
      ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      switch (p.kind) {
        case 'soft':
          ctx.drawImage(soft(p.col, false), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
          break;
        case 'chunk': {
          const c = Math.cos(p.rot), s = Math.sin(p.rot), z = p.size;
          ctx.fillStyle = `rgb(${p.col[0] | 0},${p.col[1] | 0},${p.col[2] | 0})`;
          ctx.beginPath();
          ctx.moveTo(p.x + c * z - s * z * 0.6, p.y + s * z + c * z * 0.6);
          ctx.lineTo(p.x - c * z * 0.8 - s * z * 0.4, p.y - s * z * 0.8 + c * z * 0.4);
          ctx.lineTo(p.x + s * z * 0.7, p.y - c * z * 0.7);
          ctx.fill();
          break;
        }
        case 'blade': {
          const c = Math.cos(p.rot), s = Math.sin(p.rot);
          ctx.strokeStyle = `rgb(${p.col[0] | 0},${p.col[1] | 0},${p.col[2] | 0})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(p.x - c * p.size, p.y - s * p.size); ctx.lineTo(p.x + c * p.size, p.y + s * p.size); ctx.stroke();
          break;
        }
        case 'spark': {
          const z = p.size * (0.6 + t * 0.6);
          ctx.fillStyle = `rgb(${p.col[0] | 0},${p.col[1] | 0},${p.col[2] | 0})`;
          ctx.fillRect(p.x - z * 2, p.y - z * 0.3, z * 4, z * 0.6);
          ctx.fillRect(p.x - z * 0.3, p.y - z * 2, z * 0.6, z * 4);
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };
})();
