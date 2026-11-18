// Gera em tempo de carregamento todos os sprites, texturas e faixas de cenário (sem imagens externas).
(function () {
  'use strict';
  const S = (window.Serra = window.Serra || {});
  const TAU = Math.PI * 2;
  const SS = 2; // supersampling dos sprites para telas de alta densidade

  // ---------- Utilitários ----------
  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  const hexCache = {};
  function hex(h) {
    if (Array.isArray(h)) return h;
    if (hexCache[h]) return hexCache[h];
    const n = parseInt(h.slice(1), 16);
    return (hexCache[h] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
  }
  function mix(a, b, t) {
    a = hex(a); b = hex(b);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function css(c, a) {
    c = hex(c);
    return a === undefined
      ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
      : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  }
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

  // Ruído de valor 2D, periódico em P células (permite faixas que se repetem sem emenda)
  function makeNoise(seed, P) {
    const r = rng(seed), g = new Float32Array(P * P);
    for (let i = 0; i < g.length; i++) g[i] = r();
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      let xf = x - xi, yf = y - yi;
      xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
      const x0 = ((xi % P) + P) % P, y0 = ((yi % P) + P) % P;
      const x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
      const a = g[y0 * P + x0], b = g[y0 * P + x1], c = g[y1 * P + x0], d = g[y1 * P + x1];
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };
  }
  function fbm(n, x, y, oct) {
    let s = 0, a = 0.5, f = 1, t = 0;
    for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); t += a; a *= 0.5; f *= 2; }
    return s / t;
  }

  S.util = { rng, canvas, hex, mix, css, clamp01, smooth, makeNoise, fbm, TAU };

  // ---------- Paletas por ambiente ----------
  const ART = {
    green: {
      sky: ['#2c78cc', '#79bdee', '#e4f4ff'], sun: [255, 247, 222], cloudShade: '#b3c6dc',
      far: { seed: 11, h: 330, base: 40, amp: 250, cells: 5, lit: '#c8d3df', shadow: '#7a8da6', snow: '#f7fafd', snowShadow: '#bccbdf', snowLine: 0.6, haze: '#cfe2f2', hazeAmt: 0.28, hazeGrad: 0.5 },
      mid: { seed: 12, h: 300, base: 20, amp: 190, cells: 8, lit: '#a9b78e', shadow: '#52705a', veg: '#47783a', vegLine: 0.55, haze: '#bcd6e6', hazeAmt: 0.1, hazeGrad: 0.32 },
      treeLine: { ground: ['#5b9244', '#3c6c30'], haze: '#a9cad8', hazeAmt: 0.34 },
      hills: { top: '#7fbd52', bottom: '#467f33', speck: ['#9bd463', '#3d7a2b'], haze: '#b8d8e2', hazeAmt: 0.1 },
      dirt: { base: '#8a5a32', dark: '#5a381c', light: '#b27c46', deep: '#3a2211', top: '#4a2d16' },
      pebble: ['#a89e92', '#6b6157'],
      grass: ['#2e7a1b', '#5bae2e', '#9bd852'], tips: '#cdf284', lip: '#25601a',
      leaves: { dark: '#22501a', mid: '#44862a', light: '#7fbf45', hi: '#c6ea84' },
      trunk: ['#3b2514', '#7c5634'],
      flowers: ['#fff3a0', '#ff9eb5', '#ffffff', '#c0afff'],
      fg: { dark: '#163d11', mid: '#2e6c1f', light: '#5ea637', tip: null },
      rock: ['#8f9297', '#575b62', '#c9ccd0'], moss: '#5d8f35',
      dust: [196, 168, 128], snowy: false,
      decor: ['oak', 'poplar', 'bush', 'rock', 'grass'],
    },
    canyon: {
      sky: ['#d9663f', '#f3a96f', '#ffe7c0'], sun: [255, 236, 196], cloudShade: '#d9a98c',
      far: { seed: 21, h: 330, base: 50, amp: 250, mesa: true, layers: ['#e6ad86', '#d3946c', '#eebf98', '#c98560'], cap: '#f6d2ad', shrub: '#a9875a', shadow: '#9c5e48', haze: '#f4cba6', hazeAmt: 0.34, hazeGrad: 0.4 },
      mid: { seed: 22, h: 300, base: 26, amp: 200, mesa: true, layers: ['#e09a5f', '#c9703f', '#e8b07a', '#b85f35'], cap: '#f2c28c', shrub: '#6f6a2c', shadow: '#6e3220', haze: '#f0bf96', hazeAmt: 0.08, hazeGrad: 0.32 },
      treeLine: { ground: ['#cf9659', '#a56a3b'], haze: '#f0c39c', hazeAmt: 0.32 },
      hills: { top: '#dcaa68', bottom: '#a8713f', speck: ['#ecc283', '#94612f'], haze: '#f3c9a1', hazeAmt: 0.1 },
      dirt: { base: '#b06c3a', dark: '#78401f', light: '#d4925a', deep: '#4a2510', top: '#8a4a22' },
      pebble: ['#d1a27c', '#8a5a3c'],
      grass: ['#8a7228', '#c2a447', '#e3cf7c'], tips: '#f3e6a6', lip: '#6f5a1d',
      leaves: { dark: '#585524', mid: '#848036', light: '#b2ac58', hi: '#dbd48c' },
      trunk: ['#4a3020', '#8f6a48'],
      cactus: ['#3c6a2c', '#679a44', '#a2cb6e'],
      flowers: ['#ff6f91', '#ffd25e'],
      fg: { dark: '#5a4b17', mid: '#8f7c30', light: '#c9b257', tip: null },
      rock: ['#bb8259', '#7a4a30', '#e6b48c'], moss: null,
      dust: [214, 160, 112], snowy: false,
      decor: ['cactus', 'shrub', 'deadtree', 'rock'],
    },
    snow: {
      sky: ['#3a83dc', '#93c6f2', '#f1f8ff'], sun: [255, 251, 236], cloudShade: '#c0d0e6', weather: 'snow', vignette: 0.35,
      far: { seed: 31, h: 330, base: 30, amp: 285, cells: 6, peak: 2.8, alpine: true, lit: '#a7b3c8', shadow: '#5a6782', snow: '#fffdf8', snowShadow: '#9db2d6', snowLine: 0.42, haze: '#c9d9ee', hazeAmt: 0.24, hazeGrad: 0.5 },
      mid: { seed: 32, h: 300, base: 16, amp: 215, cells: 9, peak: 2.5, alpine: true, lit: '#98a4ba', shadow: '#4b5770', snow: '#ffffff', snowShadow: '#98aed4', snowLine: 0.5, veg: '#2b4c44', vegLine: 0.3, haze: '#bccfe8', hazeAmt: 0.08, hazeGrad: 0.3 },
      treeLine: { ground: ['#eef4fc', '#b8cae3'], haze: '#c2d4ec', hazeAmt: 0.32 },
      hills: { top: '#f7faff', bottom: '#bdcfe8', speck: ['#ffffff', '#9fb5d6'], haze: '#cddcf0', hazeAmt: 0.08 },
      dirt: { base: '#7f8a9f', dark: '#5b667c', light: '#a9b4c9', deep: '#3d4659', top: '#c9d6ea' },
      pebble: ['#c2cad8', '#6c7588'],
      grass: ['#aebfda', '#e4ecf8', '#ffffff'], tips: '#ffffff', lip: '#93a8c8',
      leaves: { dark: '#1a3a31', mid: '#2c5848', light: '#4b7d68', hi: '#8db3a1' },
      trunk: ['#3a291d', '#6b4d36'],
      flowers: null,
      fg: { dark: '#1c3d33', mid: '#33604f', light: '#5d8d7a', tip: '#ffffff' },
      rock: ['#878fa0', '#555d6e', '#c9cfda'], moss: null,
      dust: [236, 243, 252], snowy: true,
      decor: ['snowpine', 'rock', 'bush'],
    },
    autumn: {
      sky: ['#4a82c6', '#a8cbe6', '#f8e3c2'], sun: [255, 236, 200], cloudShade: '#d8c2ae', weather: 'leaves',
      far: { seed: 41, h: 330, base: 40, amp: 245, cells: 5, peak: 2.4, lit: '#bdb8cc', shadow: '#78748f', snow: '#f6f4f8', snowShadow: '#c6c1d6', snowLine: 0.72, haze: '#e6dbd6', hazeAmt: 0.32, hazeGrad: 0.45 },
      mid: { seed: 42, h: 300, base: 20, amp: 185, cells: 8, lit: '#b78f62', shadow: '#68503c', veg: '#b8572a', vegLine: 0.62, haze: '#dcc4a8', hazeAmt: 0.1, hazeGrad: 0.32 },
      treeLine: { ground: ['#a8783e', '#7a5228'], haze: '#dcc4a4', hazeAmt: 0.3 },
      hills: { top: '#c9a24e', bottom: '#86662c', speck: ['#e6c066', '#7a5620'], haze: '#e2caa6', hazeAmt: 0.1 },
      dirt: { base: '#7d4f2e', dark: '#4f301a', light: '#a8714a', deep: '#341f10', top: '#3e2614' },
      pebble: ['#ab9f92', '#6b6157'],
      grass: ['#6f6a1e', '#a89232', '#d6bc58'], tips: '#f1db8c', lip: '#55501a',
      leaves: { dark: '#86300f', mid: '#d0601c', light: '#f0a034', hi: '#ffd772' },
      leavesAlt: [
        { dark: '#701812', mid: '#be341c', light: '#e8662c', hi: '#ffb062' },
        { dark: '#86600e', mid: '#d6a01e', light: '#f4ca40', hi: '#fff0a0' },
        { dark: '#3e5a1c', mid: '#6e8a2a', light: '#a8b844', hi: '#e2e48a' },
      ],
      trunk: ['#3b2416', '#78523a'],
      flowers: null,
      fg: { dark: '#5a2a10', mid: '#a4481c', light: '#e08a3a', tip: null },
      rock: ['#929089', '#5a5852', '#cac6be'], moss: '#8a7a2e',
      dust: [192, 152, 112], snowy: false, treeCount: 300,
      decor: ['oak', 'poplar', 'bush', 'rock', 'grass'],
    },
    volcano: {
      sky: ['#24162a', '#6e2a28', '#f08638'], sun: [255, 150, 80], cloudShade: '#3a2424', cloudTop: '#8a6a64', cloudHi: '#c49080',
      weather: 'embers', tint: 'rgba(255,170,130,0.16)',
      far: { seed: 51, h: 330, base: 40, amp: 260, cells: 4, peak: 1.5, lava: true, lit: '#6e5c5e', shadow: '#2a1f25', haze: '#a05a48', hazeAmt: 0.3, hazeGrad: 0.4 },
      mid: { seed: 52, h: 300, base: 20, amp: 200, cells: 7, peak: 1.8, lava: true, lit: '#5c4a48', shadow: '#1c1517', haze: '#7e3c30', hazeAmt: 0.1, hazeGrad: 0.3 },
      treeLine: { ground: ['#3a2a28', '#221818'], haze: '#8a4636', hazeAmt: 0.3 },
      hills: { top: '#4a3a36', bottom: '#261c1a', speck: ['#6a5450', '#ff7a2a'], haze: '#7a3e32', hazeAmt: 0.1 },
      dirt: { base: '#3d3433', dark: '#231d1d', light: '#5e5352', deep: '#140f0f', top: '#2a2222' },
      pebble: ['#6a6060', '#2a2424'],
      grass: ['#3a3030', '#5a4a46', '#7a6a62'], tips: '#ff8a3a', lip: '#1e1818',
      leaves: { dark: '#2a2a1a', mid: '#4a4a2a', light: '#6a6a3a', hi: '#8a8a4a' },
      trunk: ['#1a1414', '#3e322e'],
      flowers: null,
      fg: { dark: '#1a1212', mid: '#2e2220', light: '#4a3632', tip: null },
      rock: ['#5a5050', '#2a2424', '#8a7a76'], moss: null,
      dust: [120, 100, 95], snowy: false, sparseGrass: true, lavaCracks: true, treeCount: 110,
      decor: ['deadtree', 'rock', 'shrub'],
    },
    night: {
      sky: ['#070b26', '#1e2a60', '#5a4e86'], sun: [215, 228, 255], night: true, cloudShade: '#141a3a', cloudTop: '#5a6494', cloudHi: '#9aa6d8',
      weather: 'fireflies', tint: 'rgba(70,85,170,0.22)',
      far: { seed: 61, h: 330, base: 40, amp: 270, cells: 6, peak: 2.6, alpine: true, lit: '#4e5a86', shadow: '#1c2240', snow: '#cad6f2', snowShadow: '#6a78aa', snowLine: 0.55, haze: '#2c3866', hazeAmt: 0.3, hazeGrad: 0.45 },
      mid: { seed: 62, h: 300, base: 20, amp: 195, cells: 8, lit: '#3a4668', shadow: '#121830', veg: '#14223a', vegLine: 0.52, haze: '#222e58', hazeAmt: 0.1, hazeGrad: 0.3 },
      treeLine: { ground: ['#1a2840', '#0e1626'], haze: '#22305a', hazeAmt: 0.3 },
      hills: { top: '#22385a', bottom: '#101a30', speck: ['#2e4a70', '#0a1222'], haze: '#1e2a50', hazeAmt: 0.1 },
      dirt: { base: '#3a3550', dark: '#221e34', light: '#56507a', deep: '#120f1e', top: '#1a1628' },
      pebble: ['#7a7896', '#2e2c40'],
      grass: ['#1c4636', '#2c664c', '#46886a'], tips: '#8ad0a8', lip: '#102c22',
      leaves: { dark: '#0c2620', mid: '#1c4638', light: '#2c6650', hi: '#58967a' },
      trunk: ['#140f16', '#2e2430'],
      flowers: ['#ffe58a', '#b8f0ff'],
      fg: { dark: '#06120e', mid: '#0e2a20', light: '#1e4a38', tip: null },
      rock: ['#4a4e66', '#22263a', '#7a80a0'], moss: null,
      dust: [120, 120, 150], snowy: false, treeCount: 280,
      decor: ['pine', 'oak', 'bush', 'rock', 'grass'],
    },
  };
  S.ART = ART;

  // Ambientes derivados: partem de um ambiente existente (kit = vegetação e detalhes usados)
  // e trocam só as cores e o clima
  function derive(from, over) {
    const out = Array.isArray(from) ? from.slice() : Object.assign({}, from);
    for (const k in over) {
      const v = over[k];
      out[k] = v && typeof v === 'object' && !Array.isArray(v) && from[k] && typeof from[k] === 'object' ? derive(from[k], v) : v;
    }
    return out;
  }
  ART.dunes = derive(ART.canyon, {
    kit: 'canyon',
    sky: ['#3f8fd6', '#9fd2f2', '#fff3d6'], sun: [255, 246, 214], cloudShade: '#e2c8a4',
    far: { seed: 71, layers: ['#f0cf9c', '#e2b980', '#f6dcae', '#d9a96c'], cap: '#fbe6c2', shadow: '#b98a5a', haze: '#f6e2c0' },
    mid: { seed: 72, layers: ['#ecbf7c', '#d99c56', '#f2cf92', '#c98848'], cap: '#f8dca6', shadow: '#94592e', haze: '#f2d6aa' },
    treeLine: { ground: ['#e8c084', '#c8955a'], haze: '#f4dcb4' },
    hills: { top: '#f2d08e', bottom: '#cf9a58', speck: ['#fae0a8', '#b47c40'], haze: '#f6e0b8' },
    dirt: { base: '#d09a5c', dark: '#a06a36', light: '#eec088', deep: '#6a4020', top: '#b47838' },
    grass: ['#a08a3a', '#cfb45e', '#ecd88e'], tips: '#fbeebc', lip: '#86702a',
    dust: [236, 200, 150], sparseGrass: true, treeCount: 70,
  });
  ART.swamp = derive(ART.green, {
    kit: 'green',
    sky: ['#3c5a5e', '#88a8a0', '#d6e2c8'], sun: [240, 246, 220], cloudShade: '#7e948e',
    weather: 'fireflies', tint: 'rgba(60,100,80,0.16)', vignette: 0.45,
    far: { seed: 81, lit: '#8ea49e', shadow: '#4e6662', snow: '#c8d8d0', snowShadow: '#8aa29a', snowLine: 0.85, haze: '#a8bcb2', hazeAmt: 0.4 },
    mid: { seed: 82, lit: '#6e8a6a', shadow: '#2e4a3c', veg: '#2a4a30', vegLine: 0.7, haze: '#96ae9e', hazeAmt: 0.16 },
    treeLine: { ground: ['#3e6440', '#24402a'], haze: '#90aa98' },
    hills: { top: '#56804a', bottom: '#2c4a2c', speck: ['#6c9a54', '#22401e'], haze: '#9ab4a0' },
    dirt: { base: '#5a4630', dark: '#3a2c1c', light: '#7a6244', deep: '#1e160c', top: '#2e2414' },
    grass: ['#2a5a26', '#4a8034', '#7aaa4a'], tips: '#b4d47a', lip: '#1c4018',
    leaves: { dark: '#1a3a1c', mid: '#2e5a2a', light: '#52803e', hi: '#8eb468' },
    fg: { dark: '#0e2a14', mid: '#1e4a24', light: '#3e7a3a', tip: null },
    dust: [150, 140, 110], treeCount: 320,
  });
  ART.glacier = derive(ART.snow, {
    kit: 'snow',
    sky: ['#34418c', '#b28ccc', '#ffd8c8'], sun: [255, 226, 210], cloudShade: '#b8a8d0', vignette: 0.3,
    far: { seed: 91, lit: '#b6a8cc', shadow: '#5a5a8a', snow: '#fff6f4', snowShadow: '#a8a4d4', haze: '#d6c4e0' },
    mid: { seed: 92, lit: '#9a9ec4', shadow: '#464c7a', snow: '#ffffff', snowShadow: '#a4aedc', veg: '#2c3e5a', haze: '#c4bcdc' },
    treeLine: { ground: ['#eef0fc', '#b8bee6'], haze: '#ccc4e4' },
    hills: { top: '#f8f8ff', bottom: '#c2c6ea', speck: ['#ffffff', '#a4a8d8'], haze: '#d8d0ec' },
    dirt: { base: '#6e86b0', dark: '#4e6490', light: '#9ab4dc', deep: '#2e3c62', top: '#c4d8f2' },
    dust: [236, 240, 255],
  });
  ART.sunset = derive(ART.autumn, {
    kit: 'autumn',
    sky: ['#2e2a6a', '#d8607e', '#ffc46a'], sun: [255, 214, 150], cloudShade: '#8a4a6a', cloudTop: '#f0a080', cloudHi: '#ffd6a0',
    tint: 'rgba(255,140,90,0.14)',
    far: { seed: 101, lit: '#b07a9a', shadow: '#4a3060', snow: '#ffd8c4', snowShadow: '#c08aa8', haze: '#d88a8a', hazeAmt: 0.36 },
    mid: { seed: 102, lit: '#a0604e', shadow: '#40263a', veg: '#7a3a2a', haze: '#c47870', hazeAmt: 0.14 },
    treeLine: { ground: ['#7a4a3a', '#4a2a2a'], haze: '#c08070' },
    hills: { top: '#b0784a', bottom: '#6a3e2a', speck: ['#d09a5a', '#5a301e'], haze: '#d09078' },
  });

  // ---------- Base dos sprites ----------
  function sprite(w, h, draw, ax, ay) {
    const c = canvas(w * SS, h * SS), x = c.getContext('2d');
    x.scale(SS, SS);
    draw(x, w, h);
    return { c, w, h, ax: ax === undefined ? w / 2 : ax, ay: ay === undefined ? h : ay };
  }
  function layerCanvas(w, h) {
    const c = canvas(w * SS, h * SS), x = c.getContext('2d');
    x.scale(SS, SS);
    return [c, x];
  }
  function atop(x, fn) {
    x.save(); x.globalCompositeOperation = 'source-atop'; fn(); x.restore();
  }

  // Bola de folhagem com borda recortada
  function leafBall(x, bx, by, br, r) {
    x.beginPath();
    const k = 16;
    for (let i = 0; i <= k; i++) {
      const a = (i / k) * TAU, rr = br * (0.86 + r() * 0.2);
      x.lineTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr);
    }
    x.fill();
    for (let i = 0; i < 12; i++) {
      const a = r() * TAU;
      x.beginPath();
      x.arc(bx + Math.cos(a) * br * 0.95, by + Math.sin(a) * br * 0.95, br * (0.1 + r() * 0.12), 0, TAU);
      x.fill();
    }
  }

  // Copa com volume: aglomerados, luz vinda do alto à direita, sombra embaixo à esquerda e folhas soltas
  function canopy(x, cx, cy, rx, ry, L, r, n) {
    const blobs = [];
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = Math.sqrt(r());
      const br = (0.24 + r() * 0.2) * Math.min(rx, ry) * (1.15 - d * 0.3);
      blobs.push([cx + Math.cos(a) * rx * d * 0.74, cy + Math.sin(a) * ry * d * 0.74, br]);
    }
    blobs.sort((a, b) => b[1] - a[1]);
    x.fillStyle = L.mid;
    for (const [bx, by, br] of blobs) leafBall(x, bx, by, br, r);
    atop(x, () => {
      const g = x.createLinearGradient(cx + rx, cy - ry, cx - rx * 0.8, cy + ry);
      g.addColorStop(0, L.hi); g.addColorStop(0.28, L.light); g.addColorStop(0.62, L.mid); g.addColorStop(1, L.dark);
      x.globalAlpha = 0.85; x.fillStyle = g; x.fillRect(cx - rx * 1.6, cy - ry * 1.6, rx * 3.2, ry * 3.2);
      for (const [bx, by, br] of blobs) {
        x.globalAlpha = 0.42; x.fillStyle = L.dark;
        x.beginPath(); x.arc(bx - br * 0.28, by + br * 0.38, br * 0.82, 0, TAU); x.fill();
        x.globalAlpha = 0.45; x.fillStyle = L.light;
        x.beginPath(); x.arc(bx + br * 0.25, by - br * 0.32, br * 0.52, 0, TAU); x.fill();
        x.globalAlpha = 0.35; x.fillStyle = L.hi;
        x.beginPath(); x.arc(bx + br * 0.36, by - br * 0.44, br * 0.24, 0, TAU); x.fill();
      }
      for (let i = 0; i < n * 22; i++) {
        const a = r() * TAU, d = Math.sqrt(r());
        const lx = cx + Math.cos(a) * rx * d, ly = cy + Math.sin(a) * ry * d;
        const lit = (lx - cx) / rx - (ly - cy) / ry + (r() - 0.5);
        x.globalAlpha = 0.55;
        x.fillStyle = lit > 0.45 ? L.hi : lit > -0.35 ? L.light : L.dark;
        x.beginPath(); x.ellipse(lx, ly, 1.1 + r() * 1.7, 0.7 + r() * 1.0, r() * TAU, 0, TAU); x.fill();
      }
    });
  }

  function trunk(x, bx, by, bw, th, cols, r, branches) {
    const g = x.createLinearGradient(bx - bw, 0, bx + bw, 0);
    g.addColorStop(0, cols[0]); g.addColorStop(0.62, cols[1]); g.addColorStop(1, cols[0]);
    x.fillStyle = g;
    const tx = bx + (r() - 0.5) * bw;
    x.beginPath();
    x.moveTo(bx - bw * 1.1, by);
    x.quadraticCurveTo(bx - bw * 0.35, by - th * 0.45, tx - bw * 0.25, by - th);
    x.lineTo(tx + bw * 0.25, by - th);
    x.quadraticCurveTo(bx + bw * 0.35, by - th * 0.45, bx + bw * 1.1, by);
    x.closePath(); x.fill();
    x.strokeStyle = cols[0]; x.lineCap = 'round';
    for (let i = 0; i < branches; i++) {
      const sy = by - th * (0.5 + r() * 0.45), dir = r() < 0.5 ? -1 : 1;
      x.lineWidth = bw * (0.3 + r() * 0.15);
      x.beginPath(); x.moveTo(tx, sy);
      x.quadraticCurveTo(tx + dir * bw * 1.4, sy - th * 0.1, tx + dir * bw * (2 + r() * 2.2), sy - th * (0.2 + r() * 0.15));
      x.stroke();
    }
    x.strokeStyle = 'rgba(0,0,0,0.28)'; x.lineWidth = 0.8;
    for (let i = 0; i < 9; i++) {
      const yy = by - r() * th, xx = bx - bw * 0.5 + r() * bw;
      x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx + (r() - 0.5) * 2, yy - 5 - r() * 9); x.stroke();
    }
  }

  // ---------- Sprites de vegetação e pedras ----------
  function makeOak(art, seed, w, h) {
    const r = rng(seed);
    return sprite(w, h, (x) => {
      trunk(x, w / 2, h, w * 0.075, h * 0.58, art.trunk, r, 4);
      const [c, cx] = layerCanvas(w, h);
      canopy(cx, w / 2, h * 0.37, w * 0.46, h * 0.33, art.leaves, r, 18);
      x.fillStyle = 'rgba(0,0,0,0.22)';
      x.beginPath(); x.ellipse(w / 2, h * 0.64, w * 0.16, h * 0.05, 0, 0, TAU); x.fill();
      x.drawImage(c, 0, 0, w, h);
    });
  }
  function makePoplar(art, seed, w, h) {
    const r = rng(seed);
    return sprite(w, h, (x) => {
      trunk(x, w / 2, h, w * 0.1, h * 0.4, art.trunk, r, 0);
      const [c, cx] = layerCanvas(w, h);
      canopy(cx, w / 2, h * 0.43, w * 0.4, h * 0.4, art.leaves, r, 14);
      x.drawImage(c, 0, 0, w, h);
    });
  }
  function makeBush(art, seed, w, h) {
    const r = rng(seed);
    return sprite(w, h, (x) => {
      const [c, cx] = layerCanvas(w, h);
      canopy(cx, w / 2, h * 0.6, w * 0.47, h * 0.48, art.leaves, r, 10);
      if (art.flowers && r() < 0.7) {
        for (let i = 0; i < 16; i++) {
          const a = r() * TAU, d = Math.sqrt(r());
          cx.fillStyle = art.flowers[Math.floor(r() * art.flowers.length)];
          cx.beginPath(); cx.arc(w / 2 + Math.cos(a) * w * 0.38 * d, h * 0.55 + Math.sin(a) * h * 0.35 * d, 1.3, 0, TAU); cx.fill();
        }
      }
      if (art.snowy) {
        atop(cx, () => {
          cx.fillStyle = '#ffffff';
          for (let i = 0; i < 8; i++) {
            cx.beginPath(); cx.ellipse(w * (0.15 + r() * 0.7), h * (0.18 + r() * 0.25), w * 0.18, h * 0.12, 0, 0, TAU); cx.fill();
          }
          cx.fillStyle = 'rgba(160,185,220,0.35)';
          cx.fillRect(0, h * 0.42, w, h);
        });
      }
      x.drawImage(c, 0, 0, w, h);
    });
  }
  function makePine(art, seed, w, h, snowy) {
    const r = rng(seed), L = art.leaves;
    return sprite(w, h, (x) => {
      x.fillStyle = art.trunk[0];
      x.fillRect(w / 2 - w * 0.045, h * 0.78, w * 0.09, h * 0.22);
      const [c, t] = layerCanvas(w, h);
      const tiers = 6, edges = [];
      for (let k = 0; k < tiers; k++) {
        const f = k / tiers;
        const by = h * (0.86 - f * 0.72), top = by - h * 0.25;
        const hw = w * 0.5 * (1 - f * 0.76);
        edges.push([top, by, hw]);
        t.fillStyle = L.mid;
        t.beginPath(); t.moveTo(w / 2, top);
        const steps = 7;
        for (let i = 1; i <= steps; i++) { const q = i / steps; t.lineTo(w / 2 + hw * q + (r() - 0.5) * 2, top + (by - top) * q + (i % 2 ? -2 : 1)); }
        for (let i = steps; i >= -steps; i--) { const q = i / steps; t.lineTo(w / 2 + hw * q, by + (Math.abs(i) % 2 ? 3 : -1) + r() * 2); }
        for (let i = steps; i >= 1; i--) { const q = i / steps; t.lineTo(w / 2 - hw * q + (r() - 0.5) * 2, top + (by - top) * q + (i % 2 ? -2 : 1)); }
        t.closePath(); t.fill();
      }
      atop(t, () => {
        const g = t.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, L.dark); g.addColorStop(0.55, L.mid); g.addColorStop(1, L.light);
        t.globalAlpha = 0.9; t.fillStyle = g; t.fillRect(0, 0, w, h);
        t.lineWidth = 0.9;
        for (let i = 0; i < 260; i++) {
          const px = r() * w, py = r() * h;
          t.strokeStyle = px > w / 2 + (r() - 0.5) * 10 ? L.hi : L.dark;
          t.globalAlpha = 0.45;
          const dir = px > w / 2 ? 1 : -1;
          t.beginPath(); t.moveTo(px, py); t.lineTo(px + dir * (2 + r() * 3), py + 2 + r() * 2); t.stroke();
        }
        for (const [top, by, hw] of edges) {
          t.globalAlpha = 0.35; t.fillStyle = L.dark;
          t.fillRect(w / 2 - hw, by - 4, hw * 2, 5);
        }
        if (snowy) {
          t.globalAlpha = 1;
          for (const [top, by, hw] of edges) {
            t.fillStyle = '#ffffff';
            t.beginPath(); t.moveTo(w / 2, top - 2);
            t.lineTo(w / 2 + hw * 0.92, by - 3);
            for (let i = 6; i >= -6; i--) t.lineTo(w / 2 + hw * 0.92 * (i / 6), by - 4 - (by - top) * 0.25 + (i % 2 ? 3 : 0));
            t.lineTo(w / 2 - hw * 0.92, by - 3);
            t.closePath(); t.fill();
            const sg = t.createLinearGradient(w / 2 - hw, 0, w / 2 + hw, 0);
            sg.addColorStop(0, 'rgba(150,175,215,0.55)'); sg.addColorStop(0.6, 'rgba(150,175,215,0)');
            t.fillStyle = sg; t.fill();
          }
        }
      });
      x.drawImage(c, 0, 0, w, h);
    });
  }
  function makeRock(art, seed, w, h, snowy) {
    const r = rng(seed), R = art.rock;
    return sprite(w, h, (x) => {
      const n = 10;
      x.beginPath(); x.moveTo(0, h);
      for (let i = 0; i < n; i++) {
        const a = Math.PI + (i / (n - 1)) * Math.PI, rr = 0.72 + r() * 0.3;
        x.lineTo(w / 2 + Math.cos(a) * w * 0.49 * rr, h + Math.sin(a) * h * 0.96 * rr);
      }
      x.lineTo(w, h); x.closePath();
      x.fillStyle = R[0]; x.fill();
      atop(x, () => {
        const g = x.createLinearGradient(w, 0, 0, h);
        g.addColorStop(0, R[2]); g.addColorStop(0.45, R[0]); g.addColorStop(1, R[1]);
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 4; i++) {
          x.globalAlpha = 0.25; x.fillStyle = r() < 0.5 ? R[2] : R[1];
          x.beginPath(); x.moveTo(r() * w, r() * h); x.lineTo(r() * w, r() * h); x.lineTo(r() * w, r() * h); x.fill();
        }
        x.globalAlpha = 0.5; x.strokeStyle = R[1]; x.lineWidth = 0.8;
        for (let i = 0; i < 4; i++) {
          let px = r() * w, py = h * (0.3 + r() * 0.5);
          x.beginPath(); x.moveTo(px, py);
          for (let k = 0; k < 3; k++) { px += (r() - 0.5) * 10; py += 2 + r() * 5; x.lineTo(px, py); }
          x.stroke();
        }
        for (let i = 0; i < 70; i++) {
          x.globalAlpha = 0.3; x.fillStyle = r() < 0.5 ? R[2] : R[1];
          x.fillRect(r() * w, r() * h, 1, 1);
        }
        if (art.moss) {
          for (let i = 0; i < 40; i++) {
            x.globalAlpha = 0.6; x.fillStyle = art.moss;
            x.beginPath(); x.arc(r() * w, h * (0.05 + r() * 0.3), 1 + r() * 2, 0, TAU); x.fill();
          }
        }
        if (snowy) {
          x.globalAlpha = 1; x.fillStyle = '#ffffff';
          x.beginPath(); x.ellipse(w * 0.5, 0, w * 0.6, h * 0.42, 0, 0, TAU); x.fill();
          x.fillStyle = 'rgba(160,185,225,0.5)';
          x.beginPath(); x.ellipse(w * 0.35, h * 0.32, w * 0.3, h * 0.08, 0, 0, TAU); x.fill();
        }
      });
    });
  }
  function makeCactus(art, seed, w, h) {
    const r = rng(seed), C = art.cactus;
    return sprite(w, h, (x) => {
      x.strokeStyle = C[1]; x.lineCap = 'round'; x.lineJoin = 'round';
      const bw = w * 0.24;
      x.lineWidth = bw;
      x.beginPath(); x.moveTo(w / 2, h); x.lineTo(w / 2, bw / 2 + 1); x.stroke();
      x.lineWidth = bw * 0.72;
      const ly = h * (0.5 + r() * 0.15), ry = h * (0.38 + r() * 0.15);
      x.beginPath(); x.moveTo(w / 2, ly); x.lineTo(w * 0.17, ly); x.lineTo(w * 0.17, ly - h * (0.18 + r() * 0.1)); x.stroke();
      x.beginPath(); x.moveTo(w / 2, ry); x.lineTo(w * 0.83, ry); x.lineTo(w * 0.83, ry - h * (0.15 + r() * 0.12)); x.stroke();
      atop(x, () => {
        const g = x.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, C[0]); g.addColorStop(0.25, C[1]); g.addColorStop(0.45, C[0]);
        g.addColorStop(0.55, C[1]); g.addColorStop(0.72, C[2]); g.addColorStop(0.85, C[0]); g.addColorStop(1, C[1]);
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 0.8;
        for (let px = 1; px < w; px += 2.6) { x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h); x.stroke(); }
        x.fillStyle = 'rgba(255,255,230,0.75)';
        for (let i = 0; i < 90; i++) x.fillRect(r() * w, r() * h, 0.7, 0.7);
        const sg = x.createLinearGradient(0, 0, 0, h);
        sg.addColorStop(0, 'rgba(255,255,255,0.12)'); sg.addColorStop(1, 'rgba(0,0,0,0.25)');
        x.fillStyle = sg; x.fillRect(0, 0, w, h);
      });
      if (r() < 0.6) {
        x.fillStyle = art.flowers[Math.floor(r() * art.flowers.length)];
        x.beginPath(); x.arc(w / 2, bw * 0.35, 2.4, 0, TAU); x.fill();
      }
    });
  }
  function makeShrub(art, seed, w, h) {
    const r = rng(seed), L = art.leaves;
    return sprite(w, h, (x) => {
      x.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        const a = -Math.PI / 2 + (r() - 0.5) * 2.4, len = h * (0.5 + r() * 0.5);
        x.strokeStyle = r() < 0.5 ? art.trunk[0] : art.trunk[1];
        x.lineWidth = 0.8 + r() * 0.8;
        const ex = w / 2 + Math.cos(a) * len * 1.2, ey = h + Math.sin(a) * len;
        x.beginPath(); x.moveTo(w / 2 + (r() - 0.5) * 6, h); x.quadraticCurveTo(w / 2 + Math.cos(a) * len * 0.4, h - len * 0.6, ex, ey); x.stroke();
        for (let k = 0; k < 4; k++) {
          x.fillStyle = [L.dark, L.mid, L.light, L.hi][Math.floor(r() * 4)];
          x.beginPath(); x.ellipse(ex + (r() - 0.5) * 8, ey + (r() - 0.5) * 6, 2 + r() * 2, 1.2 + r(), r() * TAU, 0, TAU); x.fill();
        }
      }
    });
  }
  function makeDeadTree(art, seed, w, h, snowy) {
    const r = rng(seed);
    return sprite(w, h, (x) => {
      x.lineCap = 'round'; x.lineJoin = 'round';
      const branch = (px, py, a, len, wd, depth) => {
        const ex = px + Math.cos(a) * len, ey = py + Math.sin(a) * len;
        const g = x.createLinearGradient(px - wd, py, px + wd, py);
        g.addColorStop(0, art.trunk[0]); g.addColorStop(0.7, art.trunk[1]); g.addColorStop(1, art.trunk[0]);
        x.strokeStyle = g; x.lineWidth = wd;
        const qx = px + Math.cos(a + 0.3) * len * 0.5, qy = py + Math.sin(a + 0.3) * len * 0.5;
        x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(qx, qy, ex, ey); x.stroke();
        // neve assentada por cima dos galhos mais deitados
        if (snowy && Math.abs(Math.cos(a)) > 0.3) {
          const o = wd * 0.38;
          x.strokeStyle = '#ffffff'; x.lineWidth = Math.max(0.8, wd * 0.45);
          x.beginPath(); x.moveTo(px, py - o); x.quadraticCurveTo(qx, qy - o, ex, ey - o); x.stroke();
        }
        if (depth > 0) {
          const k = 2 + (r() < 0.4 ? 1 : 0);
          for (let i = 0; i < k; i++) branch(ex, ey, a + (r() - 0.5) * 1.3, len * (0.55 + r() * 0.2), wd * 0.62, depth - 1);
        }
      };
      branch(w / 2, h, -Math.PI / 2 + (r() - 0.5) * 0.2, h * 0.38, w * 0.09, 4);
    });
  }
  function makeGrassClump(art, seed, w, h, flowers) {
    const r = rng(seed), G = art.grass;
    return sprite(w, h, (x) => {
      for (let i = 0; i < 30; i++) {
        const bx = w * (0.15 + r() * 0.7), len = h * (0.45 + r() * 0.55);
        const lean = (bx - w / 2) / w * 1.4 + (r() - 0.5) * 0.6;
        x.fillStyle = i < 10 ? G[0] : i < 22 ? G[1] : G[2];
        x.beginPath(); x.moveTo(bx - 1.4, h);
        x.quadraticCurveTo(bx + lean * len * 0.3, h - len * 0.6, bx + lean * len * 0.6, h - len);
        x.quadraticCurveTo(bx + lean * len * 0.3 + 0.6, h - len * 0.55, bx + 1.4, h);
        x.fill();
      }
      if (flowers && art.flowers) {
        for (let i = 0; i < 4; i++) {
          x.fillStyle = art.flowers[Math.floor(r() * art.flowers.length)];
          x.beginPath(); x.arc(w * (0.2 + r() * 0.6), h * (0.1 + r() * 0.4), 1.6, 0, TAU); x.fill();
        }
      }
    });
  }
  // Planta de primeiro plano (samambaia, capim alto ou galho com neve)
  function makeFern(art, seed, w, h, tall) {
    const r = rng(seed), F = art.fg;
    const sp = sprite(w, h, (x) => {
      const fronds = tall ? 34 : 14;
      for (let i = 0; i < fronds; i++) {
        const u = i / (fronds - 1);
        const a = -Math.PI / 2 + (u - 0.5) * (tall ? 1.5 : 2.7) + (r() - 0.5) * 0.25;
        const len = h * (0.55 + r() * 0.45) * (1 - Math.abs(u - 0.5) * (tall ? 0.3 : 0.55));
        const bx = w / 2 + (r() - 0.5) * w * 0.12, by = h;
        const dx = Math.cos(a), dy = Math.sin(a);
        const c1x = bx + dx * len * 0.55, c1y = by + dy * len * 0.75;
        const ex = bx + dx * len * (tall ? 1.05 : 1.15), ey = by + dy * len * (tall ? 0.95 : 0.55) + len * (tall ? 0.05 : 0.2);
        const col = i % 3 === 0 ? F.dark : i % 3 === 1 ? F.mid : F.light;
        if (tall) {
          x.fillStyle = col;
          x.beginPath(); x.moveTo(bx - 2, by); x.quadraticCurveTo(c1x, c1y, ex, ey); x.quadraticCurveTo(c1x + 1.5, c1y + 2, bx + 2, by); x.fill();
          continue;
        }
        x.strokeStyle = F.dark; x.lineWidth = 1.4;
        x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo(c1x, c1y, ex, ey); x.stroke();
        for (let t = 0.12; t <= 1; t += 0.055) {
          const it = 1 - t;
          const px = it * it * bx + 2 * it * t * c1x + t * t * ex;
          const py = it * it * by + 2 * it * t * c1y + t * t * ey;
          const tx = 2 * it * (c1x - bx) + 2 * t * (ex - c1x), ty = 2 * it * (c1y - by) + 2 * t * (ey - c1y);
          const tl = Math.hypot(tx, ty) || 1;
          const nx = -ty / tl, ny = tx / tl;
          const ll = len * 0.15 * (1 - t * 0.75);
          for (const s of [-1, 1]) {
            x.fillStyle = s > 0 ? col : F.dark;
            const lx = px + nx * s * ll + (tx / tl) * ll * 0.5, ly = py + ny * s * ll + (ty / tl) * ll * 0.5;
            x.beginPath(); x.moveTo(px, py);
            x.quadraticCurveTo((px + lx) / 2 + nx * s * 1.5, (py + ly) / 2 + ny * s * 1.5 - 1.5, lx, ly);
            x.quadraticCurveTo((px + lx) / 2, (py + ly) / 2 + 1.5, px, py);
            x.fill();
            if (F.tip && t > 0.35) { x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(lx - 1, ly - 1.5, 2.4, 1.6); }
          }
        }
      }
      atop(x, () => {
        const g = x.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(255,255,220,0.08)'); g.addColorStop(0.6, 'rgba(0,0,0,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
      });
    });
    // versão desfocada para dar profundidade de campo
    const b = canvas(sp.c.width, sp.c.height), bx = b.getContext('2d');
    bx.filter = 'blur(2.5px)';
    bx.drawImage(sp.c, 0, 0);
    sp.c = b;
    return sp;
  }
  function makeCloud(art, seed, w, h) {
    const r = rng(seed);
    const raw = sprite(w, h, (x) => {
      const base = h * 0.8;
      x.fillStyle = '#ffffff';
      for (let i = 0; i < 22; i++) {
        const bx = w * (0.1 + r() * 0.8);
        const br = h * (0.16 + r() * 0.22) * (1.05 - Math.abs(bx / w - 0.5) * 1.2);
        const by = base - br * (0.3 + r() * 0.75);
        x.beginPath(); x.arc(bx, by, br, 0, TAU); x.fill();
      }
      x.save(); x.globalCompositeOperation = 'destination-out';
      const cg = x.createLinearGradient(0, base - 4, 0, base + 6);
      cg.addColorStop(0, 'rgba(0,0,0,0)'); cg.addColorStop(1, 'rgba(0,0,0,1)');
      x.fillStyle = cg; x.fillRect(0, base - 4, w, h);
      x.restore();
      atop(x, () => {
        const g = x.createLinearGradient(0, 0, 0, base);
        const top = art.cloudTop || '#ffffff';
        g.addColorStop(0, top); g.addColorStop(0.55, css(mix(top, art.cloudShade, 0.15))); g.addColorStop(1, art.cloudShade);
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 14; i++) {
          x.globalAlpha = 0.5; x.fillStyle = art.cloudHi || '#ffffff';
          x.beginPath(); x.arc(w * (0.3 + r() * 0.6), h * (0.15 + r() * 0.35), h * (0.06 + r() * 0.1), 0, TAU); x.fill();
        }
      });
    }, 0, 0);
    const b = canvas(raw.c.width, raw.c.height), bx = b.getContext('2d');
    bx.filter = 'blur(2px)';
    bx.drawImage(raw.c, 0, 0);
    raw.c = b;
    return raw;
  }

  // ---------- Faixas de parallax (repetem sem emenda) ----------
  const STRIP_W = 2048;

  // Montanhas pintadas pixel a pixel: relevo, estrias de rocha, luz pela inclinação, neve, mata e névoa
  function mountainStrip(o) {
    const Wt = STRIP_W, Ht = o.h;
    const c = canvas(Wt, Ht), x = c.getContext('2d');
    const img = x.createImageData(Wt, Ht), d = img.data;
    const nh = makeNoise(o.seed, o.cells), nt = makeNoise(o.seed + 1, 64);
    const top = new Float32Array(Wt);
    for (let px = 0; px < Wt; px++) {
      const u = (px / Wt) * o.cells;
      const ridge = 1 - Math.abs(2 * fbm(nh, u, 0.5, 2) - 1);
      const ridge2 = 1 - Math.abs(2 * nh(u * 2, 4.5) - 1);
      let h = 0.72 * Math.pow(ridge, o.peak || 2.2) + 0.2 * Math.pow(ridge2, 2) + 0.06 * nh(u * 4, 7.5) + 0.03 * nh(u * 8, 1.5) + 0.04;
      if (o.alpine) h += 0.05 * (1 - Math.abs(2 * nh(u * 8, 2.5) - 1));
      if (o.terrace) {
        const q = h * o.terrace, fl = Math.floor(q);
        h = (fl + smooth(0.72, 1, q - fl)) / o.terrace;
      }
      top[px] = Ht - (o.base + h * o.amp);
    }
    const lit = hex(o.lit), sh = hex(o.shadow), hz = hex(o.haze);
    const sn = o.snow ? hex(o.snow) : null, sns = o.snow ? hex(o.snowShadow) : null;
    const vg = o.veg ? hex(o.veg) : null;
    const snowY = o.snow ? Ht - (o.base + o.amp * o.snowLine) : 0;
    const vegY = o.veg ? Ht - (o.base + o.amp * o.vegLine) : 0;
    const slWideArr = new Float32Array(Wt);
    for (let px = 0; px < Wt; px++) slWideArr[px] = (top[(px + 45) % Wt] - top[(px - 45 + Wt) % Wt]) / 90;
    for (let px = 0; px < Wt; px++) {
      const t0 = top[px];
      // inclinação perto da crista; mais abaixo, a divisa entre face iluminada e sombra serpenteia
      // pela encosta seguindo as estrias da rocha, em vez de descer reta do cume
      const slNear = (top[(px + 5) % Wt] - top[(px - 5 + Wt) % Wt]) / 10;
      const u = (px / Wt) * 64;
      for (let py = Math.max(0, Math.floor(t0)); py < Ht; py++) {
        const st = fbm(nt, u * 2, (py / Ht) * 12, 3);
        const dt = nt(u * 8 + 3.3, (py / Ht) * 48);
        const depth = (py - t0) / Ht;
        const kNear = Math.exp(-(py - t0) / 22);
        const drift = Math.round((st - 0.5) * 160 * Math.min(1, (py - t0) / 70));
        const sl = slNear * kNear + slWideArr[((px + drift) % Wt + Wt) % Wt] * (1 - kNear) * 0.6;
        let L = 0.5 + sl * 2.2 + (st - 0.5) * 0.75 + (dt - 0.5) * 0.3 - depth * 0.35;
        if (o.strata) L += Math.sin(py * 0.24 + st * 5) * 0.12;
        L = L < 0 ? 0 : L > 1 ? 1 : L;
        let r = sh[0] + (lit[0] - sh[0]) * L, g = sh[1] + (lit[1] - sh[1]) * L, b = sh[2] + (lit[2] - sh[2]) * L;
        if (sn && o.alpine) {
          // neve acumula nas encostas suaves e no alto; os paredões íngremes ficam com a rocha à mostra
          const k = (snowY - py) / o.amp * 2.4 + 0.62 - Math.abs(sl) * 1.7 + (st - 0.5) * 1.1 + (dt - 0.5) * 0.12;
          if (k > 0.4) {
            const m = k > 0.68 ? 1 : (k - 0.4) / 0.28;
            let Ls = 0.5 + sl * 2.6 + (st - 0.5) * 0.35 - depth * 0.2;
            Ls = Ls < 0 ? 0 : Ls > 1 ? 1 : Ls;
            const sr = sns[0] + (sn[0] - sns[0]) * Ls, sg = sns[1] + (sn[1] - sns[1]) * Ls, sb = sns[2] + (sn[2] - sns[2]) * Ls;
            r += (sr - r) * m; g += (sg - g) * m; b += (sb - b) * m;
          }
        } else if (sn && py < snowY + (st - 0.5) * 70 + (dt - 0.5) * 16) {
          const Ls = L * 1.25 + 0.1 > 1 ? 1 : L * 1.25 + 0.1;
          r = sns[0] + (sn[0] - sns[0]) * Ls; g = sns[1] + (sn[1] - sns[1]) * Ls; b = sns[2] + (sn[2] - sns[2]) * Ls;
        }
        if (vg) {
          const vl = vegY + (st - 0.5) * 80;
          if (py > vl) {
            const k = (py - vl) / 22 > 1 ? 0.92 : ((py - vl) / 22) * 0.92;
            const f = 0.5 + dt * 0.55 + L * 0.35;
            r += (vg[0] * f - r) * k; g += (vg[1] * f - g) * k; b += (vg[2] * f - b) * k;
          }
        }
        const hk = o.hazeAmt + (py / Ht) * o.hazeGrad, hkc = hk > 1 ? 1 : hk;
        r += (hz[0] - r) * hkc; g += (hz[1] - g) * hkc; b += (hz[2] - b) * hkc;
        const a = py + 1 - t0;
        const i = (py * Wt + px) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = (a > 1 ? 1 : a) * 255;
      }
    }
    x.putImageData(img, 0, 0);
    if (o.lava) drawLavaFlows(x, top, Wt, Ht, o);
    const bi = ((Ht - 1) * Wt) * 4;
    return { c, w: Wt, h: Ht, bottom: `rgb(${d[bi]},${d[bi + 1]},${d[bi + 2]})` };
  }

  // Crateras brilhando nos picos e poucos rios de lava que descem pela encosta, acompanhando o relevo
  function drawLavaFlows(x, top, Wt, Ht, o) {
    const r = rng(o.seed + 9);
    const peaks = [];
    for (let px = 16; px < Wt - 16; px += 2) {
      const t = top[px];
      if (t < top[px - 14] - 2 && t < top[px + 14] - 2 && t < Ht - o.base - o.amp * 0.3) {
        if (!peaks.length || px - peaks[peaks.length - 1] > 60) peaks.push(px);
      }
    }
    const fade = 1 - o.hazeAmt * 1.3;
    x.save();
    x.globalCompositeOperation = 'lighter';
    for (const pk of peaks) {
      if (r() < 0.35) continue;
      const cy = top[pk] + 3;
      const g = x.createRadialGradient(pk, cy, 0, pk, cy, 26);
      g.addColorStop(0, `rgba(255,170,70,${0.7 * fade})`); g.addColorStop(1, 'rgba(255,80,20,0)');
      x.fillStyle = g; x.fillRect(pk - 26, cy - 26, 52, 52);
      const flows = 1 + Math.floor(r() * 2.4);
      for (let f = 0; f < flows; f++) {
        // cada rio escolhe um lado da encosta e desce colado ao relevo, serpenteando de leve
        const dir = r() < 0.5 ? -1 : 1, len = 50 + r() * 110, ph = r() * 6;
        let fx = pk + dir * (2 + r() * 4), fy = top[pk] + 4;
        const pts = [[fx, fy]];
        for (let s = 0; s < len; s += 3) {
          fy += 3;
          const target = fx + dir * 1.4 + Math.sin(s * 0.08 + ph) * 0.9;
          const ti = Math.max(0, Math.min(Wt - 1, Math.round(target)));
          fx = fy > top[ti] + 3 ? target : fx - dir * 0.6;
          pts.push([fx, fy]);
        }
        for (const [w, a] of [[5, 0.18], [2.2, 0.55], [1, 0.9]]) {
          for (let i = 1; i < pts.length; i++) {
            const k = 1 - i / pts.length;
            x.strokeStyle = `rgba(255,${120 + 80 * k},${40 + 40 * k},${a * k * fade})`;
            x.lineWidth = w * (0.5 + k * 0.5);
            x.beginPath(); x.moveTo(pts[i - 1][0], pts[i - 1][1]); x.lineTo(pts[i][0], pts[i][1]); x.stroke();
          }
        }
      }
    }
    x.restore();
  }

  // Mesas e buttes do cânion: topos planos, paredões íngremes, rampa de detritos na base e camadas de rocha
  function mesaStrip(o) {
    const Wt = STRIP_W, Ht = o.h, r = rng(o.seed);
    const c = canvas(Wt, Ht), x = c.getContext('2d');
    const img = x.createImageData(Wt, Ht), d = img.data;
    const nb = makeNoise(o.seed + 5, 10), nt = makeNoise(o.seed + 1, 64);

    const mesas = [];
    for (let px = 40 + r() * 80; px < Wt - 120;) {
      const w = 90 + r() * 340;
      if (px + w > Wt - 60) break;
      mesas.push({ x0: px, x1: px + w, h: 0.35 + r() * 0.65, cliff: 6 + r() * 14, talus: 24 + r() * 40, seed: r() * 100 });
      px += w + 50 + r() * 190;
    }
    const top = new Float32Array(Wt);
    for (let px = 0; px < Wt; px++) {
      let h = 0.06 + 0.07 * fbm(nb, (px / Wt) * 10, 0.5, 3);
      for (const m of mesas) {
        const dIn = Math.min(px - m.x0, m.x1 - px);
        if (dIn < -m.talus - m.cliff) continue;
        let mh;
        if (dIn >= m.cliff) mh = m.h - 0.015 * nt((px / Wt) * 64 * 4 + m.seed, 1.5);
        else if (dIn >= 0) mh = m.h * (0.55 + 0.45 * smooth(0, m.cliff, dIn));
        else mh = m.h * 0.55 * Math.pow(1 + dIn / (m.talus + m.cliff), 1.7);
        if (mh > h) h = mh;
      }
      top[px] = Ht - (o.base + h * o.amp);
    }

    const layers = o.layers.map(hex), sh = hex(o.shadow), hz = hex(o.haze), cap = hex(o.cap);
    // Sequência de camadas de rocha com espessuras irregulares: veios finos, camadas médias e bancos grossos
    const bandMax = Ht + 40, bandOf = new Int16Array(bandMax), bandTone = [];
    for (let a = 0, k = 0, prev = -1; a < bandMax; k++) {
      const q = r();
      const th = q < 0.3 ? 2 + r() * 4 : q < 0.75 ? 7 + r() * 9 : 18 + r() * 22;
      let tone = Math.floor(r() * layers.length);
      if (tone === prev) tone = (tone + 1) % layers.length;
      prev = tone;
      bandTone.push([tone, (r() - 0.5) * 0.18, th < 6]);
      for (let j = 0; j < th && a < bandMax; j++, a++) bandOf[a] = k;
    }
    for (let px = 0; px < Wt; px++) {
      const t0 = top[px];
      const sl = (top[(px + 2) % Wt] - top[(px - 2 + Wt) % Wt]) / 4;
      const u = (px / Wt) * 64;
      for (let py = Math.max(0, Math.floor(t0)); py < Ht; py++) {
        const alt = Ht - py;
        const wob = nt(u * 1.5, (py / Ht) * 6) * 9;
        const ai = Math.min(bandMax - 1, Math.max(0, Math.round(alt + wob)));
        const bt = bandTone[bandOf[ai]];
        const base = layers[bt[0]];
        const fine = bt[1] + (bt[2] ? -0.08 : Math.sin((alt + wob) * 0.9) * 0.04);
        const streak = nt(u * 6 + 1.7, (py / Ht) * 2.5);
        const grain = nt(u * 16, (py / Ht) * 60);
        // face voltada para o sol (direita) fica clara; a outra, em sombra
        let L = 0.62 + sl * 1.8 + (streak - 0.5) * 0.45 + (grain - 0.5) * 0.18 + fine;
        L -= ((py - t0) / Ht) * 0.25;
        L = L < 0 ? 0 : L > 1.15 ? 1.15 : L;
        let rr = sh[0] + (base[0] - sh[0]) * L, gg = sh[1] + (base[1] - sh[1]) * L, bb = sh[2] + (base[2] - sh[2]) * L;
        if (py - t0 < 3 && Math.abs(sl) < 0.4) { rr = cap[0]; gg = cap[1]; bb = cap[2]; }
        const hk = o.hazeAmt + (py / Ht) * o.hazeGrad, hkc = hk > 1 ? 1 : hk;
        rr += (hz[0] - rr) * hkc; gg += (hz[1] - gg) * hkc; bb += (hz[2] - bb) * hkc;
        const a = py + 1 - t0;
        const i = (py * Wt + px) * 4;
        d[i] = rr; d[i + 1] = gg; d[i + 2] = bb; d[i + 3] = (a > 1 ? 1 : a) * 255;
      }
    }
    x.putImageData(img, 0, 0);
    // arbustos secos pontilhando os topos e a base
    for (const m of mesas) {
      for (let k = 0; k < 6; k++) {
        const px = m.x0 + m.cliff + r() * (m.x1 - m.x0 - m.cliff * 2);
        x.fillStyle = css(mix(o.shrub, o.haze, o.hazeAmt + 0.1), 0.85);
        x.beginPath(); x.ellipse(px, top[Math.floor(px)] + 1, 2 + r() * 3, 1.5 + r(), 0, 0, TAU); x.fill();
      }
    }
    const bi = ((Ht - 1) * Wt) * 4;
    return { c, w: Wt, h: Ht, bottom: `rgb(${d[bi]},${d[bi + 1]},${d[bi + 2]})` };
  }

  function drawWrapped(x, sp, px, py, sc, Wt) {
    const w = sp.w * sc, h = sp.h * sc, l = px - sp.ax * sc, t = py - sp.ay * sc;
    x.drawImage(sp.c, l, t, w, h);
    if (l < 0) x.drawImage(sp.c, l + Wt, t, w, h);
    if (l + w > Wt) x.drawImage(sp.c, l - Wt, t, w, h);
  }
  function hazeOver(x, Wt, Ht, col, a0, a1) {
    atop(x, () => {
      const g = x.createLinearGradient(0, 0, 0, Ht);
      g.addColorStop(0, css(col, a0)); g.addColorStop(1, css(col, a1));
      x.fillStyle = g; x.fillRect(0, 0, Wt, Ht);
    });
  }

  // Linha de árvores distantes sobre um morro suave
  function treeLineStrip(art, A, seed) {
    const Wt = STRIP_W, Ht = 180, r = rng(seed), n = makeNoise(seed, 8), o = art.treeLine;
    const c = canvas(Wt, Ht), x = c.getContext('2d');
    const top = (px) => Ht - 84 - 34 * fbm(n, (px / Wt) * 8, 0.5, 3);
    const g = x.createLinearGradient(0, Ht - 130, 0, Ht);
    g.addColorStop(0, o.ground[0]); g.addColorStop(1, o.ground[1]);
    x.fillStyle = g;
    x.beginPath(); x.moveTo(0, Ht);
    for (let px = 0; px <= Wt; px += 8) x.lineTo(px, top(px));
    x.lineTo(Wt, Ht); x.closePath(); x.fill();
    const items = [];
    const count = art.treeCount || (art.snowy ? 240 : art.kit === 'canyon' || art === ART.canyon ? 120 : 300);
    for (let i = 0; i < count; i++) {
      const px = r() * Wt;
      items.push({ px, py: top(px) + 4 + r() * 40, sp: A.small[Math.floor(r() * A.small.length)], sc: 0.55 + r() * 0.5 });
    }
    items.sort((a, b) => a.py - b.py);
    for (const it of items) drawWrapped(x, it.sp, it.px, it.py, it.sc, Wt);
    hazeOver(x, Wt, Ht, o.haze, o.hazeAmt + 0.06, o.hazeAmt * 0.7);
    return { c, w: Wt, h: Ht, bottom: css(mix(o.ground[1], o.haze, o.hazeAmt * 0.7)) };
  }

  // Colinas próximas com vegetação maior
  function hillsStrip(art, A, seed) {
    const Wt = STRIP_W, Ht = 250, r = rng(seed), n = makeNoise(seed, 6), o = art.hills;
    const c = canvas(Wt, Ht), x = c.getContext('2d');
    const top = (px) => 70 + 52 * fbm(n, (px / Wt) * 6, 0.5, 3);
    const g = x.createLinearGradient(0, 40, 0, Ht);
    g.addColorStop(0, o.top); g.addColorStop(1, o.bottom);
    x.fillStyle = g;
    x.beginPath(); x.moveTo(0, Ht);
    for (let px = 0; px <= Wt; px += 6) x.lineTo(px, top(px));
    x.lineTo(Wt, Ht); x.closePath(); x.fill();
    atop(x, () => {
      for (let i = 0; i < 9000; i++) {
        const px = r() * Wt, py = top(px) + r() * (Ht - top(px));
        x.globalAlpha = 0.25 + r() * 0.3;
        x.fillStyle = o.speck[r() < 0.5 ? 0 : 1];
        x.fillRect(px, py, 1 + r() * 2, 1);
      }
      x.globalAlpha = 1;
      const sg = x.createLinearGradient(0, 0, Wt, 0);
      for (let k = 0; k <= 8; k++) sg.addColorStop(k / 8, `rgba(0,0,0,${0.05 + 0.08 * (n(k * 0.75, 2.2))})`);
      x.fillStyle = sg; x.fillRect(0, 0, Wt, Ht);
    });
    const items = [];
    for (let i = 0; i < 120; i++) {
      const px = r() * Wt;
      items.push({ px, py: top(px) + 6 + r() * 26, sp: A.hillSprites[Math.floor(r() * A.hillSprites.length)], sc: 0.42 + r() * 0.3 });
    }
    items.sort((a, b) => a.py - b.py);
    for (const it of items) drawWrapped(x, it.sp, it.px, it.py, it.sc, Wt);
    hazeOver(x, Wt, Ht, o.haze, o.hazeAmt + 0.08, o.hazeAmt * 0.4);
    return { c, w: Wt, h: Ht, bottom: css(mix(o.bottom, o.haze, o.hazeAmt * 0.4)) };
  }

  // Textura de solo repetível: terra, cascalho e rachaduras
  function dirtTexture(art, seed) {
    const N = 256, c = canvas(N, N), x = c.getContext('2d');
    const img = x.createImageData(N, N), d = img.data;
    const n = makeNoise(seed, 16), n2 = makeNoise(seed + 7, 64), r = rng(seed);
    const D = art.dirt, dk = hex(D.dark), lt = hex(D.light), bs = hex(D.base);
    for (let py = 0; py < N; py++) {
      for (let px = 0; px < N; px++) {
        const v = fbm(n, (px / N) * 16, (py / N) * 16, 4);
        const w = n2((px / N) * 64, (py / N) * 64);
        let t = v * 1.35 - 0.18; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const j = (r() - 0.5) * 16 + (w - 0.5) * 34;
        const i = (py * N + px) * 4;
        d[i] = (dk[0] + (lt[0] - dk[0]) * t) * 0.6 + bs[0] * 0.4 + j;
        d[i + 1] = (dk[1] + (lt[1] - dk[1]) * t) * 0.6 + bs[1] * 0.4 + j;
        d[i + 2] = (dk[2] + (lt[2] - dk[2]) * t) * 0.6 + bs[2] * 0.4 + j;
        d[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    const P = art.pebble;
    const pebble = (px, py, rr) => {
      for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
        const X = px + ox, Y = py + oy;
        if (X < -10 || X > N + 10 || Y < -10 || Y > N + 10) continue;
        x.fillStyle = 'rgba(0,0,0,0.35)';
        x.beginPath(); x.ellipse(X + 1, Y + 1.2, rr, rr * 0.7, 0, 0, TAU); x.fill();
        const g = x.createRadialGradient(X - rr * 0.3, Y - rr * 0.3, 0, X, Y, rr);
        g.addColorStop(0, P[0]); g.addColorStop(1, P[1]);
        x.fillStyle = g;
        x.beginPath(); x.ellipse(X, Y, rr, rr * 0.7, 0, 0, TAU); x.fill();
      }
    };
    for (let i = 0; i < 46; i++) pebble(r() * N, r() * N, 1.2 + r() * 3.6);
    x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 0.9;
    for (let i = 0; i < 12; i++) {
      let px = r() * N, py = r() * N;
      x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 5; k++) { px += (r() - 0.5) * 18; py += (r() - 0.3) * 10; x.lineTo(px, py); }
      x.stroke();
    }
    return c;
  }

  // ---------- Montagem por ambiente (com cache) ----------
  const cache = {};

  function steps(key) {
    const art = ART[key], A = { art, key };
    const kit = art.kit || key;
    const k = key.length * 97 + ({ autumn: 501, night: 777 }[key] || 0);
    const S2 = (fn) => fn;
    return [A, [
      S2(() => {
        A.clouds = [0, 1, 2, 3, 4].map((i) => makeCloud(art, k + 100 + i, 200 + i * 34, 86 + (i % 3) * 14));
        A.glow = null;
      }),
      S2(() => {
        const D = (A.decor = {});
        if (kit === 'green') {
          D.oak = [makeOak(art, 1, 130, 160), makeOak(art, 2, 150, 180), makeOak(art, 3, 112, 138)];
          D.poplar = [makePoplar(art, 4, 64, 170), makePoplar(art, 5, 58, 150)];
          D.bush = [makeBush(art, 6, 92, 56), makeBush(art, 7, 112, 64), makeBush(art, 8, 72, 46)];
          D.rock = [makeRock(art, 9, 62, 34), makeRock(art, 10, 84, 44), makeRock(art, 11, 48, 28)];
          D.grass = [makeGrassClump(art, 12, 46, 26, true), makeGrassClump(art, 13, 38, 22, false)];
          D.tree = D.oak;
          A.small = [makeOak(art, 21, 36, 46), makeOak(art, 22, 30, 40), makeOak(art, 23, 40, 50), makePoplar(art, 24, 16, 46), makePoplar(art, 25, 14, 40)];
          A.hillSprites = [D.oak[0], D.oak[1], D.oak[2], D.poplar[0], D.bush[0], D.bush[1]];
        } else if (kit === 'canyon') {
          D.cactus = [makeCactus(art, 1, 46, 92), makeCactus(art, 2, 56, 112), makeCactus(art, 3, 40, 72)];
          D.shrub = [makeShrub(art, 4, 72, 42), makeShrub(art, 5, 56, 34)];
          D.deadtree = [makeDeadTree(art, 6, 110, 140), makeDeadTree(art, 7, 90, 118)];
          D.rock = [makeRock(art, 8, 92, 52), makeRock(art, 9, 124, 62), makeRock(art, 10, 70, 40)];
          D.bush = D.shrub;
          A.small = [makeShrub(art, 21, 26, 16), makeCactus(art, 22, 12, 28), makeShrub(art, 23, 20, 12), makeRock(art, 24, 24, 12)];
          A.hillSprites = [D.cactus[0], D.cactus[1], D.shrub[0], D.shrub[1], D.rock[2], D.deadtree[1]];
        } else if (kit === 'autumn') {
          const alt = art.leavesAlt.map((L) => Object.assign({}, art, { leaves: L }));
          D.oak = [makeOak(art, 1, 130, 160), makeOak(alt[0], 2, 150, 180), makeOak(alt[1], 3, 112, 138), makeOak(alt[0], 4, 140, 168), makeOak(alt[2], 5, 120, 150)];
          D.poplar = [makePoplar(alt[1], 6, 64, 170), makePoplar(art, 7, 58, 150)];
          D.bush = [makeBush(art, 8, 92, 56), makeBush(alt[0], 9, 112, 64), makeBush(alt[1], 10, 72, 46)];
          D.rock = [makeRock(art, 11, 62, 34), makeRock(art, 12, 84, 44), makeRock(art, 13, 48, 28)];
          D.grass = [makeGrassClump(art, 14, 46, 26, false), makeGrassClump(art, 15, 38, 22, false)];
          A.small = [makeOak(art, 21, 36, 46), makeOak(alt[0], 22, 30, 40), makeOak(alt[1], 23, 40, 50), makePoplar(alt[1], 24, 16, 46), makeOak(alt[2], 25, 34, 44)];
          A.hillSprites = [D.oak[0], D.oak[1], D.oak[2], D.oak[4], D.poplar[0], D.bush[1]];
        } else if (kit === 'volcano') {
          D.deadtree = [makeDeadTree(art, 1, 110, 140), makeDeadTree(art, 2, 90, 118), makeDeadTree(art, 3, 70, 92)];
          D.rock = [makeRock(art, 4, 92, 52), makeRock(art, 5, 124, 66), makeRock(art, 6, 70, 40)];
          D.shrub = [makeShrub(art, 7, 64, 36), makeShrub(art, 8, 50, 28)];
          D.bush = D.shrub;
          A.small = [makeDeadTree(art, 21, 28, 38), makeRock(art, 22, 26, 14), makeShrub(art, 23, 20, 12), makeDeadTree(art, 24, 22, 30)];
          A.hillSprites = [D.deadtree[0], D.deadtree[2], D.rock[0], D.rock[2], D.shrub[0]];
        } else if (kit === 'night') {
          D.pine = [makePine(art, 1, 70, 150, false), makePine(art, 2, 82, 176, false), makePine(art, 3, 58, 122, false), makePine(art, 4, 96, 200, false)];
          D.oak = [makeOak(art, 5, 130, 160), makeOak(art, 6, 112, 138)];
          D.bush = [makeBush(art, 7, 92, 56), makeBush(art, 8, 72, 46)];
          D.rock = [makeRock(art, 9, 62, 34), makeRock(art, 10, 84, 44), makeRock(art, 11, 48, 28)];
          D.grass = [makeGrassClump(art, 12, 46, 26, true), makeGrassClump(art, 13, 38, 22, false)];
          A.small = [makePine(art, 21, 22, 50, false), makePine(art, 22, 18, 42, false), makePine(art, 23, 26, 58, false), makeOak(art, 24, 30, 40)];
          A.hillSprites = [D.pine[0], D.pine[1], D.pine[2], D.oak[1], D.bush[0]];
        } else {
          D.snowpine = [makePine(art, 1, 70, 150, true), makePine(art, 2, 82, 176, true), makePine(art, 3, 58, 122, true)];
          D.rock = [makeRock(art, 4, 66, 36, true), makeRock(art, 5, 88, 46, true), makeRock(art, 6, 50, 28, true)];
          D.snowpine.push(makePine(art, 9, 96, 200, true));
          D.bush = [makeBush(art, 7, 80, 48), makeBush(art, 8, 64, 40)];
          D.deadtree = [makeDeadTree(art, 10, 96, 130, true), makeDeadTree(art, 11, 80, 110, true)];
          A.small = [makePine(art, 21, 22, 50, true), makePine(art, 22, 18, 42, true), makePine(art, 23, 26, 58, true), makePine(art, 24, 14, 34, false)];
          A.hillSprites = [D.snowpine[0], D.snowpine[1], D.snowpine[2], D.snowpine[3], D.rock[1], D.deadtree[1]];
        }
        A.clumps = kit === 'snow'
          ? [makeGrassClump(art, 31, 34, 14, false), makeGrassClump(art, 32, 28, 12, false)]
          : [makeGrassClump(art, 31, 40, 22, true), makeGrassClump(art, 32, 34, 18, false), makeGrassClump(art, 33, 46, 26, true)];
        const stoneArt = Object.assign({}, art, { moss: null });
        A.stones = [makeRock(stoneArt, 41, 26, 16), makeRock(stoneArt, 42, 34, 20), makeRock(stoneArt, 43, 20, 12), makeRock(stoneArt, 44, 40, 22)];
        A.fg = [0, 1, 2].map((i) => makeFern(art, 51 + i, 190 - i * 20, 140 - i * 12, kit === 'canyon' || kit === 'volcano'));
      }),
      S2(() => { A.far = art.far.mesa ? mesaStrip(art.far) : mountainStrip(art.far); }),
      S2(() => { A.mid = art.mid.mesa ? mesaStrip(art.mid) : mountainStrip(art.mid); }),
      S2(() => { A.treeLine = treeLineStrip(art, A, k + 61); }),
      S2(() => { A.hills = hillsStrip(art, A, k + 71); }),
      S2(() => { A.dirt = dirtTexture(art, k + 81); }),
    ]];
  }

  S.Assets = {
    get(key) { return cache[key] || null; },
    has(key) { return !!cache[key]; },
    // Gera os recursos de um ambiente em etapas, liberando a thread entre elas para a barra de progresso andar
    build(key, onProgress) {
      if (cache[key]) return Promise.resolve(cache[key]);
      const [A, list] = steps(key);
      return new Promise((resolve, reject) => {
        let i = 0;
        const next = () => {
          try {
            list[i]();
            i++;
            if (onProgress) onProgress(i / list.length);
            if (i < list.length) setTimeout(next, 0);
            else { cache[key] = A; resolve(A); }
          } catch (e) { reject(e); }
        };
        setTimeout(next, 0);
      });
    },
  };
})();
