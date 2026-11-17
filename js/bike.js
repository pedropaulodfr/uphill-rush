// Desenho da moto e do piloto. Só lê o estado da física; suspensão, pose e queda do piloto são apenas visuais.
(function () {
  'use strict';
  const S = window.Serra;
  const { TAU } = S.util;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const approach = (v, t, k) => v + (t - v) * k;

  const C = {
    line: '#15171b',
    red: '#e2381f', redL: '#ff7a55', redD: '#9a1f0e',
    white: '#f7f7f4', whiteM: '#dfe2e7', whiteD: '#b4bac4',
    black: '#1a1c21', blackL: '#3d424c', blackH: '#5b616d',
    silver: '#d7dde4', silverL: '#f6f8fa', silverD: '#7b848f',
    gold: '#e8ad2e', goldL: '#ffe08a', goldD: '#9a6a12',
    jersey: '#1f63d6', jerseyL: '#5d9af8', jerseyD: '#123f8f', jerseyFar: '#0f2f68',
    accent: '#ffd23f', accentD: '#c79200',
    pants: '#1f2a46', pantsL: '#3f5487', pantsD: '#121a2e', pantsFar: '#0d1322',
    brace: '#2b3038', braceL: '#59606c',
    glove: '#22252c',
    boot: '#f4f5f7', bootM: '#d4d8de', bootD: '#9aa1ab',
    lensA: '#ffa13a', lensB: '#8a3cff',
  };

  const vis = {
    bikeRef: null, comp: 0, compV: 0, stand: 0, crouch: 0, lean: 0, tuck: 0, air: 0, bob: 0, reach: 1,
    lastR: 0, lastF: 0, wR: 0, wF: 0, fly: null, exhaust: { x: 0, y: 0, a: 0 },
  };
  const B = (S.BikeRenderer = { vis });

  B.onLand = (impact) => {
    const k = clamp(impact, 0, 14);
    vis.compV += k * 0.95;
    vis.crouch = Math.min(1, vis.crouch + k * 0.09);
  };

  B.onCrash = (b) => {
    const hv = { x: (b.H.x - b.H.px) * 120, y: (b.H.y - b.H.py) * 120 };
    vis.fly = {
      x: b.H.x, y: b.H.y + 14, vx: hv.x * 0.9, vy: Math.min(hv.y, 0) - 220,
      rot: Math.atan2(b.F.y - b.R.y, b.F.x - b.R.x), vr: (hv.x >= 0 ? 1 : -1) * (7 + Math.random() * 4), rest: 0,
    };
  };

  B.update = (dt, b, ctl, groundY) => {
    if (vis.bikeRef !== b) {
      vis.bikeRef = b; vis.comp = 0; vis.compV = 0; vis.stand = 0; vis.crouch = 0; vis.fly = null; vis.reach = 1;
      vis.lastR = b.spinR; vis.lastF = b.spinF;
    }
    if (typeof b.susp === 'number') {
      // compressão real da suspensão, vinda da física
      vis.comp = clamp(b.susp, -0.35, 1); vis.compV = 0;
    } else {
      vis.compV += (-240 * vis.comp - 15 * vis.compV) * dt;
      vis.comp = clamp(vis.comp + vis.compV * dt, -0.35, 1);
    }
    const air = !b.gR && !b.gF;
    vis.air = approach(vis.air, air ? 1 : 0, Math.min(1, dt * 6));
    vis.stand = approach(vis.stand, air || Math.abs(ctl.lean) > 0 ? 1 : 0, Math.min(1, dt * 4));
    vis.crouch = Math.max(0, vis.crouch - dt * 1.8);
    vis.lean = approach(vis.lean, ctl.lean, Math.min(1, dt * 7));
    vis.tuck = approach(vis.tuck, ctl.turbo ? 1 : 0, Math.min(1, dt * 5));
    if (dt > 0) {
      vis.wR = approach(vis.wR, (b.spinR - vis.lastR) / dt, 0.3);
      vis.wF = approach(vis.wF, (b.spinF - vis.lastF) / dt, 0.3);
    }
    vis.lastR = b.spinR; vis.lastF = b.spinF;
    // leve balanço do corpo em velocidade, proporcional ao giro da roda
    vis.bob += dt * (4 + Math.min(14, Math.abs(vis.wR) * 0.25));

    const f = vis.fly;
    if (f) {
      f.vy += 1500 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt;
      // colide pelo ponto do corpo que estiver mais enterrado (capacete, quadril, mãos ou pés)
      const c = Math.cos(f.rot), s = Math.sin(f.rot);
      let push = 0;
      for (const [lx, ly, r] of TUMBLE_HULL) {
        const px = f.x + lx * c - ly * s, py = f.y + lx * s + ly * c;
        const pen = py - (groundY(px) - r);
        if (pen > push) push = pen;
      }
      if (push > 0) {
        f.y -= push;
        if (f.vy > 0) f.vy *= -0.32;
        f.vx *= 0.62; f.vr *= 0.55;
        if (Math.abs(f.vy) < 40) { f.vy = 0; f.rest += dt; }
      }
    }
  };

  // ---------- Utilitários de desenho ----------
  function path(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
  }
  function lgrad(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    return g;
  }
  function fillLine(ctx, fill, lw) {
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = C.line; ctx.lineWidth = lw || 1.1; ctx.stroke();
  }
  function seg(ctx, ax, ay, bx, by, w, col) {
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  // Membro afinado (cápsula com larguras diferentes nas pontas), com contorno
  function limb(ctx, ax, ay, bx, by, wa, wb, fill, outline) {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L, a = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(ax + nx * wa / 2, ay + ny * wa / 2);
    ctx.lineTo(bx + nx * wb / 2, by + ny * wb / 2);
    ctx.arc(bx, by, wb / 2, a + Math.PI / 2, a - Math.PI / 2, true);
    ctx.lineTo(ax - nx * wa / 2, ay - ny * wa / 2);
    ctx.arc(ax, ay, wa / 2, a - Math.PI / 2, a + Math.PI / 2, true);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (outline !== false) { ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke(); }
  }
  // Articulação entre dois ossos; das duas soluções possíveis, fica a que aponta para (px, py)
  function ik(ax, ay, cx, cy, l1, l2, px, py) {
    const dx = cx - ax, dy = cy - ay;
    let d = Math.hypot(dx, dy);
    if (d > l1 + l2 - 0.01) d = l1 + l2 - 0.01;
    const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const base = Math.atan2(dy, dx);
    const k1 = [ax + Math.cos(base + a) * l1, ay + Math.sin(base + a) * l1];
    const k2 = [ax + Math.cos(base - a) * l1, ay + Math.sin(base - a) * l1];
    return k1[0] * px + k1[1] * py >= k2[0] * px + k2[1] * py ? k1 : k2;
  }

  // ---------- Rodas ----------
  function drawWheel(ctx, x, y, R, spin, w, front) {
    ctx.save();
    ctx.translate(x, y);
    const fast = Math.abs(w) > 26;
    // pneu
    const tg = ctx.createRadialGradient(-4, -5, R * 0.4, 0, 0, R + 2);
    tg.addColorStop(0, '#454a52'); tg.addColorStop(0.72, '#1d1f24'); tg.addColorStop(1, '#0b0c0e');
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    // cravos
    ctx.save(); ctx.rotate(spin);
    ctx.fillStyle = '#111215';
    for (let i = 0; i < 20; i++) {
      ctx.rotate(TAU / 20);
      ctx.beginPath(); ctx.moveTo(-2.2, -R + 0.6); ctx.lineTo(2.2, -R + 0.6); ctx.lineTo(1.6, -R - 1.9); ctx.lineTo(-1.6, -R - 1.9); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, R - 2.2, -1.5, -0.15); ctx.stroke();
    // aro
    const rimR = R - 5.2;
    ctx.fillStyle = '#26292f';
    ctx.beginPath(); ctx.arc(0, 0, rimR + 1.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = lgrad(ctx, 0, -rimR, 0, rimR, [C.silverL, C.silver, C.silverD]);
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(0, 0, rimR, 0, TAU); ctx.stroke();
    // raios cruzados
    ctx.save(); ctx.rotate(spin);
    ctx.globalAlpha = fast ? 0.25 : 0.95;
    ctx.strokeStyle = '#b3bcc6'; ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU, off = i % 2 ? 0.42 : -0.42;
      ctx.moveTo(Math.cos(a) * 3.4, Math.sin(a) * 3.4);
      ctx.lineTo(Math.cos(a + off) * (rimR - 1), Math.sin(a + off) * (rimR - 1));
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    // disco de freio (dianteira) ou coroa (traseira)
    if (front) {
      ctx.fillStyle = lgrad(ctx, -7, -7, 7, 7, ['#eef1f4', '#9aa3ad']);
      ctx.beginPath(); ctx.arc(0, 0, 7.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4f5660';
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * 5.4, Math.sin(a) * 5.4, 0.8, 0, TAU); ctx.fill(); }
    } else {
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU, rr = i % 2 ? 6.6 : 7.8; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = C.goldD;
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * 4.2, Math.sin(a) * 4.2, 1.2, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
    if (fast) {
      ctx.fillStyle = 'rgba(200,208,218,0.2)';
      ctx.beginPath(); ctx.arc(0, 0, rimR - 0.5, 0, TAU); ctx.fill();
    }
    // cubo
    const hg = ctx.createRadialGradient(-1, -1, 0, 0, 0, 3.3);
    hg.addColorStop(0, '#ffb39b'); hg.addColorStop(1, C.redD);
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = C.silverL; ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ---------- Piloto ----------
  const THIGH = 17, SHIN = 17.5, UARM = 12.5, FARM = 12.5;
  const HELMET_CLEAR = 11; // folga mínima entre o centro do capacete e o chão
  // pontos do piloto caído (no referencial do corpo) e o raio de cada um
  const TUMBLE_HULL = [[5, -17, 10], [-4, 6, 7], [2, 24, 4], [-15, 23, 4], [19, 4, 4], [-15, -17, 4]];

  // reach: 1 = capacete na postura normal (acima do ponto de colisão); 0 = colado no ponto de colisão
  function riderJoints(Hl, half, reach) {
    const st = vis.stand, ln = vis.lean, cr = vis.crouch, tk = vis.tuck;
    const bob = Math.sin(vis.bob) * 0.6 * (1 - vis.air);
    const hip = [
      -18 + st * 8 - ln * 6 + tk * 3,
      -42 - st * 10 + cr * 6 + Math.abs(ln) * 1.5 + bob,
    ];
    const head = [
      Hl[0] + (6 + st * 3 - ln * 7 + tk * 7) * reach,
      Hl[1] + (-14 - st * 4 + cr * 6 + tk * 6 + bob) * reach,
    ];
    const vx = hip[0] - head[0], vy = hip[1] - head[1], vl = Math.hypot(vx, vy) || 1;
    const shoulder = [head[0] + (vx / vl) * 9.5, head[1] + (vy / vl) * 9.5];
    const foot = [-3, -13.5];
    const hand = [half - 18, -47];
    const knee = ik(hip[0], hip[1], foot[0], foot[1], THIGH, SHIN, 1, -0.35);
    const elbow = ik(shoulder[0], shoulder[1], hand[0], hand[1], UARM, FARM, -0.2, 1);
    return { hip, head, shoulder, foot, hand, knee, elbow };
  }

  function drawLeg(ctx, j, far) {
    const [hx, hy] = j.hip, [kx, ky] = j.knee, [fx, fy] = j.foot;
    // coxa
    limb(ctx, hx, hy, kx, ky, 11, 9, far ? C.pantsFar : lgrad(ctx, hx, hy - 6, hx, hy + 6, [C.pantsL, C.pants, C.pantsD]));
    if (!far) {
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(hx + 1, hy - 3.5); ctx.lineTo(kx - 1, ky - 3.5); ctx.stroke();
    }
    // canela até a bota
    const bx = kx + (fx - kx) * 0.28, by = ky + (fy - ky) * 0.28;
    limb(ctx, kx, ky, bx, by, 8.6, 8, far ? C.pantsFar : C.pants);
    // bota
    const ang = Math.atan2(fy - by, fx - bx), nx = -Math.sin(ang), ny = Math.cos(ang);
    const w = far ? 4.4 : 5;
    ctx.beginPath();
    ctx.moveTo(bx + nx * w, by + ny * w);
    ctx.lineTo(fx + nx * w + 1, fy + ny * w * 0.4);
    ctx.quadraticCurveTo(fx + 10, fy + 0.5, fx + 9.5, fy + 3);
    ctx.lineTo(fx - 5.5, fy + 3.6);
    ctx.lineTo(bx - nx * w, by - ny * w);
    ctx.closePath();
    fillLine(ctx, far ? C.bootD : lgrad(ctx, bx - 5, by, fx + 6, fy, [C.boot, C.bootM, C.bootD]));
    if (!far) {
      ctx.strokeStyle = C.blackL; ctx.lineWidth = 1.5;
      for (let k = 1; k <= 3; k++) {
        const t = k / 4.2, px = bx + (fx - bx) * t, py = by + (fy - by) * t;
        ctx.beginPath(); ctx.moveTo(px - nx * w * 0.9, py - ny * w * 0.9); ctx.lineTo(px + nx * w * 0.9, py + ny * w * 0.9); ctx.stroke();
      }
      ctx.fillStyle = C.red; ctx.fillRect(bx - 2, by - 1, 4, 2);
    }
    ctx.fillStyle = C.black;
    ctx.beginPath(); ctx.moveTo(fx - 5.8, fy + 3); ctx.lineTo(fx + 9.6, fy + 2.4); ctx.lineTo(fx + 9, fy + 4.8); ctx.lineTo(fx - 5.6, fy + 5.4); ctx.closePath(); ctx.fill();
    // joelheira articulada
    if (!far) {
      ctx.save(); ctx.translate(kx, ky); ctx.rotate(Math.atan2(fy - ky, fx - kx));
      ctx.beginPath(); ctx.ellipse(1, -0.5, 6.4, 4.8, 0, 0, TAU);
      fillLine(ctx, lgrad(ctx, 0, -5, 0, 5, [C.braceL, C.brace]), 0.9);
      ctx.fillStyle = C.silver; ctx.beginPath(); ctx.arc(1, -0.5, 1.6, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function drawArm(ctx, j, far) {
    const [sx, sy] = j.shoulder, [ex, ey] = j.elbow, [hx, hy] = j.hand;
    const col = far ? C.jerseyFar : lgrad(ctx, sx, sy - 5, sx, sy + 5, [C.jerseyL, C.jersey, C.jerseyD]);
    limb(ctx, sx, sy, ex, ey, 8.4, 7, col);
    limb(ctx, ex, ey, hx, hy, 7, 5.6, far ? C.jerseyFar : C.jersey);
    if (!far) {
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ex + (hx - ex) * 0.55, ey + (hy - ey) * 0.55 - 2.5); ctx.lineTo(ex + (hx - ex) * 0.7, ey + (hy - ey) * 0.7 + 2.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(ex, ey, 3.2, 0, TAU); fillLine(ctx, C.brace, 0.8);
    }
    ctx.beginPath(); ctx.arc(hx, hy, far ? 3.4 : 4, 0, TAU);
    fillLine(ctx, C.glove, 0.8);
    if (!far) { ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(hx - 1, hy - 1.6, 1.4, 0, TAU); ctx.fill(); }
  }

  function drawTorso(ctx, j) {
    const [hx, hy] = j.hip, [sx, sy] = j.shoulder;
    const ang = Math.atan2(sy - hy, sx - hx), len = Math.hypot(sx - hx, sy - hy);
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(ang);
    // costas (y negativo) e peito (y positivo) no referencial do tronco
    ctx.beginPath();
    ctx.moveTo(-4, -6.5);
    ctx.quadraticCurveTo(len * 0.45, -9.5, len + 2, -7);
    ctx.quadraticCurveTo(len + 6.5, 0, len + 2.5, 7.2);
    ctx.quadraticCurveTo(len * 0.5, 9, -3, 7);
    ctx.quadraticCurveTo(-7, 0, -4, -6.5);
    ctx.closePath();
    fillLine(ctx, lgrad(ctx, 0, -9, 0, 9, [C.jerseyD, C.jersey, C.jerseyL]));
    ctx.save(); ctx.clip();
    // faixa lateral e protetor de peito
    ctx.fillStyle = C.accent;
    ctx.beginPath(); ctx.moveTo(-6, 1.5); ctx.lineTo(len + 6, -0.5); ctx.lineTo(len + 6, 2.2); ctx.lineTo(-6, 4.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(10,20,45,0.45)';
    ctx.beginPath(); ctx.ellipse(len * 0.62, 6.8, len * 0.36, 3.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 7px Nunito, Arial, sans-serif';
    ctx.save(); ctx.translate(len * 0.5, -3); ctx.rotate(Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('7', 0, 2.5); ctx.restore();
    ctx.restore();
    // cinta lombar
    ctx.beginPath(); ctx.rect(-5, -7, 5, 14);
    fillLine(ctx, C.black, 0.8);
    // protetor de pescoço
    ctx.beginPath(); ctx.ellipse(len + 1, 0, 3, 6.5, 0, 0, TAU);
    fillLine(ctx, C.brace, 0.8);
    ctx.restore();
  }

  function drawHelmet(ctx, j) {
    const [hx, hy] = j.head, [sx, sy] = j.shoulder;
    const up = Math.atan2(hy - sy, hx - sx);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(up + Math.PI / 2 + 0.1);
    // casco: cúpula + queixeira longa para a frente
    ctx.beginPath();
    ctx.moveTo(-8.6, 4.5);
    ctx.bezierCurveTo(-10.5, -5, -4.5, -10.5, 2, -10);
    ctx.bezierCurveTo(7.5, -9.5, 10, -5, 9.6, -1);
    ctx.lineTo(12.8, 5.5);
    ctx.quadraticCurveTo(10.5, 9.8, 4.5, 9.4);
    ctx.lineTo(-3, 8.6);
    ctx.quadraticCurveTo(-8, 8.2, -8.6, 4.5);
    ctx.closePath();
    ctx.fillStyle = lgrad(ctx, 7, -9, -7, 9, ['#ffffff', C.white, C.whiteD]);
    ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = C.red;
    ctx.beginPath(); ctx.moveTo(-12, -2); ctx.quadraticCurveTo(0, -9, 12, -5); ctx.lineTo(12, -2.5); ctx.quadraticCurveTo(0, -6, -12, 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.jersey;
    ctx.beginPath(); ctx.moveTo(-12, 1.6); ctx.quadraticCurveTo(0, -4.2, 12, -1.8); ctx.lineTo(12, -0.6); ctx.quadraticCurveTo(0, -2.8, -12, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath(); ctx.ellipse(-5, 7, 8, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(1.5, -7.5, 4, 1.3, -0.15, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = C.line; ctx.lineWidth = 1.1; ctx.stroke();
    // respiros da queixeira
    ctx.fillStyle = C.blackL;
    for (let k = 0; k < 3; k++) ctx.fillRect(8.2 + k * 1.4, 4.6 + k * 0.5, 0.8, 2.6);
    // óculos com tira
    ctx.fillStyle = C.black; ctx.fillRect(-9.2, -2.6, 13, 3);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(3.6, -4.4, 8.4, 6.6, 2.4); else ctx.rect(3.6, -4.4, 8.4, 6.6);
    ctx.fillStyle = C.black; ctx.fill();
    ctx.fillStyle = lgrad(ctx, 4.5, -3.6, 11, 1.6, [C.lensA, '#ff5f6d', C.lensB]);
    ctx.fillRect(4.7, -3.4, 6.3, 4.6);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(5.3, -3, 2.4, 1.2);
    // pala
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(15, -8.8); ctx.lineTo(14.2, -5.6); ctx.lineTo(2.4, -6.6); ctx.closePath();
    fillLine(ctx, lgrad(ctx, 0, -10, 0, -6, ['#ffffff', C.whiteM]), 0.9);
    ctx.fillStyle = C.red; ctx.fillRect(3.5, -8.3, 9.5, 1.3);
    ctx.restore();
  }

  function drawRider(ctx, j) {
    drawLeg(ctx, j, false);
    drawTorso(ctx, j);
    drawArm(ctx, j, false);
    drawHelmet(ctx, j);
  }

  // ---------- Moto completa ----------
  B.draw = (ctx, b, groundY, opts) => {
    const a = Math.atan2(b.F.y - b.R.y, b.F.x - b.R.x);
    const cx = (b.R.x + b.F.x) / 2, cy = (b.R.y + b.F.y) / 2;
    const half = Math.hypot(b.F.x - b.R.x, b.F.y - b.R.y) / 2;
    const R = opts.wheelR;
    const ca = Math.cos(-a), sa = Math.sin(-a);
    const cmp = vis.comp * 7;
    const Hl = [(b.H.x - cx) * ca - (b.H.y - cy) * sa, (b.H.x - cx) * sa + (b.H.y - cy) * ca - cmp * 0.5];
    const riding = !vis.fly;

    // sombra projetada no chão
    const gy = groundY(cx), h = clamp((gy - cy) / 220, 0, 1);
    ctx.save();
    ctx.translate(cx, gy + 2); ctx.scale(1, 0.16);
    const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 54);
    sg.addColorStop(0, `rgba(0,0,0,${0.38 * (1 - h)})`); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(0, 0, 54 * (1 - h * 0.4), 0, TAU); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // Se o capacete desenhado fosse entrar no chão, o piloto se encolhe em direção ao ponto de
    // colisão da física, que nunca afunda (a queda é detectada antes disso)
    const toWorldY = (lx, ly) => [cx + lx * Math.cos(a) - (ly + cmp) * Math.sin(a), cy + lx * Math.sin(a) + (ly + cmp) * Math.cos(a)];
    let reachT = 0;
    for (const s of [1, 0.8, 0.6, 0.4, 0.2]) {
      const hj = riderJoints(Hl, half, s).head;
      const [wx, wy] = toWorldY(hj[0], hj[1]);
      if (groundY(wx) - wy >= HELMET_CLEAR) { reachT = s; break; }
    }
    vis.reach = reachT < vis.reach ? reachT : approach(vis.reach, reachT, 0.12);
    const j = riderJoints(Hl, half, vis.reach);
    const jf = {
      hip: [j.hip[0] + 2, j.hip[1] - 1], head: j.head, shoulder: [j.shoulder[0] + 2.5, j.shoulder[1] - 1],
      foot: [j.foot[0] + 2.5, j.foot[1] - 1.2], hand: [j.hand[0] - 1.5, j.hand[1] - 1.2],
    };
    jf.knee = ik(jf.hip[0], jf.hip[1], jf.foot[0], jf.foot[1], THIGH, SHIN, 1, -0.35);
    jf.elbow = ik(jf.shoulder[0], jf.shoulder[1], jf.hand[0], jf.hand[1], UARM, FARM, -0.2, 1);

    // lado de lá: braço, perna e guidão
    ctx.save(); ctx.translate(0, cmp);
    if (riding) { drawArm(ctx, jf, true); drawLeg(ctx, jf, true); }
    ctx.restore();

    drawWheel(ctx, -half, 0, R, b.spinR, vis.wR, false);
    drawWheel(ctx, half, 0, R, b.spinF, vis.wF, true);

    ctx.save();
    ctx.translate(0, cmp);
    const RA = [-half, -cmp], FA = [half, -cmp];
    const SP = [-6, -16];

    // amortecedor traseiro (fica atrás da tampa lateral)
    const SB = [SP[0] + (RA[0] - SP[0]) * 0.3, SP[1] + (RA[1] - SP[1]) * 0.3 - 2.5];
    const ST = [-12, -33];
    {
      const dx = SB[0] - ST[0], dy = SB[1] - ST[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
      limb(ctx, ST[0], ST[1], SB[0], SB[1], 3.6, 3.6, C.blackL);
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5;
      for (let k = 0; k < 7; k++) {
        const t = 0.18 + k * 0.1, px = ST[0] + dx * t, py = ST[1] + dy * t;
        ctx.beginPath(); ctx.moveTo(px - nx * 3.2, py - ny * 3.2); ctx.lineTo(px + nx * 3.2 + ux * 1.6, py + ny * 3.2 + uy * 1.6); ctx.stroke();
      }
    }
    // corrente
    ctx.strokeStyle = '#2b2e34'; ctx.lineWidth = 1.5;
    ctx.setLineDash([1.4, 1.1]);
    ctx.beginPath(); ctx.moveTo(-3, -17.5); ctx.lineTo(RA[0], RA[1] - 7.6); ctx.moveTo(-3, -10.5); ctx.lineTo(RA[0], RA[1] + 7.6); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#3a3f47'; ctx.beginPath(); ctx.arc(-3, -14, 3.6, 0, TAU); ctx.fill();
    // balança traseira
    {
      const ang = Math.atan2(RA[1] - SP[1], RA[0] - SP[0]), L = Math.hypot(RA[0] - SP[0], RA[1] - SP[1]);
      ctx.save(); ctx.translate(SP[0], SP[1]); ctx.rotate(ang);
      path(ctx, [-2.5, -3.8, L - 1, -2.4, L + 3.2, -1, L + 3.2, 1.6, L - 1, 2.6, -2.5, 4]);
      fillLine(ctx, lgrad(ctx, 0, -4, 0, 4, [C.silverL, C.silver, C.silverD]), 0.9);
      ctx.fillStyle = C.black; ctx.fillRect(L * 0.45, -1.4, L * 0.3, 2.6);
      ctx.restore();
      ctx.fillStyle = C.silverD; ctx.beginPath(); ctx.arc(SP[0], SP[1], 2.2, 0, TAU); ctx.fill();
    }
    // quadro
    ctx.lineWidth = 3.4; ctx.strokeStyle = '#555c67';
    ctx.beginPath(); ctx.moveTo(19, -39); ctx.lineTo(-10, -35); ctx.lineTo(SP[0], SP[1]); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(21, -32); ctx.lineTo(6, -12); ctx.lineTo(SP[0], SP[1]); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.moveTo(19, -40); ctx.lineTo(-10, -36); ctx.stroke();
    // motor
    path(ctx, [0, -31, 12, -29.5, 13.5, -19, 2, -16.5]);
    fillLine(ctx, lgrad(ctx, 0, -31, 0, -16, ['#7a828e', '#464c56', '#2a2e35']), 0.9);
    ctx.strokeStyle = '#1b1e22'; ctx.lineWidth = 0.8;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(1, -28.5 + k * 3); ctx.lineTo(12.6, -27 + k * 3); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(0, -13.5, 10.5, 7.2, 0, 0, TAU);
    fillLine(ctx, lgrad(ctx, -8, -20, 8, -7, ['#b3bbc5', '#6a727d', '#3b4149']), 0.9);
    ctx.beginPath(); ctx.arc(2.5, -13.5, 4.6, 0, TAU);
    fillLine(ctx, lgrad(ctx, 0, -18, 0, -9, ['#e1e6eb', '#8e97a2']), 0.8);
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(2.5, -13.5, 1.6, 0, TAU); ctx.fill();
    // pedal de partida
    seg(ctx, -6, -18, -12, -9, 1.6, C.blackL);
    // escapamento: curva do coletor e silenciador sob o banco
    ctx.lineWidth = 3.6;
    ctx.strokeStyle = lgrad(ctx, 0, -26, 0, -6, ['#f2f4f6', '#a5aeb8', '#6a737e']);
    ctx.beginPath(); ctx.moveTo(12, -25); ctx.bezierCurveTo(19.5, -19, 16, -8, 5, -8.5); ctx.bezierCurveTo(-6, -9, -12, -17, -16, -26); ctx.stroke();
    ctx.save(); ctx.translate(-15, -29); ctx.rotate(-0.17);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-27, -3.4, 27, 6.8, 3.2); else ctx.rect(-27, -3.4, 27, 6.8);
    fillLine(ctx, lgrad(ctx, 0, -3.4, 0, 3.4, ['#ffffff', '#c1c9d2', '#6c7580']), 0.9);
    ctx.fillStyle = C.black; ctx.fillRect(-30, -2.2, 3.5, 4.4);
    ctx.fillStyle = C.red; ctx.fillRect(-10, -3.4, 2.6, 6.8);
    ctx.restore();
    {
      const ex = -15 + Math.cos(-0.17) * -30, ey = -29 + Math.sin(-0.17) * -30;
      vis.exhaust.x = cx + (ex * Math.cos(a) - (ey + cmp) * Math.sin(a));
      vis.exhaust.y = cy + (ex * Math.sin(a) + (ey + cmp) * Math.cos(a));
      vis.exhaust.a = a - 0.17;
    }
    // caixa do filtro e para-lama traseiro
    path(ctx, [-27, -37, -9, -37, -8, -27, -22, -28]);
    ctx.fillStyle = C.black; ctx.fill();
    path(ctx, [-10, -41, -30, -43, -49, -47.5, -50.5, -44.5, -38, -38.5, -14, -34]);
    fillLine(ctx, lgrad(ctx, 0, -47, 0, -34, ['#ffffff', C.white, C.whiteD]));
    ctx.fillStyle = C.red; path(ctx, [-38, -44.6, -48.5, -47, -49.6, -45.3, -39, -42.4]); ctx.fill();
    // banco
    ctx.beginPath();
    ctx.moveTo(-40, -42); ctx.quadraticCurveTo(-22, -45.5, -4, -44.5); ctx.lineTo(7, -47);
    ctx.lineTo(8, -43.5); ctx.quadraticCurveTo(-18, -40.5, -39, -38.5); ctx.closePath();
    fillLine(ctx, lgrad(ctx, 0, -47, 0, -38, ['#4a505a', C.black]), 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.7;
    ctx.setLineDash([1.2, 1.2]);
    ctx.beginPath(); ctx.moveTo(-37, -41.4); ctx.quadraticCurveTo(-20, -44.2, -3, -43.4); ctx.stroke();
    ctx.setLineDash([]);
    // tampa lateral com placa de número
    path(ctx, [-35, -37.5, -11, -38.5, -9, -28, -20, -24.5, -32, -29]);
    fillLine(ctx, lgrad(ctx, 0, -38, 0, -24, ['#ffffff', C.white, C.whiteM]));
    path(ctx, [-31, -36, -15, -36.6, -13.5, -29, -20, -27, -29.5, -30]);
    ctx.fillStyle = C.accent; ctx.fill();
    ctx.fillStyle = C.red; ctx.font = '13px "Lilita One", Impact, sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('7', -22, -28.6); ctx.textAlign = 'start';
    // radiador e tanque/carenagem
    path(ctx, [7, -38, 19, -38, 19, -27, 8, -27]);
    ctx.fillStyle = '#2a2e35'; ctx.fill();
    ctx.strokeStyle = '#5b626d'; ctx.lineWidth = 0.6;
    for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(8, -36.5 + k * 2.2); ctx.lineTo(18.5, -36.5 + k * 2.2); ctx.stroke(); }
    path(ctx, [-7, -41.5, 6, -46.5, 20, -46, 26, -38, 20, -27.5, 13, -29, 8, -33, -1, -33]);
    fillLine(ctx, lgrad(ctx, 0, -47, 0, -27, [C.redL, C.red, C.redD]));
    ctx.save(); path(ctx, [-7, -41.5, 6, -46.5, 20, -46, 26, -38, 20, -27.5, 13, -29, 8, -33, -1, -33]); ctx.clip();
    ctx.fillStyle = C.white;
    path(ctx, [2, -40.5, 24, -43, 25, -39.5, 6, -36.5]); ctx.fill();
    ctx.fillStyle = C.black;
    path(ctx, [12, -35, 22, -36.5, 19.5, -30.5, 13, -31]); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    path(ctx, [-4, -42, 6, -45.5, 18, -45.2, 6, -43.5]); ctx.fill();
    ctx.restore();

    // garfo telescópico (encurta quando a suspensão comprime)
    const HT = [19.5, -40];
    const fdx = FA[0] - HT[0], fdy = FA[1] - HT[1];
    const U = [HT[0] + fdx * 0.58, HT[1] + fdy * 0.58], Lw = [FA[0] - fdx * 0.52, FA[1] - fdy * 0.52];
    limb(ctx, Lw[0], Lw[1], FA[0], FA[1], 4.4, 4.4, lgrad(ctx, Lw[0] - 2, 0, Lw[0] + 2, 0, [C.silverD, C.silverL, C.silver]));
    limb(ctx, HT[0], HT[1], U[0], U[1], 5.8, 5.4, lgrad(ctx, HT[0] - 3, 0, HT[0] + 3, 0, [C.goldD, C.goldL, C.gold]));
    // protetor do garfo e pinça de freio
    {
      const fa = Math.atan2(fdy, fdx);
      ctx.save(); ctx.translate(Lw[0] + (FA[0] - Lw[0]) * 0.45, Lw[1] + (FA[1] - Lw[1]) * 0.45); ctx.rotate(fa);
      path(ctx, [-6, -2.8, 6, -3.2, 6, 3.4, -6, 2.8]);
      fillLine(ctx, C.black, 0.8);
      ctx.restore();
      ctx.save(); ctx.translate(FA[0], FA[1]); ctx.rotate(fa);
      path(ctx, [-6.5, 2, -1, 2.4, -1, 6.8, -6, 6.2]);
      fillLine(ctx, C.red, 0.7);
      ctx.restore();
    }
    ctx.fillStyle = C.black; ctx.beginPath(); ctx.arc(FA[0], FA[1], 2.4, 0, TAU); ctx.fill();
    // para-lama dianteiro, preso embaixo do garfo
    {
      const fa = Math.atan2(-fdy, -fdx);
      ctx.save(); ctx.translate(FA[0], FA[1]); ctx.rotate(fa + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(-14, -19.5); ctx.quadraticCurveTo(0, -25.5, 19, -21); ctx.lineTo(19.6, -18.2); ctx.quadraticCurveTo(0, -21.8, -13, -17);
      ctx.closePath();
      fillLine(ctx, lgrad(ctx, 0, -26, 0, -17, ['#ffffff', C.white, C.whiteD]), 1);
      ctx.fillStyle = C.red; ctx.fillRect(-3, -23.4, 7, 1.6);
      ctx.restore();
    }
    // mesa, placa frontal e guidão
    ctx.fillStyle = C.blackL; ctx.beginPath(); ctx.arc(HT[0], HT[1], 2.6, 0, TAU); ctx.fill();
    path(ctx, [21.5, -45, 30, -41, 27.5, -29.5, 21.5, -32.5]);
    fillLine(ctx, lgrad(ctx, 21, -45, 30, -30, ['#ffffff', C.whiteM]));
    ctx.fillStyle = C.red; ctx.font = '8px "Lilita One", Impact, sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('7', 25.5, -34); ctx.textAlign = 'start';
    seg(ctx, HT[0] - 1, HT[1] - 1, half - 18, -47.5, 2.6, C.blackL);
    seg(ctx, half - 20, -48, half - 15, -49.5, 3.6, C.black);
    ctx.fillStyle = C.red; ctx.fillRect(half - 21, -47.6, 4, 2.4);
    // pedaleira
    ctx.fillStyle = C.silverD; ctx.fillRect(-7, -14.6, 8, 2);

    if (riding) drawRider(ctx, j);
    ctx.restore();
    ctx.restore();

    if (vis.fly) drawTumble(ctx, vis.fly, opts.clock);
  };

  // Piloto caído/rolando depois da queda
  function drawTumble(ctx, f, clock) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    const flail = f.rest > 0 ? 0 : Math.sin(clock * 18) * 4;
    const j = {
      hip: [-4, 6], head: [5, -17], shoulder: [2, -7],
      knee: [8 + flail, 12], foot: [2, 24],
      elbow: [12, -2 - flail], hand: [19, 4],
    };
    const jf = {
      hip: [-3, 5], head: j.head, shoulder: [1, -8],
      knee: [-8, 15 - flail], foot: [-15, 23], elbow: [-8, -11 + flail], hand: [-15, -17],
    };
    drawArm(ctx, jf, true); drawLeg(ctx, jf, true);
    drawLeg(ctx, j, false); drawTorso(ctx, j); drawArm(ctx, j, false); drawHelmet(ctx, j);
    ctx.restore();
  }
})();
