// Física da moto, separada do desenho. Partículas com restrições resolvidas por posição (XPBD),
// em subpassos dentro do passo fixo do jogo. Unidades: px, s, massa relativa.
(function () {
  'use strict';
  const S = (window.Serra = window.Serra || {});

  // ---------- Parâmetros ajustáveis ----------
  const PHYS = {
    gravity: 1500,               // px/s²
    substeps: 8,                 // subpassos por passo fixo (1/120 s)
    wheelRadius: 17,
    // massas relativas; o centro de massa fica um pouco atrás do meio e ~25 px acima dos eixos
    mass: { wheelR: 1.0, wheelF: 0.8, chassisRear: 2.0, chassisFront: 1.4, pivot: 1.2, rider: 2.6 },
    // geometria em repouso (px), origem no meio entre os eixos, y para baixo
    geometry: {
      wheelR: [-32, 0], wheelF: [32, 0],
      chassisRear: [-14, -26], chassisFront: [19, -31], pivot: [-2, -12], rider: [-10, -44],
      head: [-6, -54],
    },
    suspension: {
      rearRate: 1100,            // rigidez medida na roda (força por px de curso)
      frontRate: 850,
      rearDamping: 66,           // amortecimento na compressão, medido na roda (força por px/s)
      frontDamping: 54,
      reboundRatio: 2.2,         // o retorno da mola é amortecido esta vez mais que a compressão
      travel: 14,                // curso máximo de compressão na roda (px)
      topOut: 2,                 // quanto a mola pode esticar além do repouso (px)
    },
    engine: {
      accel: 1250,               // aceleração do motor partindo do repouso (px/s²)
      maxSpeed: 1150,            // velocidade em que o motor deixa de empurrar (px/s)
      turboAccel: 1600,
      turboMaxSpeed: 1650,
      reverseAccel: 320,
      reverseMaxSpeed: 240,
      airTurboAccel: 140,        // empurrão do turbo no ar, na direção da moto
    },
    brakeDecel: 1700,            // desaceleração máxima de frenagem (px/s²), 40% traseira / 60% dianteira
    tireGrip: 1.25,              // atrito máximo do pneu = grip × carga na roda
    rollingResistance: 0.018,    // fração da carga na roda
    airDrag: 0.00016,            // desaceleração = airDrag × v² (px/s²)
    bodyFriction: 0.55,          // atrito de partes do corpo arrastando no chão
    restitution: 0.04,           // quique das rodas
    bodyRestitution: 0.12,
    control: {
      airTorque: 12.5,           // aceleração angular no ar (rad/s²)
      groundTorque: 8.5,         // transferência de peso no chão (rad/s²)
      maxSpin: 7.5,              // limite de velocidade de giro gerado pelo jogador (rad/s)
      airDamping: 0.65,          // perda de giro no ar por segundo (fração)
    },
    crash: {
      headRadius: 10,
      riderRadius: 9,
      hardLanding: 1900,         // impacto de roda acima disso derruba (px/s)
      badLandingAngle: 1.1,      // pouso com a moto mais torta que isso (rad) em relação ao chão…
      badLandingSpeed: 520,      // …e impacto acima disso derruba
    },
  };

  // ---------- Veículos ----------
  // O quadriciclo parte dos valores da moto e muda só o necessário: mais pesado, mais longo e
  // mais baixo, com mais aderência, menos velocidade final e giro no ar mais lento
  function merge(base, over) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    for (const k in over) {
      const v = over[k];
      out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] ? merge(base[k], v) : v;
    }
    return out;
  }
  const VEHICLES = {
    moto: Object.assign(PHYS, { kind: 'moto' }),
    quad: merge(PHYS, {
      kind: 'quad',
      mass: { wheelR: 1.4, wheelF: 1.2, chassisRear: 2.8, chassisFront: 2.2, pivot: 1.6, rider: 2.6 },
      geometry: {
        wheelR: [-37, 0], wheelF: [37, 0],
        chassisRear: [-18, -24], chassisFront: [20, -27], pivot: [0, -11], rider: [-9, -44],
        head: [-4, -56],
      },
      suspension: { rearRate: 1500, frontRate: 1250, rearDamping: 90, frontDamping: 76, travel: 11 },
      engine: { accel: 1200, maxSpeed: 980, turboAccel: 1500, turboMaxSpeed: 1350, reverseAccel: 300 },
      tireGrip: 1.5,
      airDrag: 0.0002,
      control: { airTorque: 9.5, groundTorque: 6.5, maxSpin: 6.2, airDamping: 0.8 },
      crash: { hardLanding: 2100, badLandingAngle: 1.2 },
    }),
  };

  // ---------- Terreno ----------
  function groundY(T, x) {
    const ys = T.ys, SEG = T.SEG;
    let i = Math.floor(x / SEG);
    i = i < 0 ? 0 : i > T.n - 2 ? T.n - 2 : i;
    let t = (x - i * SEG) / SEG;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return ys[i] + (ys[i + 1] - ys[i]) * t;
  }

  // Distância assinada de um ponto ao terreno (negativa = enterrado) e a normal do contato
  const nearOut = { d: 0, nx: 0, ny: -1 };
  function nearest(T, px, py, r) {
    const ys = T.ys, SEG = T.SEG;
    const ic = Math.floor(px / SEG);
    const below = py > groundY(T, px);
    const i0 = Math.max(0, Math.floor((px - r - 2) / SEG));
    const i1 = Math.min(T.n - 2, Math.floor((px + r + 2) / SEG));
    let best = 1e9, bnx = 0, bny = -1;
    for (let i = i0; i <= i1; i++) {
      const ax = i * SEG, ay = ys[i], dx = SEG, dy = ys[i + 1] - ay;
      const len = Math.hypot(dx, dy);
      let nx, ny, d;
      if (below && i === ic) {
        nx = dy / len; ny = -dx / len;
        d = (px - ax) * nx + (py - ay) * ny;
      } else {
        let t = ((px - ax) * dx + (py - ay) * dy) / (len * len);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - (ax + dx * t), ey = py - (ay + dy * t);
        d = Math.hypot(ex, ey);
        if (d > 1e-6) { nx = ex / d; ny = ey / d; } else { nx = dy / len; ny = -dx / len; }
      }
      if (d < best) { best = d; bnx = nx; bny = ny; }
    }
    nearOut.d = best; nearOut.nx = bnx; nearOut.ny = bny;
    return nearOut;
  }

  // ---------- Montagem da moto ----------
  function particle(x, y, m, r, kind) {
    return { x, y, px: x, py: y, vx: 0, vy: 0, sx: x, sy: y, ovx: 0, ovy: 0, m, w: 1 / m, r, kind,
      contact: false, nx: 0, ny: -1, jn: 0, vnPre: 0 };
  }
  function link(a, b, opts) {
    const L0 = Math.hypot(b.x - a.x, b.y - a.y);
    return Object.assign({ a, b, L0, compliance: 0, damping: 0, min: -Infinity, max: Infinity }, opts || {});
  }

  function createBike(x, T, cfg) {
    const P = cfg || PHYS;
    const g = P.geometry, m = P.mass, R = P.wheelRadius;
    // apoia a moto no chão já inclinada conforme o terreno
    const yR = groundY(T, x + g.wheelR[0]) - R - 1, yF = groundY(T, x + g.wheelF[0]) - R - 1;
    const ang = Math.atan2(yF - yR, g.wheelF[0] - g.wheelR[0]);
    const cx = x, cy = (yR + yF) / 2, ca = Math.cos(ang), sa = Math.sin(ang);
    const at = (p) => [cx + p[0] * ca - p[1] * sa, cy + p[0] * sa + p[1] * ca];
    const mk = (key, mass, r, kind) => { const [px, py] = at(g[key]); return particle(px, py, mass, r, kind); };

    const wR = mk('wheelR', m.wheelR, R, 'wheel');
    const wF = mk('wheelF', m.wheelF, R, 'wheel');
    const cR = mk('chassisRear', m.chassisRear, 7, 'body');
    const cF = mk('chassisFront', m.chassisFront, 7, 'body');
    const pv = mk('pivot', m.pivot, 6, 'body');
    const rd = mk('rider', m.rider, P.crash.riderRadius, 'rider');
    const parts = [wR, wF, cR, cF, pv, rd];

    // chassi + piloto: corpo rígido
    const rigid = [[cR, cF], [cR, pv], [cR, rd], [cF, pv], [cF, rd], [pv, rd]].map(([a, b]) => link(a, b));
    // balança traseira e braço dianteiro: barras rígidas presas ao pivô (a roda sobe em arco)
    const armR = link(pv, wR), armF = link(pv, wF);
    // molas: a rigidez interna é convertida a partir da rigidez desejada na roda
    const spring = (wheel, anchor, rate, damp) => {
      const s = link(wheel, anchor);
      const arm = { x: wheel.x - pv.x, y: wheel.y - pv.y };
      const al = Math.hypot(arm.x, arm.y);
      const tx = arm.y / al, ty = -arm.x / al; // direção de subida da roda no arco
      const sx = (anchor.x - wheel.x) / s.L0, sy = (anchor.y - wheel.y) / s.L0;
      const proj = Math.max(0.2, Math.abs(tx * sx + ty * sy));
      s.k = rate / (proj * proj);
      s.compliance = 1 / s.k;
      s.damping = damp / (proj * proj);
      s.rebound = s.damping * P.suspension.reboundRatio;
      s.min = s.L0 - P.suspension.travel * proj;
      s.max = s.L0 + P.suspension.topOut * proj;
      s.proj = proj;
      return s;
    };
    const shockR = spring(wR, cR, P.suspension.rearRate, P.suspension.rearDamping);
    const shockF = spring(wF, cF, P.suspension.frontRate, P.suspension.frontDamping);

    // a cabeça é um ponto fixo do referencial do chassi (não tem massa própria)
    const ux = (cF.x - cR.x), uy = (cF.y - cR.y), ul = Math.hypot(ux, uy);
    const [hx, hy] = at(g.head);
    const dx = hx - rd.x, dy = hy - rd.y;
    const headLocal = [(dx * ux + dy * uy) / ul, (-dx * uy + dy * ux) / ul];

    const bike = {
      cfg: P, kind: P.kind || 'moto',
      R: wR, F: wF, Cr: cR, Cf: cF, Pv: pv, P: rd, parts,
      H: { x: hx, y: hy, px: hx, py: hy },
      rigid, arms: [armR, armF], springs: [shockR, shockF], shockR, shockF, headLocal,
      massTotal: parts.reduce((s, p) => s + p.m, 0),
      spinR: 0, spinF: 0, wR: 0, wF: 0, gR: true, gF: true, wasAir: false,
      lean: 0, airT: 0, airRot: 0, lastA: ang, vt: 0, speed: 0,
      susp: 0, suspR: 0, suspF: 0, omega: 0,
      impactR: 0, impactF: 0, touchdown: false, touchdownImpact: 0, landingMismatch: 0,
      riderHit: false, headHit: false, slipping: false,
    };
    bike.prevSpinR = 0; bike.prevSpinF = 0;
    return bike;
  }

  // ---------- Restrições ----------
  function solveLink(c, h) {
    const a = c.a, b = c.b;
    let dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1e-9;
    dx /= d; dy /= d;
    let C;
    if (c.compliance === 0) C = d - c.L0;
    else if (d < c.min) C = d - c.min;          // fim de curso: batente rígido
    else if (d > c.max) C = d - c.max;
    else {
      // mola (XPBD com complacência)
      const at = c.compliance / (h * h);
      const lam = -(d - c.L0) / (a.w + b.w + at);
      a.x -= dx * lam * a.w; a.y -= dy * lam * a.w;
      b.x += dx * lam * b.w; b.y += dy * lam * b.w;
      return;
    }
    const lam = -C / (a.w + b.w);
    a.x -= dx * lam * a.w; a.y -= dy * lam * a.w;
    b.x += dx * lam * b.w; b.y += dy * lam * b.w;
  }

  // amortecimento ao longo da mola (só a componente relativa); retorno mais amortecido que a compressão,
  // e nos batentes o choque é absorvido (a velocidade relativa é zerada, sem devolver energia)
  function dampLink(c, h) {
    if (!c.damping) return;
    const a = c.a, b = c.b;
    let dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1e-9;
    dx /= d; dy /= d;
    const vrel = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy;
    const jMax = Math.abs(vrel) / (a.w + b.w);
    let j;
    if (d <= c.min + 0.4 || d >= c.max - 0.2) j = vrel / (a.w + b.w);
    else {
      j = (vrel > 0 ? c.rebound : c.damping) * vrel * h;
      if (Math.abs(j) > jMax) j = Math.sign(j) * jMax;
    }
    a.vx += dx * j * a.w; a.vy += dy * j * a.w;
    b.vx -= dx * j * b.w; b.vy -= dy * j * b.w;
  }

  // centro de massa, velocidade do centro e velocidade angular do conjunto
  const bodyState = { cx: 0, cy: 0, vx: 0, vy: 0, omega: 0, inertia: 0 };
  function computeBody(b) {
    let M = 0, cx = 0, cy = 0, vx = 0, vy = 0;
    for (const p of b.parts) { M += p.m; cx += p.m * p.x; cy += p.m * p.y; vx += p.m * p.vx; vy += p.m * p.vy; }
    cx /= M; cy /= M; vx /= M; vy /= M;
    let L = 0, I = 0;
    for (const p of b.parts) {
      const rx = p.x - cx, ry = p.y - cy;
      L += p.m * (rx * (p.vy - vy) - ry * (p.vx - vx));
      I += p.m * (rx * rx + ry * ry);
    }
    bodyState.cx = cx; bodyState.cy = cy; bodyState.vx = vx; bodyState.vy = vy;
    bodyState.inertia = I; bodyState.omega = L / I;
    return bodyState;
  }
  // aplica uma aceleração angular pura (não empurra o centro de massa)
  function addAngular(b, bs, alpha, h) {
    const dw = alpha * h;
    for (const p of b.parts) {
      const rx = p.x - bs.cx, ry = p.y - bs.cy;
      p.vx += -ry * dw; p.vy += rx * dw;
    }
  }

  // ---------- Passo da simulação ----------
  function step(b, input, dt, T) {
    const P = b.cfg;
    const n = P.substeps, h = dt / n;
    const parts = b.parts;
    for (const p of parts) { p.px = p.x; p.py = p.y; }
    b.H.px = b.H.x; b.H.py = b.H.y;
    b.prevSpinR = b.spinR; b.prevSpinF = b.spinF;
    b.impactR = 0; b.impactF = 0; b.touchdown = false; b.riderHit = false; b.headHit = false; b.slipping = false;
    const wasAir = !b.gR && !b.gF;
    let anyWheel = false, groundedR = false, groundedF = false;
    const E = P.engine, C = P.control;
    const M = b.massTotal;

    for (let s = 0; s < n; s++) {
      const bs = computeBody(b);
      const air = !b.R.contact && !b.F.contact;

      // forças externas: gravidade e arrasto do ar (proporcional a v²)
      const vmag = Math.hypot(bs.vx, bs.vy);
      const drag = P.airDrag * vmag;
      for (const p of parts) {
        p.vy += P.gravity * h;
        p.vx -= p.vx * drag * h; p.vy -= p.vy * drag * h;
      }

      // controle de rotação: acelera até um limite, sem girar instantaneamente
      if (input.lean) {
        const want = -input.lean; // esquerda (+1) levanta a frente = giro negativo
        const alpha = want * (air ? C.airTorque : C.groundTorque);
        if (want * bs.omega < C.maxSpin) addAngular(b, bs, alpha, h);
      }
      if (air) addAngular(b, bs, -bs.omega * C.airDamping, h);

      // turbo no ar: empurrão leve na direção da moto
      if (air && input.turbo) {
        const ax = b.F.x - b.R.x, ay = b.F.y - b.R.y, al = Math.hypot(ax, ay) || 1;
        for (const p of parts) { p.vx += (ax / al) * E.airTurboAccel * h; p.vy += (ay / al) * E.airTurboAccel * h; }
      }

      // previsão das posições
      for (const p of parts) {
        p.ovx = p.vx; p.ovy = p.vy;
        p.sx = p.x; p.sy = p.y;
        p.x += p.vx * h; p.y += p.vy * h;
      }

      // restrições: corpo rígido, braços das rodas e molas
      for (let it = 0; it < 2; it++) for (const c of b.rigid) solveLink(c, h);
      for (const c of b.arms) solveLink(c, h);
      for (const c of b.springs) solveLink(c, h);
      for (const c of b.arms) solveLink(c, h);

      // contato com o terreno (posição)
      for (const p of parts) {
        const c = nearest(T, p.x, p.y, p.r);
        if (c.d < p.r) {
          const corr = p.r - c.d;
          p.x += c.nx * corr; p.y += c.ny * corr;
          p.contact = true; p.nx = c.nx; p.ny = c.ny;
          p.jn = p.m * corr / h; // impulso normal equivalente neste subpasso
        } else {
          p.contact = false; p.jn = 0;
        }
        if (p.x < 12) { p.x = 12; if (p.vx < 0) p.vx = 0; }
      }

      // velocidades a partir das posições
      for (const p of parts) { p.vx = (p.x - p.sx) / h; p.vy = (p.y - p.sy) / h; }

      // amortecimento das molas
      for (const c of b.springs) dampLink(c, h);

      // resposta de contato: quique, atrito, tração e freio
      for (const p of parts) {
        if (!p.contact) continue;
        const nx = p.nx, ny = p.ny, tx = -ny, ty = nx;
        const vnPre = p.ovx * nx + p.ovy * ny;          // antes da correção (negativo = indo contra o chão)
        const vn = p.vx * nx + p.vy * ny;
        const e = p.kind === 'wheel' ? P.restitution : P.bodyRestitution;
        const vnTarget = vnPre < -60 ? -e * vnPre : 0;
        const dvn = vnTarget - vn;
        p.vx += nx * dvn; p.vy += ny * dvn;
        const impact = Math.max(0, -vnPre);
        const jn = Math.max(p.jn, p.m * impact);
        let vt = p.vx * tx + p.vy * ty;

        if (p.kind === 'wheel') {
          anyWheel = true;
          const isRear = p === b.R;
          if (isRear) { groundedR = true; if (impact > b.impactR) b.impactR = impact; }
          else { groundedF = true; if (impact > b.impactF) b.impactF = impact; }
          const gripMax = P.tireGrip * jn;
          let jt = 0;
          if (isRear && input.throttle) {
            const vmax = input.turbo ? E.turboMaxSpeed : E.maxSpeed;
            const acc = input.turbo ? E.turboAccel : E.accel;
            const force = acc * M * Math.max(0, 1 - Math.max(0, vt) / vmax);
            jt = force * h;
            if (jt > gripMax) { jt = gripMax; b.slipping = true; }
          } else if (input.brake) {
            const share = isRear ? 0.4 : 0.6;
            const brakeJ = Math.min(P.brakeDecel * M * share * h, gripMax, p.m * Math.abs(vt));
            if (vt > 8) jt = -brakeJ;                                   // freando para a frente
            else if (vt < -E.reverseMaxSpeed * 1.1) jt = brakeJ;        // descendo de ré rápido demais: segura
            else if (isRear) {
              // parado ou quase: o freio vira ré, até a velocidade máxima de ré
              const force = E.reverseAccel * M * Math.max(0, 1 - Math.max(0, -vt) / E.reverseMaxSpeed);
              jt = -Math.min(force * h, gripMax);
            }
          }
          // resistência ao rolamento
          const rr = Math.min(P.rollingResistance * jn, p.m * Math.abs(vt + jt * p.w));
          jt -= Math.sign(vt + jt * p.w) * rr;
          p.vx += tx * jt * p.w; p.vy += ty * jt * p.w;
        } else {
          // partes do corpo raspando no chão: atrito de Coulomb
          const jf = Math.min(P.bodyFriction * jn, p.m * Math.abs(vt));
          p.vx -= tx * Math.sign(vt) * jf * p.w; p.vy -= ty * Math.sign(vt) * jf * p.w;
          if (p.kind === 'rider') b.riderHit = true;
        }
      }
    }

    // estado derivado para o jogo e o desenho
    b.gR = groundedR || b.R.contact;
    b.gF = groundedF || b.F.contact;
    const ux = b.Cf.x - b.Cr.x, uy = b.Cf.y - b.Cr.y, ul = Math.hypot(ux, uy);
    const [hx, hy] = b.headLocal;
    b.H.x = b.P.x + (ux * hx - uy * hy) / ul;
    b.H.y = b.P.y + (uy * hx + ux * hy) / ul;
    const hc = nearest(T, b.H.x, b.H.y, P.crash.headRadius);
    b.headHit = hc.d < P.crash.headRadius + 0.5;

    // velocidade ao longo do chão (roda traseira) e giro das rodas
    const R = P.wheelRadius;
    const vtOf = (p) => (p.contact ? p.vx * -p.ny + p.vy * p.nx : p.vx);
    const vR = vtOf(b.R), vF = vtOf(b.F);
    b.speed = vR;
    b.vt = vR / 120;
    if (b.gR) b.wR = vR / R + (b.slipping ? 9 : 0);
    else b.wR += ((input.throttle ? E.maxSpeed / R : 0) - b.wR) * Math.min(1, dt * (input.throttle ? 3 : 0.4));
    if (b.gF) b.wF = vF / R;
    else b.wF *= 1 - Math.min(1, dt * 0.4);
    b.spinR += b.wR * dt;
    b.spinF += b.wF * dt;

    // compressão da suspensão (0 = repouso, 1 = fim de curso)
    const comp = (c) => (c.L0 - Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y)) / (c.L0 - c.min);
    b.suspR = comp(b.shockR); b.suspF = comp(b.shockF);
    b.susp = (b.suspR + b.suspF) / 2;
    b.omega = computeBody(b).omega;

    // pouso: primeira roda a tocar depois de um voo
    const nowAir = !b.gR && !b.gF;
    if (wasAir && !nowAir && anyWheel) {
      b.touchdown = true;
      b.touchdownImpact = Math.max(b.impactR, b.impactF);
      const ref = b.gR ? b.R : b.F;
      // "para cima" da moto: perpendicular à linha das rodas, do lado do piloto
      const dx = b.F.x - b.R.x, dy = b.F.y - b.R.y, dl = Math.hypot(dx, dy) || 1;
      const upX = dy / dl, upY = -dx / dl;
      // a normal do chão aponta para fora; moto alinhada com o chão dá ângulo 0
      b.landingMismatch = Math.acos(Math.max(-1, Math.min(1, upX * ref.nx + upY * ref.ny)));
    }
    return b;
  }

  // Avalia se a moto caiu: cabeça ou corpo do piloto no chão, impacto forte ou pouso muito torto
  function crashCheck(b) {
    const P = b.cfg;
    const Cc = P.crash;
    if (b.headHit) return 'cabeça';
    if (b.riderHit) return 'corpo';
    if (Math.max(b.impactR, b.impactF) > Cc.hardLanding) return 'impacto';
    if (b.touchdown && b.touchdownImpact > Cc.badLandingSpeed && b.landingMismatch > Cc.badLandingAngle) return 'pouso';
    return null;
  }

  // Vista interpolada entre os dois últimos passos fixos, só para desenho e câmera
  function view(b, alpha) {
    const v = b.view || (b.view = { R: {}, F: {}, H: {} });
    const lerpP = (dst, p) => {
      dst.x = p.px + (p.x - p.px) * alpha; dst.y = p.py + (p.y - p.py) * alpha;
      dst.px = p.px; dst.py = p.py;
    };
    lerpP(v.R, b.R); lerpP(v.F, b.F); lerpP(v.H, b.H);
    v.spinR = b.prevSpinR + (b.spinR - b.prevSpinR) * alpha;
    v.spinF = b.prevSpinF + (b.spinF - b.prevSpinF) * alpha;
    v.gR = b.gR; v.gF = b.gF; v.vt = b.vt; v.kind = b.kind;
    v.susp = b.susp; v.suspR = b.suspR; v.suspF = b.suspF;
    return v;
  }

  S.Physics = { PHYS, VEHICLES, createBike, step, crashCheck, view, nearest, groundY };
})();
