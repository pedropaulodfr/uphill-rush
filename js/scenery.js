// Desenho do cenário: céu, camadas de parallax, terreno, vegetação da pista, itens, primeiro plano e efeitos de tela.
(function () {
  'use strict';
  const S = window.Serra;
  const { canvas, css, mix, TAU } = S.util;
  const W = 960, H = 540;
  const Sc = (S.Scenery = {});

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  // ---------- Recursos estáticos (gerados uma vez) ----------
  let vignette = null, glowGold = null, glowBlue = null, glowWhite = null;
  function glow(rgb) {
    const c = canvas(128, 128), x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, `rgba(${rgb},0.9)`); g.addColorStop(0.35, `rgba(${rgb},0.35)`); g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return c;
  }
  function initStatic() {
    if (vignette) return;
    vignette = canvas(W, H);
    const x = vignette.getContext('2d');
    const g = x.createRadialGradient(W / 2, H * 0.48, H * 0.35, W / 2, H * 0.5, H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,6,0,0.42)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    glowGold = glow('255,214,90');
    glowBlue = glow('80,200,255');
    glowWhite = glow('255,255,255');
  }

  // Deslocamento vertical do parallax: camadas distantes sobem/descem menos que a pista
  const vOff = (cam, f) => clamp((-cam.y - 324) * f, -90, 170);

  // Céu noturno: estrelas que piscam, uma via láctea discreta e a lua com crateras
  function drawNightSky(ctx, art, mx, my, clock) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const band = ctx.createLinearGradient(0, 40, W, 260);
    band.addColorStop(0, 'rgba(140,150,220,0)'); band.addColorStop(0.5, 'rgba(150,160,230,0.12)'); band.addColorStop(1, 'rgba(140,150,220,0)');
    ctx.fillStyle = band;
    ctx.beginPath(); ctx.moveTo(0, 120); ctx.lineTo(W, -20); ctx.lineTo(W, 90); ctx.lineTo(0, 260); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 170; i++) {
      const x = hash(i * 3.1) * W, y = hash(i * 7.7) * H * 0.62;
      const tw = 0.55 + 0.45 * Math.sin(clock * (1 + hash(i) * 3) + i);
      const z = hash(i * 1.9) < 0.12 ? 1.8 : 1;
      ctx.fillStyle = `rgba(230,236,255,${0.25 + 0.6 * tw * (1 - y / (H * 0.7))})`;
      ctx.fillRect(x, y, z, z);
      if (z > 1 && tw > 0.85) { ctx.fillRect(x - 2, y + 0.4, 5.8, 0.6); ctx.fillRect(x + 0.4, y - 2, 0.6, 5.8); }
    }
    ctx.restore();
    const c = art.sun.join(',');
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, 170);
    g.addColorStop(0, `rgba(${c},0.45)`); g.addColorStop(0.18, `rgba(${c},0.18)`); g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, 170, 0, TAU); ctx.fill();
    const mg = ctx.createRadialGradient(mx - 6, my - 6, 2, mx, my, 22);
    mg.addColorStop(0, '#ffffff'); mg.addColorStop(1, '#c9d4ee');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, 22, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(120,135,175,0.35)';
    for (const [dx, dy, r] of [[-7, -4, 5], [6, 7, 4], [8, -8, 2.5], [-4, 10, 3], [-12, 5, 2]]) {
      ctx.beginPath(); ctx.arc(mx + dx, my + dy, r, 0, TAU); ctx.fill();
    }
  }

  // ---------- Camada 1: céu, sol e nuvens ----------
  Sc.drawSky = (ctx, A, cam, clock) => {
    initStatic();
    const art = A.art, sun = art.sun.join(',');
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.78);
    g.addColorStop(0, art.sky[0]); g.addColorStop(0.55, art.sky[1]); g.addColorStop(1, art.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const sx = 712, sy = 78 + vOff(cam, 0.02);
    if (art.night) drawNightSky(ctx, art, sx, sy, clock);
    else {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(sx, sy);
    ctx.rotate(clock * 0.015);
    for (let i = 0; i < 14; i++) {
      ctx.rotate(TAU / 14);
      const len = 520 + hash(i) * 260, wd = 24 + hash(i + 4) * 40;
      const rg = ctx.createLinearGradient(0, 0, len, 0);
      rg.addColorStop(0, `rgba(${sun},${0.07 + 0.03 * Math.sin(clock * 0.6 + i)})`);
      rg.addColorStop(1, `rgba(${sun},0)`);
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, -wd); ctx.lineTo(len, wd); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 230);
    sg.addColorStop(0, `rgba(${sun},1)`); sg.addColorStop(0.1, `rgba(${sun},0.85)`);
    sg.addColorStop(0.3, `rgba(${sun},0.28)`); sg.addColorStop(1, `rgba(${sun},0)`);
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 230, 0, TAU); ctx.fill();
    ctx.fillStyle = art.sunCore || '#ffffff'; ctx.beginPath(); ctx.arc(sx, sy, 24, 0, TAU); ctx.fill();
    }

    const cl = A.clouds, span = W + 760;
    for (let i = 0; i < 8; i++) {
      const c = cl[i % cl.length];
      const s = 0.6 + hash(i + 5) * 0.8;
      const x = ((hash(i) * span - cam.x * (0.02 + i * 0.004) - clock * (4 + i * 1.3)) % span + span) % span - 380;
      const y = 18 + hash(i + 3) * 150 + vOff(cam, 0.03);
      ctx.globalAlpha = 0.75 + hash(i + 8) * 0.25;
      ctx.drawImage(c.c, x, y, c.w * s, c.h * s);
    }
    ctx.globalAlpha = 1;
  };

  // ---------- Camadas 2 a 5: montanhas, mata distante e colinas ----------
  function strip(ctx, st, par, y0, cam, vf) {
    const y = Math.round(y0 + vOff(cam, vf));
    const off = -(((cam.x * par) % st.w) + st.w) % st.w;
    const x0 = Math.floor(off);
    ctx.drawImage(st.c, x0, y);
    if (x0 + st.w < W) ctx.drawImage(st.c, x0 + st.w - 1, y);
    if (y + st.h < H) { ctx.fillStyle = st.bottom; ctx.fillRect(0, y + st.h - 1, W, H - y - st.h + 1); }
    return y;
  }
  function mist(ctx, y, h, col, a) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, css(col, 0)); g.addColorStop(0.6, css(col, a)); g.addColorStop(1, css(col, 0));
    ctx.fillStyle = g; ctx.fillRect(0, y, W, h);
  }
  Sc.drawLayers = (ctx, A, cam) => {
    const art = A.art;
    const yf = strip(ctx, A.far, 0.05, 16, cam, 0.03);
    mist(ctx, yf + 200, 150, art.far.haze, 0.45);
    const ym = strip(ctx, A.mid, 0.13, 112, cam, 0.07);
    mist(ctx, ym + 180, 140, art.mid.haze, 0.35);
    strip(ctx, A.treeLine, 0.28, 238, cam, 0.13);
    strip(ctx, A.hills, 0.52, 286, cam, 0.22);
  };

  // ---------- Camada 6: vegetação da pista (atrás do terreno) ----------
  Sc.drawTrackDecor = (ctx, T, A, cam) => {
    for (const d of T.decor) {
      if (d.x < cam.x - 160 || d.x > cam.x + W + 160) continue;
      const arr = A.decor[d.type] || A.decor.bush || A.decor.rock;
      const sp = arr[Math.floor(d.v * arr.length) % arr.length];
      const sc = d.s;
      const y = T.groundY(d.x) + 7;
      ctx.drawImage(sp.c, d.x - sp.ax * sc, y - sp.ay * sc, sp.w * sc, sp.h * sc);
    }
  };

  // ---------- Camada 6: terreno ----------
  const patterns = new WeakMap();
  Sc.drawTerrain = (ctx, T, A, cam) => {
    const art = A.art, ys = T.ys, SEG = T.SEG;
    const i0 = Math.max(0, Math.floor(cam.x / SEG) - 2);
    const i1 = Math.min(T.n - 1, Math.ceil((cam.x + W) / SEG) + 2);
    const bottom = cam.y + H + 80;
    let pat = patterns.get(A);
    if (!pat) { pat = ctx.createPattern(A.dirt, 'repeat'); patterns.set(A, pat); }

    const surf = (dy) => { ctx.beginPath(); for (let i = i0; i <= i1; i++) ctx.lineTo(i * SEG, ys[i] + dy); };

    ctx.beginPath();
    ctx.moveTo(i0 * SEG, bottom);
    for (let i = i0; i <= i1; i++) ctx.lineTo(i * SEG, ys[i]);
    ctx.lineTo(i1 * SEG, bottom);
    ctx.closePath();
    ctx.fillStyle = pat;
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // camadas de solo: escurecem com a profundidade
    surf(300); ctx.strokeStyle = css(art.dirt.deep, 0.55); ctx.lineWidth = 420; ctx.stroke();
    surf(130); ctx.strokeStyle = css(art.dirt.dark, 0.35); ctx.lineWidth = 90; ctx.stroke();
    surf(70); ctx.strokeStyle = css(art.dirt.light, 0.12); ctx.lineWidth = 18; ctx.stroke();
    surf(95); ctx.strokeStyle = css(art.dirt.dark, 0.25); ctx.lineWidth = 6; ctx.stroke();
    surf(16); ctx.strokeStyle = css(art.dirt.top, 0.75); ctx.lineWidth = 26; ctx.stroke();

    // luz conforme a inclinação de cada trecho (sol à direita)
    for (let i = i0; i < i1; i++) {
      const s = (ys[i + 1] - ys[i]) / SEG;
      const a = s > 0 ? Math.min(0.11, s * 0.3) : Math.min(0.18, -s * 0.3);
      if (a < 0.02) continue;
      ctx.fillStyle = s > 0 ? `rgba(255,240,200,${a})` : `rgba(0,0,0,${a})`;
      ctx.beginPath();
      ctx.moveTo(i * SEG, ys[i]); ctx.lineTo((i + 1) * SEG, ys[i + 1]);
      ctx.lineTo((i + 1) * SEG, ys[i + 1] + 60); ctx.lineTo(i * SEG, ys[i] + 60);
      ctx.fill();
    }

    // pedras enterradas
    for (let i = i0; i <= i1; i++) {
      if (hash(i * 3.1) < 0.8) continue;
      const sp = A.stones[Math.floor(hash(i * 5.7) * A.stones.length)];
      const sc = 0.8 + hash(i * 1.3) * 0.9;
      const x = i * SEG + hash(i + 0.4) * SEG, y = ys[i] + 26 + hash(i * 2.3) * 110;
      ctx.drawImage(sp.c, x - sp.ax * sc, y - sp.ay * sc, sp.w * sc, sp.h * sc);
    }
    // raízes sob as árvores
    ctx.strokeStyle = css(art.trunk[0], 0.45);
    for (const d of T.decor) {
      if (d.x < cam.x - 80 || d.x > cam.x + W + 80) continue;
      if (!/oak|poplar|pine|deadtree/.test(d.type)) continue;
      const gy = T.groundY(d.x);
      for (let k = 0; k < 4; k++) {
        const dir = k % 2 ? 1 : -1, len = (12 + hash(d.x + k) * 18) * d.s;
        ctx.lineWidth = 2.2 - k * 0.35;
        ctx.beginPath(); ctx.moveTo(d.x + dir * 2, gy + 10);
        ctx.bezierCurveTo(d.x + dir * len * 0.3, gy + 16, d.x + dir * len * 0.7, gy + 14 + len * 0.5, d.x + dir * len, gy + 22 + len * 0.8);
        ctx.stroke();
      }
    }
    // rachaduras com lava brilhando no solo vulcânico
    if (art.lavaCracks) {
      const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 380);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = i0; i <= i1; i++) {
        if (hash(i * 5.3) < 0.86) continue;
        let x = i * SEG + hash(i) * SEG, y = ys[i] + 30 + hash(i * 1.7) * 90;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 5; k++) { x += 6 + hash(i * 3 + k) * 10; y += (hash(i * 7 + k) - 0.5) * 12; ctx.lineTo(x, y); }
        ctx.strokeStyle = `rgba(255,90,20,${0.35 * pulse})`; ctx.lineWidth = 6; ctx.stroke();
        ctx.strokeStyle = `rgba(255,190,80,${0.9 * pulse})`; ctx.lineWidth = 1.6; ctx.stroke();
      }
      ctx.restore();
    }
    // sombra sob a borda da grama
    surf(13); ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 8; ctx.stroke();
    ctx.restore();

    // borda superior: grama, capim seco ou neve
    surf(4); ctx.strokeStyle = art.lip; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.stroke();
    surf(1); ctx.strokeStyle = art.grass[1]; ctx.lineWidth = 6; ctx.stroke();
    surf(-1); ctx.strokeStyle = art.grass[2]; ctx.lineWidth = 2; ctx.stroke();

    if (art.snowy) {
      // manto de neve: espessura irregular, sombra azulada embaixo, montinhos, pingentes de gelo e cintilação
      const depthAt = (i) => 13 + hash(i * 0.71) * 6 + Math.sin(i * 0.35) * 3;
      ctx.beginPath();
      ctx.moveTo(i0 * SEG, ys[i0] - 2);
      for (let i = i0; i <= i1; i++) ctx.lineTo(i * SEG, ys[i] - 2 - (hash(i * 2.9) > 0.8 ? 2.5 : 0));
      for (let i = i1; i >= i0; i--) ctx.lineTo(i * SEG, ys[i] + depthAt(i));
      ctx.closePath();
      ctx.fillStyle = '#f4f8ff'; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.lineJoin = 'round';
      ctx.beginPath(); for (let i = i0; i <= i1; i++) ctx.lineTo(i * SEG, ys[i] + depthAt(i) - 2);
      ctx.strokeStyle = 'rgba(120,150,205,0.55)'; ctx.lineWidth = 7; ctx.stroke();
      surf(-1); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.stroke();
      ctx.restore();
      ctx.beginPath(); for (let i = i0; i <= i1; i++) ctx.lineTo(i * SEG, ys[i] + depthAt(i));
      ctx.strokeStyle = 'rgba(40,60,100,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
      // montinhos de neve acumulada
      for (let i = i0; i <= i1; i++) {
        if (hash(i * 2.9) < 0.72) continue;
        const ang = Math.atan2(ys[i + 1] - ys[i], SEG), rx = 9 + hash(i) * 12, ry = 3 + hash(i + 2) * 2.5;
        const cx = i * SEG + 8, cy = ys[i] - 1;
        const g = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
        g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c9d7ef');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, ang, Math.PI, TAU); ctx.fill();
      }
      // pingentes de gelo pendurados na borda do manto
      ctx.beginPath();
      for (let i = i0; i < i1; i++) {
        if (hash(i * 4.3) < 0.45) continue;
        for (let k = 0; k < 3; k++) {
          if (hash(i * 9 + k) < 0.35) continue;
          const x = i * SEG + (k + 0.5) * (SEG / 3);
          const y = ys[i] + (ys[i + 1] - ys[i]) * ((x - i * SEG) / SEG) + depthAt(i) - 1;
          const l = 4 + hash(i * 11 + k) * 11;
          ctx.moveTo(x - 1.6, y); ctx.lineTo(x, y + l); ctx.lineTo(x + 1.6, y);
        }
      }
      const ig = ctx.createLinearGradient(0, cam.y, 0, cam.y + H);
      ig.addColorStop(0, 'rgba(225,240,255,0.95)'); ig.addColorStop(1, 'rgba(170,205,245,0.95)');
      ctx.fillStyle = ig; ctx.fill();
      // cintilação do gelo
      const tw = performance.now() / 1000;
      ctx.fillStyle = '#ffffff';
      for (let i = i0; i <= i1; i++) {
        if (hash(i * 7.7) < 0.62) continue;
        const k = Math.sin(tw * 3 + i * 1.7);
        if (k < 0.55) continue;
        const z = (k - 0.55) * 7, x = i * SEG + hash(i) * SEG, y = ys[i] + 2 + hash(i * 3.3) * 8;
        ctx.fillRect(x - z, y - 0.5, z * 2, 1); ctx.fillRect(x - 0.5, y - z, 1, z * 2);
      }
    } else {
      // fiapos de grama pendurados na borda
      ctx.fillStyle = art.lip;
      ctx.beginPath();
      for (let i = i0; i < i1; i++) {
        for (let k = 0; k < 3; k++) {
          const x = i * SEG + (k + hash(i * 3 + k)) * (SEG / 3);
          const y = ys[i] + (ys[i + 1] - ys[i]) * ((x - i * SEG) / SEG) + 8;
          const l = 3 + hash(i * 7 + k) * 7;
          ctx.moveTo(x - 1.6, y); ctx.lineTo(x + 0.4, y + l); ctx.lineTo(x + 1.8, y);
        }
      }
      ctx.fill();
      // lâminas de grama em três tons
      const sparse = art === S.ART.canyon || art.sparseGrass;
      for (let tone = 0; tone < 3; tone++) {
        ctx.fillStyle = tone === 2 ? art.tips : art.grass[tone];
        ctx.beginPath();
        for (let i = i0; i < i1; i++) {
          const n = sparse ? 4 : 9;
          for (let k = 0; k < n; k++) {
            const hk = hash(i * 13 + k);
            if (Math.floor(hk * 3) !== tone) continue;
            const x = i * SEG + (k + hash(i * 17 + k)) * (SEG / n);
            const y = ys[i] + (ys[i + 1] - ys[i]) * ((x - i * SEG) / SEG) + 1;
            const h = (sparse ? 6 : 4) + hash(i * 19 + k) * (sparse ? 12 : 9);
            const lean = (hash(i * 23 + k) - 0.5) * 6;
            ctx.moveTo(x - 1.3, y); ctx.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h); ctx.lineTo(x + 1.3, y);
          }
        }
        ctx.fill();
      }
    }
  };

  // Touceiras e flores junto à pista (na frente da borda)
  Sc.drawTrackEdge = (ctx, T, A, cam) => {
    const SEG = T.SEG;
    const i0 = Math.max(0, Math.floor(cam.x / SEG) - 2);
    const i1 = Math.min(T.n - 2, Math.ceil((cam.x + W) / SEG) + 2);
    for (let i = i0; i <= i1; i++) {
      if (hash(i * 1.7) < 0.8) continue;
      const sp = A.clumps[Math.floor(hash(i * 4.1) * A.clumps.length)];
      const sc = 0.7 + hash(i * 2.2) * 0.6;
      const x = i * SEG + hash(i) * SEG;
      ctx.drawImage(sp.c, x - sp.ax * sc, T.groundY(x) + 4 - sp.ay * sc, sp.w * sc, sp.h * sc);
    }
  };

  // ---------- Itens ----------
  function starPath(ctx, R, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }

  Sc.drawItems = (ctx, T, clock, cam) => {
    initStatic();
    for (const s of T.stars) {
      if (s.got || s.x < cam.x - 60 || s.x > cam.x + W + 60) continue;
      const y = s.y + Math.sin(clock * 3 + s.ph) * 4;
      const spin = Math.cos(clock * 2.4 + s.ph);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.65 + 0.2 * Math.sin(clock * 5 + s.ph);
      ctx.drawImage(glowGold, s.x - 38, y - 38, 76, 76);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.translate(s.x, y);
      ctx.scale(0.3 + 0.7 * Math.abs(spin), 1);
      const g = ctx.createRadialGradient(-3, -4, 1, 0, 0, 17);
      g.addColorStop(0, '#fffbd0'); g.addColorStop(0.45, '#ffcf2e'); g.addColorStop(1, '#e88a00');
      starPath(ctx, 16, 7);
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#a65a00'; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * TAU) / 5;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 13, Math.sin(a) * 13); ctx.stroke();
      }
      ctx.restore();
      const tw = (clock * 1.7 + s.ph) % 2;
      if (tw < 0.5) {
        const k = Math.sin((tw / 0.5) * Math.PI) * 6;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(s.x + 8 - k, y - 9, k * 2, 1.2);
        ctx.fillRect(s.x + 8 - 0.6, y - 9 - k, 1.2, k * 2);
      }
    }
    for (const tb of T.turbos) {
      if (tb.got || tb.x < cam.x - 60 || tb.x > cam.x + W + 60) continue;
      const y = tb.y + Math.sin(clock * 3.4 + tb.ph) * 4;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.7;
      ctx.drawImage(glowBlue, tb.x - 40, y - 40, 80, 80);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      const pr = 19 + Math.sin(clock * 6 + tb.ph) * 3;
      ctx.strokeStyle = 'rgba(150,230,255,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tb.x, y, pr, 0, TAU); ctx.stroke();
      ctx.save();
      ctx.translate(tb.x, y);
      ctx.rotate(Math.sin(clock * 2 + tb.ph) * 0.15);
      const g = ctx.createLinearGradient(-9, 0, 9, 0);
      g.addColorStop(0, '#0b4f9c'); g.addColorStop(0.45, '#39b6ff'); g.addColorStop(0.7, '#9fe3ff'); g.addColorStop(1, '#126bc0');
      rr(ctx, -9, -13, 18, 26, 6); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#06315f'; ctx.stroke();
      const cg = ctx.createLinearGradient(-6, 0, 6, 0);
      cg.addColorStop(0, '#7f8892'); cg.addColorStop(0.5, '#f1f4f7'); cg.addColorStop(1, '#7f8892');
      rr(ctx, -6, -17, 12, 5, 2); ctx.fillStyle = cg; ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(2, -9); ctx.lineTo(-5, 2); ctx.lineTo(0, 2); ctx.lineTo(-2, 10); ctx.lineTo(5, -2); ctx.lineTo(0, -2); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    for (const cp of T.cps) {
      if (cp.x < cam.x - 80 || cp.x > cam.x + W + 80) continue;
      const gy = T.groundY(cp.x);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(cp.x, gy + 2, 14, 4, 0, 0, TAU); ctx.fill();
      const pg = ctx.createLinearGradient(cp.x - 3, 0, cp.x + 3, 0);
      pg.addColorStop(0, '#8a939e'); pg.addColorStop(0.5, '#ffffff'); pg.addColorStop(1, '#6b737d');
      ctx.fillStyle = pg; ctx.fillRect(cp.x - 2.5, gy - 96, 5, 96);
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(cp.x, gy - 97, 4, 0, TAU); ctx.fill();
      const col = cp.hit ? ['#3fd36b', '#1f8c41'] : ['#ff9a3d', '#d4561c'];
      const top = gy - 92;
      ctx.beginPath(); ctx.moveTo(cp.x + 2, top);
      for (let k = 1; k <= 8; k++) ctx.lineTo(cp.x + 2 + k * 5, top + Math.sin(clock * 7 - k * 0.7) * 2.2 * (k / 8));
      for (let k = 8; k >= 0; k--) ctx.lineTo(cp.x + 2 + k * 5, top + 24 + Math.sin(clock * 7 - k * 0.7 + 0.3) * 2.2 * (k / 8));
      ctx.closePath();
      const fg = ctx.createLinearGradient(cp.x, top, cp.x + 42, top + 24);
      fg.addColorStop(0, col[0]); fg.addColorStop(1, col[1]);
      ctx.fillStyle = fg; ctx.fill();
      if (cp.hit) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cp.x + 14, top + 12); ctx.lineTo(cp.x + 19, top + 17); ctx.lineTo(cp.x + 29, top + 6); ctx.stroke();
      }
    }
    const fx = T.finishX;
    if (fx > cam.x - 160 && fx < cam.x + W + 160) {
      const gy1 = T.groundY(fx - 56), gy2 = T.groundY(fx + 56);
      const top = Math.min(gy1, gy2) - 150;
      for (const [px, gy] of [[fx - 56, gy1], [fx + 56, gy2]]) {
        for (let k = 0; gy - k * 14 > top; k++) {
          ctx.fillStyle = k % 2 ? '#e2381f' : '#ffffff';
          ctx.fillRect(px - 4, Math.max(top, gy - (k + 1) * 14), 8, Math.min(14, gy - k * 14 - top));
        }
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(px + 1, top, 3, gy - top);
      }
      const cells = 14, cw = 112 / cells;
      for (let i = 0; i < cells; i++) {
        const wv = Math.sin(clock * 4 - i * 0.5) * 3;
        for (let j = 0; j < 3; j++) {
          ctx.fillStyle = (i + j) % 2 ? '#15171b' : '#f8f8f8';
          ctx.fillRect(fx - 56 + i * cw, top + 8 + j * 8 + wv, cw + 0.5, 8);
        }
      }
      ctx.fillStyle = '#e2381f';
      rr(ctx, fx - 40, top - 16, 80, 20, 4); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '13px "Lilita One", Impact, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('CHEGADA', fx, top - 5);
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    }
  };

  // ---------- Camada 7: plantas em primeiro plano ----------
  Sc.drawForeground = (ctx, T, A, cam) => {
    const par = 1.3, STEP = 430;
    const base = cam.x * par;
    const k0 = Math.floor((base - 260) / STEP), k1 = Math.ceil((base + W + 260) / STEP);
    for (let k = k0; k <= k1; k++) {
      if (hash(k * 0.37 + 9) < 0.35) continue;
      const fx = k * STEP + hash(k + 2) * STEP * 0.6;
      const sx = fx - base;
      const wx = cam.x + sx;
      const sp = A.fg[Math.abs(k) % A.fg.length];
      const sc = 0.85 + hash(k + 7) * 0.4;
      const gy = T.groundY(clamp(wx, 0, T.length)) - cam.y;
      const by = Math.max(gy + 120 + hash(k + 1) * 30, H - 40);
      ctx.drawImage(sp.c, sx - sp.ax * sc, by - sp.ay * sc, sp.w * sc, sp.h * sc);
    }
  };

  // ---------- Efeitos de tela: reflexo do sol, linhas de velocidade e vinheta ----------
  const streaks = [];
  for (let i = 0; i < 26; i++) streaks.push({ x: Math.random() * W, y: Math.random() * H, l: 60 + Math.random() * 120, v: 1400 + Math.random() * 900 });
  let streakAlpha = 0;

  Sc.drawScreenFX = (ctx, A, cam, dt, turbo) => {
    initStatic();
    const sun = A.art.sun.join(',');
    const sx = 712, sy = 78 + vOff(cam, 0.02);
    const dx = W / 2 - sx, dy = H / 2 - sy;
    // filtro de cor do ambiente (luar azulado, brilho alaranjado do vulcão)
    if (A.art.tint) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = A.art.tint; ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'lighter';
    if (!A.art.night) {
      const flares = [[0.35, 12, 0.07], [0.62, 5, 0.12], [0.9, 24, 0.035], [1.25, 8, 0.07], [1.55, 36, 0.025]];
      for (const [t, r, a] of flares) {
        ctx.fillStyle = `rgba(${sun},${a})`;
        ctx.beginPath(); ctx.arc(sx + dx * t, sy + dy * t, r, 0, TAU); ctx.fill();
      }
    }
    streakAlpha += ((turbo ? 1 : 0) - streakAlpha) * Math.min(1, dt * 6);
    if (streakAlpha > 0.02) {
      ctx.strokeStyle = `rgba(255,255,255,${0.28 * streakAlpha})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const s of streaks) {
        s.x -= s.v * dt;
        if (s.x + s.l < 0) { s.x = W + Math.random() * 200; s.y = Math.random() * H; }
        ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + s.l, s.y);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = A.art.vignette === undefined ? 1 : A.art.vignette;
    ctx.drawImage(vignette, 0, 0);
    ctx.globalAlpha = 1;
  };

  // ---------- Clima: neve, folhas, brasas ou vaga-lumes, em profundidades com parallax ----------
  const WEATHER = {
    snow: { n: 150, near: 25 },
    leaves: { n: 70, near: 14 },
    embers: { n: 90, near: 14 },
    fireflies: { n: 46, near: 8 },
  };
  const LEAF_COLS = ['#d0601c', '#be341c', '#f0a034', '#d6a01e', '#8a3a12'];
  let wType = null, flakes = [], lastCam = null;
  const spriteCache = {};
  function softDot(rgb) {
    if (spriteCache[rgb]) return spriteCache[rgb];
    const c = canvas(32, 32), x = c.getContext('2d');
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.4, `rgba(${rgb},0.65)`); g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
    return (spriteCache[rgb] = c);
  }
  function initWeather(type) {
    wType = type; flakes = []; lastCam = null;
    const cfg = WEATHER[type];
    for (let i = 0; i < cfg.n; i++) {
      const near = i >= cfg.n - cfg.near;
      const z = near ? 1.25 + Math.random() * 0.35 : 0.35 + Math.random() * 0.6;
      flakes.push({ x: Math.random() * W, y: Math.random() * H, z, ph: Math.random() * TAU, sp: 0.7 + Math.random() * 0.6, rot: Math.random() * TAU, col: LEAF_COLS[i % LEAF_COLS.length] });
    }
  }
  Sc.drawWeather = (ctx, A, cam, dt, front) => {
    const type = A.art.weather;
    if (!type || !WEATHER[type]) return;
    if (wType !== type) initWeather(type);
    const t = performance.now() / 1000;
    if (!front) {
      const dx = lastCam ? cam.x - lastCam.x : 0, dy = lastCam ? cam.y - lastCam.y : 0;
      lastCam = { x: cam.x, y: cam.y };
      for (const f of flakes) {
        let vx, vy;
        if (type === 'snow') { vx = -18 + Math.sin(t * f.sp + f.ph) * 22; vy = 46 * f.sp; }
        else if (type === 'leaves') { vx = -40 + Math.sin(t * f.sp * 1.3 + f.ph) * 40; vy = 34 * f.sp + Math.cos(t * 2 + f.ph) * 14; f.rot += dt * (2 + f.sp * 3); }
        else if (type === 'embers') { vx = 12 + Math.sin(t * 2.2 * f.sp + f.ph) * 18; vy = -36 * f.sp; }
        else { vx = Math.sin(t * 0.7 * f.sp + f.ph) * 22; vy = Math.cos(t * 0.9 * f.sp + f.ph * 1.3) * 16; }
        f.x += -dx * f.z + vx * f.z * dt;
        f.y += -dy * f.z + vy * f.z * dt;
        if (f.x < -12) f.x += W + 24; else if (f.x > W + 12) f.x -= W + 24;
        if (f.y > H + 12) f.y -= H + 24; else if (f.y < -12) f.y += H + 24;
      }
    }
    if (type === 'embers' || type === 'fireflies') ctx.globalCompositeOperation = 'lighter';
    for (const f of flakes) {
      if ((f.z > 1.1) !== front) continue;
      const big = f.z > 1.1;
      if (type === 'snow') {
        const s = big ? 5 + f.z * 3 : 2 + f.z * 4;
        ctx.globalAlpha = big ? 0.55 : 0.5 + f.z * 0.4;
        ctx.drawImage(softDot('255,255,255'), f.x - s / 2, f.y - s / 2, s, s);
      } else if (type === 'leaves') {
        const s = big ? 5 + f.z * 2 : 2.2 + f.z * 2.6;
        ctx.globalAlpha = big ? 0.8 : 0.55 + f.z * 0.4;
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.scale(1, Math.abs(Math.cos(f.rot * 0.7)) * 0.8 + 0.2);
        ctx.fillStyle = f.col;
        ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.5, 0, 0, TAU); ctx.fill();
        ctx.restore();
      } else if (type === 'embers') {
        const fl = 0.6 + 0.4 * Math.sin(t * 9 * f.sp + f.ph);
        const s = (big ? 7 : 2.5 + f.z * 4) * (0.7 + fl * 0.4);
        ctx.globalAlpha = 0.85 * fl;
        ctx.drawImage(softDot('255,140,50'), f.x - s / 2, f.y - s / 2, s, s);
      } else {
        const glow = Math.max(0, Math.sin(t * 1.6 * f.sp + f.ph));
        if (glow < 0.05) continue;
        const s = (big ? 14 : 5 + f.z * 7) * (0.6 + glow * 0.5);
        ctx.globalAlpha = glow;
        ctx.drawImage(softDot('210,255,120'), f.x - s / 2, f.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  // Tela de carregamento: céu simples enquanto os recursos são gerados
  Sc.drawPlaceholder = (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2c78cc'); g.addColorStop(1, '#cfe9fb');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };
})();
