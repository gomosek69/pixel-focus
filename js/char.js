// Пиксельный персонаж 64×64: тело, вещи, перекраска и сборка картинки.
//
// Всё рисуется кодом: каждая вещь — функция, которая рисует фигуры прямо на холсте 64×64
// (с объёмом: свет сверху-слева, пастельные тона).
// Порядок слоёв: тело → обувь → штаны → верх → причёска → аксессуар.
// Затем вокруг фигуры автоматически рисуется мягкий цветной контур.
// Особые эффекты (свечение, анимация) рисуются отдельными слоями поверх и без контура.
// Картинка выводится как SVG из квадратиков, поэтому при увеличении не размывается.
//
// Перекраска: у вещи есть палитра pal ({ C: основной, D: тень, ... }).
// Функция рисования получает палитру p — исходную или перекрашенную в выбранный цвет.
// При перекраске каждый цвет палитры получает новый оттенок, а разница в яркости
// между ним и основным цветом сохраняется (тени остаются тенями).
(function (PF) {
  'use strict';

  // ---------- цвета ----------

  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  function tone(hex, f) {
    const [r, g, b] = hexToRgb(hex);
    if (f < 0) return rgbToHex(r * (1 + f), g * (1 + f), b * (1 + f));
    return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
  }
  function hexToHsl(hex) {
    let [r, g, b] = hexToRgb(hex).map((v) => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn;
    const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h;
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h / 6, s, l];
  }
  function hslToHex(h, s, l) {
    if (s === 0) return rgbToHex(l * 255, l * 255, l * 255);
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return rgbToHex(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
  }

  // Палитра для перекраски одежды.
  const PALETTE = [
    { ru: 'Красный', en: 'Red', hex: '#e5484d' },
    { ru: 'Оранжевый', en: 'Orange', hex: '#f08c2e' },
    { ru: 'Жёлтый', en: 'Yellow', hex: '#f5c83a' },
    { ru: 'Зелёный', en: 'Green', hex: '#3fa45b' },
    { ru: 'Бирюзовый', en: 'Teal', hex: '#2bb3a3' },
    { ru: 'Голубой', en: 'Sky blue', hex: '#4fa8f0' },
    { ru: 'Синий', en: 'Navy', hex: '#2c3e8a' },
    { ru: 'Фиолетовый', en: 'Purple', hex: '#8b5cf6' },
    { ru: 'Розовый', en: 'Pink', hex: '#ec6fae' },
    { ru: 'Белый', en: 'White', hex: '#f2f2f4' },
    { ru: 'Серый', en: 'Gray', hex: '#8a8f98' },
    { ru: 'Чёрный', en: 'Black', hex: '#2a2a30' },
    { ru: 'Коричневый', en: 'Brown', hex: '#8a5a34' },
  ];

  function recolor(pal, idx) {
    const target = PALETTE[idx];
    if (!pal || !target) return pal || {};
    const keys = Object.keys(pal);
    const main = hexToHsl(pal[keys[0]]);
    const T = hexToHsl(target.hex);
    const out = {};
    keys.forEach((k) => {
      const v = hexToHsl(pal[k]);
      const l = Math.max(0.04, Math.min(0.97, T[2] + (v[2] - main[2])));
      out[k] = hslToHex(T[0], T[1], l);
    });
    return out;
  }

  // ---------- бесплатная внешность ----------

  const SKINS = ['#ffe0c4', '#f5c9a0', '#e3ac7e', '#c68650', '#8d5a34', '#5c3a21'];
  const EYES = ['#5b3a1e', '#2f6fd6', '#2e9b4f', '#6f7d8c', '#a0702c', '#7b4bd1'];
  // Цвета волос: первые 6 — бесплатные, дальше — необычные (за монеты) и 2 легендарных переливающихся.
  const HAIR = ['#2a2320', '#6b4226', '#a0522d', '#e2bd62', '#c8452c', '#d9d9de',
    '#f49ac1', '#b9a1ee', '#7cc6f4', '#8fdcc0', '#eceef5', '#3d54b8', '#c8304e', '#2f9e6e',
    '#5ee7c7', '#ff9ec7'];
  const HAIR_PRICE = [0, 0, 0, 0, 0, 0, 80, 80, 80, 80, 100, 90, 90, 90, 1500, 1500];
  // Легендарные цвета: волосы окрашены переливом (градиент), он медленно «течёт», по прядям пробегают искры.
  const HAIR_LEGEND = {
    14: { grad: ['#5ee7c7', '#4aa3f0', '#a06bf0'], alt: ['#a06bf0', '#5ee7c7', '#4aa3f0'], spark: '#e9fffb' },
    15: { grad: ['#ff9ec7', '#ffd36e', '#8fe3ff', '#c7a0ff'], alt: ['#8fe3ff', '#c7a0ff', '#ff9ec7', '#ffd36e'], spark: '#ffffff' },
  };
  const EYE_NAMES = ['Карие', 'Голубые', 'Зелёные', 'Серые', 'Ореховые', 'Фиолетовые'];
  const HAIR_NAMES = ['Чёрные', 'Каштановые', 'Рыжевато-каштановые', 'Светлые', 'Рыжие', 'Седые',
    'Розовые', 'Лавандовые', 'Голубые', 'Мятные', 'Серебристые', 'Синие', 'Малиновые', 'Изумрудные',
    'Северное сияние', 'Радужный опал'];
  // Образец цвета для кнопки выбора (у легендарных — градиент).
  const hairSwatch = (i) => (HAIR_LEGEND[i] ? 'linear-gradient(135deg,' + HAIR_LEGEND[i].grad.join(',') + ')' : HAIR[i]);
  function gradAt(list, f) {
    f = Math.max(0, Math.min(0.9999, f)) * (list.length - 1);
    const i = Math.floor(f), w = f - i;
    const a = hexToRgb(list[i]), b = hexToRgb(list[i + 1]);
    return rgbToHex(a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w);
  }

  // =====================================================================
  // ХУДОЖНИК 64×64
  // Персонаж рисуется прямо в 64×64 фигурами (эллипсы, скруглённые прямоугольники,
  // многоугольники, линии). У каждой фигуры объём: свет сверху-слева, 4 тона материала
  // (свет, основной, тень, глубокая тень). Цвета пастельные, контур — тёмный оттенок цвета вещи.
  // =====================================================================

  const N = 64;
  // Запас сверху: пиксели выше картинки (пышные причёски, шляпы) не теряются, а рисуются
  // над рамкой (у SVG overflow: visible). Индекс пикселя: (y + OY) * N + x.
  const OY = 10, NH = N + OY;
  const IX = (x, y) => (y + OY) * N + x;
  const YI = (i) => ((i / N) | 0) - OY;
  const PARTS = ['legl', 'legr', 'torso', 'head', 'larm', 'rarm'];
  const P = { legl: 0, legr: 1, torso: 2, head: 3, larm: 4, rarm: 5 };

  // Стиль «пастель» (вариант 2), глаза — классические (вариант 3).
  const ST = { k: [0.07, 0.14], ks: [0.05, 0.10], light: 0.08, out: 0.27, outSat: 0.7 };

  const towards = (h, target, amt) => { const d = ((target - h + 540) % 360) - 180; return h + Math.sign(d) * Math.min(Math.abs(d), amt); };
  const hsl = (hex) => { const [h, s, l] = hexToHsl(hex); return [h * 360, s, l]; };
  const fromHsl = (h, s, l) => hslToHex((((h % 360) + 360) % 360) / 360, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l)));

  // Материал: 4 тона + цвет контура. soft — мягкие тени (кожа).
  const mats = new Map();
  function mat(hex, soft) {
    const key = hex + (soft ? 's' : '');
    let r = mats.get(key);
    if (r) return r;
    let [h, s, l] = hsl(hex);
    s *= 0.85; l = Math.min(0.92, l + 0.05); // пастель
    const base = fromHsl(h, s, l);
    const low = s < 0.12;
    const k1 = soft ? ST.ks[0] : ST.k[0], k2 = soft ? ST.ks[1] : ST.k[1];
    r = {
      t: [
        fromHsl(low ? h : towards(h, 55, 6), s, Math.min(0.97, l + (l > 0.85 ? 0.05 : ST.light))),
        base,
        fromHsl(low ? h : towards(h, 280, 7), s * 0.98, l - k1),
        fromHsl(low ? h : towards(h, 280, 14), s * 0.95, l - k2),
      ],
    };
    r.out = fromHsl(low ? h : towards(h, 280, 18), s * (soft ? 0.55 : ST.outSat), Math.max(0.06, l - (soft ? ST.out + 0.06 : ST.out)));
    mats.set(key, r);
    return r;
  }

  // Холст: материал, тон, прямой цвет (детали), часть тела.
  class Canvas {
    constructor() {
      this.m = new Array(N * NH).fill(null);
      this.t = new Uint8Array(N * NH);
      this.raw = new Array(N * NH).fill(null);
      this.part = new Int8Array(N * NH);
      this.cur = P.torso;
      this.fx = [];
      // clip(x, y) === true — сюда рисовать нельзя (волосы под головным убором).
      this.clip = null;
      // Собственные пиксели каждой части тела — в том числе закрытые другими частями.
      // Когда в танце голова или рука сдвигается, под ней видно то, что там нарисовано
      // (воротник, плечо, волосы за спиной), а не дыра.
      this.own = PARTS.map(() => ({ m: new Array(N * NH).fill(null), t: new Uint8Array(N * NH), raw: new Array(N * NH).fill(null) }));
    }
    set(x, y, m, tone) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < -OY || x >= N || y >= N) { if (Canvas.onClip) Canvas.onClip(x, y); return; }
      if (this.clip && this.clip(x, y)) return;
      const i = IX(x, y);
      this.m[i] = m; this.t[i] = tone; this.raw[i] = null; this.part[i] = this.cur;
      const o = this.own[this.cur]; o.m[i] = m; o.t[i] = tone; o.raw[i] = null;
    }
    px(x, y, hex) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < -OY || x >= N || y >= N) { if (Canvas.onClip) Canvas.onClip(x, y); return; }
      if (this.clip && this.clip(x, y)) return;
      const i = IX(x, y);
      this.raw[i] = hex; if (!this.m[i]) this.m[i] = mat(hex); this.part[i] = this.cur;
      const o = this.own[this.cur]; o.raw[i] = hex; if (!o.m[i]) o.m[i] = mat(hex);
    }
    // Передать пиксель другой части тела (вместе с её собственной копией).
    reassign(i, part) {
      const from = this.own[this.part[i]], to = this.own[part];
      to.m[i] = from.m[i]; to.t[i] = from.t[i]; to.raw[i] = from.raw[i];
      from.m[i] = null; from.raw[i] = null;
      this.part[i] = part;
    }
    // После всех правок (тени по краям, перелив волос) — обновить копии видимых пикселей.
    syncOwn() {
      for (let i = 0; i < N * NH; i++) {
        if (!this.m[i]) continue;
        const o = this.own[this.part[i]];
        o.m[i] = this.m[i]; o.t[i] = this.t[i]; o.raw[i] = this.raw[i];
      }
    }
    pts(list, hex) { list.forEach(([x, y]) => this.px(x, y, hex)); }
    filled(x, y) { return x >= 0 && y >= -OY && x < N && y < N && !!this.m[IX(x, y)]; }
    // Слой эффектов (свечение, анимация): без контура, поверх основной картинки.
    // back — слой позади фигуры (крылья).
    layer(cls, glow, back) {
      const l = new Canvas();
      l.cur = this.cur; l.clip = this.clip;
      this.fx.push({ cls, glow: !!glow, back: !!back, c: l });
      return l;
    }
  }

  const LIGHT = (() => { const v = [-0.55, -0.62, 0.56]; const n = Math.hypot(...v); return v.map((a) => a / n); })();
  const toneOf = (d, soft) => (soft ? (d > 0.82 ? 0 : d > -0.05 ? 1 : d > -0.6 ? 2 : 3) : (d > 0.78 ? 0 : d > 0.3 ? 1 : d > -0.15 ? 2 : 3));

  // Заполнить фигуру. inside(x, y) возвращает нормаль [nx, ny, nz] или null.
  // opts: tone (фиксированный тон), soft, minTone, maxTone, edge (true | 'bottom'), edgeTone.
  function fill(c, box, inside, m, opts) {
    opts = opts || {};
    const mask = new Set();
    for (let y = Math.floor(box[1]); y <= Math.ceil(box[3]); y++) {
      for (let x = Math.floor(box[0]); x <= Math.ceil(box[2]); x++) {
        const n = inside(x + 0.5, y + 0.5);
        if (!n) continue;
        let tone = opts.tone !== undefined ? opts.tone : toneOf(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2], opts.soft);
        if (opts.minTone !== undefined) tone = Math.max(tone, opts.minTone);
        if (opts.maxTone !== undefined) tone = Math.min(tone, opts.maxTone);
        c.set(x, y, m, tone);
        if (x >= 0 && x < N && y >= -OY && y < N && !(c.clip && c.clip(x, y))) mask.add(IX(x, y));
      }
    }
    if (opts.edge) {
      const et = opts.edgeTone !== undefined ? opts.edgeTone : 2;
      mask.forEach((i) => {
        const x = i % N, y = YI(i);
        const onEdge = !mask.has(i - 1) || !mask.has(i + 1) || !mask.has(i - N) || !mask.has(i + N);
        if (onEdge && (opts.edge === true || (opts.edge === 'bottom' && !mask.has(i + N)))) {
          c.t[i] = Math.max(c.t[i], et);
          if (c.own) c.own[c.part[i]].t[i] = c.t[i];
        }
      });
    }
    return mask;
  }
  function ell(c, cx, cy, rx, ry, m, opts) {
    return fill(c, [cx - rx, cy - ry, cx + rx, cy + ry], (x, y) => {
      const nx = (x - cx) / rx, ny = (y - cy) / ry, q = nx * nx + ny * ny;
      return q <= 1 ? [nx, ny, Math.sqrt(1 - q)] : null;
    }, m, opts);
  }
  function rr(c, x0, y0, x1, y1, r, m, opts) {
    const cx = (x0 + x1 + 1) / 2, hw = (x1 - x0 + 1) / 2;
    return fill(c, [x0, y0, x1, y1], (x, y) => {
      if (x < x0 || x > x1 + 1 || y < y0 || y > y1 + 1) return null;
      const dx = Math.max(x0 + r - x, 0, x - (x1 + 1 - r)), dy = Math.max(y0 + r - y, 0, y - (y1 + 1 - r));
      if (r && dx * dx + dy * dy > r * r) return null;
      const nx = Math.max(-0.98, Math.min(0.98, (x - cx) / hw));
      return [nx, 0.05, Math.sqrt(Math.max(0, 1 - nx * nx - 0.0025))];
    }, m, opts);
  }
  function poly(c, pts, m, opts) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const cx = (box[0] + box[2]) / 2, hw = (box[2] - box[0]) / 2 + 0.5;
    return fill(c, box, (x, y) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (!inside) return null;
      const nx = Math.max(-0.95, Math.min(0.95, (x - cx) / hw));
      return [nx, 0.05, Math.sqrt(1 - nx * nx)];
    }, m, opts);
  }
  function line(c, x0, y0, x1, y1, m, tone) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (typeof m === 'string') c.px(x0, y0, m); else c.set(x0, y0, m, tone);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // ---------- фигура (чиби) ----------
  function geo(g) {
    const f = g === 'f';
    return {
      f,
      H: { cx: 32, cy: 19, rx: 13.5, ry: 12.5 },
      tx0: f ? 23 : 22, tx1: f ? 40 : 41, ty0: 32, ty1: 46,
      ax0: f ? 18 : 17, ax1: f ? 21 : 20, bx0: f ? 42 : 43, bx1: f ? 45 : 46, ay0: 33, ay1: 45,
      lx0: 24, lx1: 30, rx0: 33, rx1: 39, ly0: 46, ly1: 57,
    };
  }

  // Форма туловища (общая для тела и одежды). grow — насколько одежда шире тела.
  function torsoShape(c, G, m, opts) {
    opts = opts || {};
    const g = opts.grow || 0, y0 = G.ty0 - (opts.up || 0), y1 = opts.bottom || G.ty1;
    if (G.f && !opts.straight) {
      // границы многоугольника — по краям пикселей: правая и нижняя на 1 больше номера последнего пикселя,
      // иначе фигура получается на пиксель уже справа и короче снизу, чем у прямоугольного туловища
      const L = G.tx0 - g, R = G.tx1 + 1 + g, B = y1 + 1;
      // срез углов задан с дробным запасом, чтобы точки ровно на границе слева и справа считались одинаково
      return poly(c, [[L, y0 + 2.2], [L + 2.2, y0], [R - 2.2, y0], [R, y0 + 2.2], [R - 1, 40.5],
        [R, B], [L, B], [L + 1, 40.5]], m, Object.assign({ edge: true }, opts));
    }
    return rr(c, G.tx0 - g, y0, G.tx1 + g, y1, 3, m, Object.assign({ edge: true }, opts));
  }

  function drawBody(c, k) {
    const G = k.G, skin = mat(k.skin, true), H = G.H;
    const S = { edge: true, soft: true };
    // плечи (часть туловища) под верхом рук: когда рука поднимается, плечо остаётся на месте
    c.cur = P.torso; rr(c, G.ax0, G.ay0, G.ax1 + 1, G.ay0 + 4, 2, skin, S); rr(c, G.bx0 - 1, G.ay0, G.bx1, G.ay0 + 4, 2, skin, S);
    c.cur = P.legl; rr(c, G.lx0, G.ly0, G.lx1, G.ly1, 2, skin, S); ell(c, 26.5, 59, 4, 2.2, skin, S);
    c.cur = P.legr; rr(c, G.rx0, G.ly0, G.rx1, G.ly1, 2, skin, S); ell(c, 37.5, 59, 4, 2.2, skin, S);
    c.cur = P.larm; rr(c, G.ax0, G.ay0, G.ax1, G.ay1, 2, skin, S); ell(c, G.ax0 + 1.8, G.ay1 + 1.5, 2.6, 2.4, skin, S);
    c.cur = P.rarm; rr(c, G.bx0, G.ay0, G.bx1, G.ay1, 2, skin, S); ell(c, G.bx0 + 2.2, G.ay1 + 1.5, 2.6, 2.4, skin, S);
    c.cur = P.torso; torsoShape(c, G, skin, { soft: true });
    // шея относится к туловищу и лежит в тени под подбородком: так подбородок
    // не сливается с шеей, когда голова наклоняется в танце
    c.cur = P.torso;
    rr(c, 29, 27, 34, 33, 1, skin, { minTone: 3, maxTone: 3 });
    c.cur = P.head;
    ell(c, H.cx - H.rx + 0.5, H.cy + 2, 2.4, 3.2, skin, S);
    ell(c, H.cx + H.rx - 0.5, H.cy + 2, 2.4, 3.2, skin, S);
    const faceMask = ell(c, H.cx, H.cy, H.rx, H.ry, skin, S);
    // чёткая линия подбородка: нижний край лица — цветом контура кожи
    faceMask.forEach((i) => { if (YI(i) >= H.cy + 6 && !faceMask.has(i + N)) { c.m[i] = skin; c.t[i] = 3; c.raw[i] = skin.out; c.own[P.head].raw[i] = skin.out; } });
    drawFace(c, k);
  }

  function drawFace(c, k) {
    const G = k.G;
    const [eh, es, el] = hsl(k.eye);
    const pupil = fromHsl(eh, es, Math.max(0.08, el - 0.32));
    const irisLow = fromHsl(eh, es, Math.min(0.85, el + 0.18));
    const lid = '#2a1d26';
    const eye = (x0, mirror) => {
      ['LLLL', 'IIIW', 'IPPI', 'IPPI', 'iIIi'].forEach((row, dy) => [...row].forEach((ch, dx) => {
        const xx = mirror ? x0 + 3 - dx : x0 + dx;
        const col = { L: lid, I: k.eye, P: pupil, W: '#ffffff', i: irisLow }[ch];
        if (col) c.px(xx, 19 + dy, col);
      }));
      // у девушек — аккуратная «стрелка» ресниц, уходящая вверх от внешнего уголка
      if (G.f) { const d = mirror ? 1 : -1, ox = mirror ? x0 + 4 : x0 - 1; c.px(ox, 19, lid); c.px(ox + d, 18, lid); }
    };
    eye(24, false);
    eye(36, true);
    if (G.f) {
      // тонкие мягко изогнутые брови, чуть светлее волос
      const [bh, bs, bl] = hsl(k.brow);
      const fb = fromHsl(bh, bs * 0.8, Math.min(0.75, bl + 0.12));
      c.pts([[23, 16], [24, 15], [25, 15], [26, 15], [27, 16]], fb);
      c.pts([[40, 16], [39, 15], [38, 15], [37, 15], [36, 16]], fb);
    } else {
      c.pts([[24, 16], [25, 16], [26, 16], [27, 17]], k.brow);
      c.pts([[39, 16], [38, 16], [37, 16], [36, 17]], k.brow);
    }
    c.px(32, 24, mat(k.skin, true).t[2]);
    c.pts([[30, 27], [31, 28], [32, 28], [33, 27]], G.f ? '#c4566a' : '#a8524c');
    const blush = G.f ? '#f4a3a8' : '#eeb0a0';
    c.pts([[22, 25], [23, 25], [40, 25], [41, 25]], blush);
  }

  // ---------- заготовки одежды ----------

  // Рукава: len — 'short' (до локтя не доходят), 'mid', 'long'. wide — расширение книзу.
  function sleeves(c, G, m, len, opts) {
    opts = opts || {};
    const y1 = len === 'long' ? G.ay1 : len === 'mid' ? G.ay0 + 8 : G.ay0 + 5;
    const w = opts.wide || 0;
    // плечи одежды (туловище) под верхом рукавов — видны, когда рука поднимается
    c.cur = P.torso;
    rr(c, G.ax0 - 1, G.ay0, G.ax1 + 1, G.ay0 + 4, 2, m, { edge: true });
    rr(c, G.bx0 - 1, G.ay0, G.bx1 + 1, G.ay0 + 4, 2, m, { edge: true });
    c.cur = P.larm;
    if (w) poly(c, [[G.ax0 - 1, G.ay0], [G.ax1 + 2, G.ay0], [G.ax1 + 2, y1 + 1], [G.ax0 - 1 - w, y1 + 1]], m, { edge: true });
    else rr(c, G.ax0 - 1, G.ay0, G.ax1 + 1, y1, 2, m, { edge: true });
    c.cur = P.rarm;
    if (w) poly(c, [[G.bx0 - 1, G.ay0], [G.bx1 + 2, G.ay0], [G.bx1 + 2 + w, y1 + 1], [G.bx0 - 1, y1 + 1]], m, { edge: true });
    else rr(c, G.bx0 - 1, G.ay0, G.bx1 + 1, y1, 2, m, { edge: true });
    if (opts.cuff) {
      c.cur = P.larm; line(c, G.ax0 - 1 - w, y1, G.ax1 + 1, y1, opts.cuff, 1);
      c.cur = P.rarm; line(c, G.bx0 - 1, y1, G.bx1 + 1 + w, y1, opts.cuff, 1);
    }
    c.cur = P.torso;
  }
  // Круглый вырез (видна кожа шеи).
  function neckRound(c, k, m) {
    ell(c, 32, 31.5, 3.5, 2.2, mat(k.skin, true), { minTone: 2 });
    if (m) line(c, 29, 33, 35, 33, m, 3);
  }
  // Пояс брюк и штанины. bottom — нижний край штанин; widen — шире ноги; flare — расклёш внизу.
  function trousers(c, G, m, bottom, opts) {
    opts = opts || {};
    const w = opts.widen || 0, fl = opts.flare || 0;
    c.cur = P.torso; rr(c, G.tx0 + 1, 44, G.tx1 - 1, 48, 1, m, { edge: true });
    c.cur = P.legl;
    if (fl) poly(c, [[G.lx0 - 1 - w, 46], [G.lx1 + 2, 46], [G.lx1 + 2, bottom + 1], [G.lx0 - 1 - w - fl, bottom + 1]], m, { edge: true });
    else rr(c, G.lx0 - 1 - w, 46, G.lx1 + 1, bottom, 1, m, { edge: true });
    c.cur = P.legr;
    if (fl) poly(c, [[G.rx0 - 1, 46], [G.rx1 + 2 + w, 46], [G.rx1 + 2 + w + fl, bottom + 1], [G.rx0 - 1, bottom + 1]], m, { edge: true });
    else rr(c, G.rx0 - 1, 46, G.rx1 + 1 + w, bottom, 1, m, { edge: true });
    c.cur = P.torso;
  }
  // Юбка: от пояса до bottom, расширение flare.
  function skirt(c, G, m, bottom, flare, opts) {
    c.cur = P.torso;
    return poly(c, [[G.tx0 + 1, 44], [G.tx1, 44], [G.tx1 + flare, bottom], [G.tx0 + 1 - flare, bottom]], m, Object.assign({ edge: true }, opts));
  }
  // Обувь на обеих ногах. top — верх (56 — обычная, меньше — высокая), sole — цвет подошвы.
  // Обычная обувь начинается чуть ниже края штанин (с y=57, верх скруглён), поэтому
  // штанина лежит на ботинке, а не «проходит сквозь» него. Правая нога — под правой штаниной.
  function shoes(c, m, top, sole, each) {
    [[P.legl, 22, 31], [P.legr, 32, 41]].forEach(([part, x0, x1], i) => {
      c.cur = part;
      if (top < 56) rr(c, x0 + 1, top, x1 - 1, 58, 2, m, { edge: true });
      rr(c, x0, top < 56 ? 56 : 57, x1, 60, 2, m, { edge: true });
      if (sole) line(c, x0, 61, x1, 61, mat(sole), 1);
      if (each) each(x0, x1, i);
    });
    c.cur = P.torso;
  }
  // Шапка волос с чёлкой. fringe(x) — нижний край чёлки (y), extra — насколько волосы шире головы.
  function hairCap(c, k, opts) {
    opts = opts || {};
    const h = opts.mat || mat(k.hair), H = k.G.H, ex = opts.extra || 1;
    const top = H.cy - H.ry - (opts.lift || 2);
    c.cur = P.head;
    fill(c, [H.cx - H.rx - ex, top, H.cx + H.rx + ex, H.cy + (opts.down || 1)], (x, y) => {
      const nx = (x - H.cx) / (H.rx + ex), ny = (y - (H.cy + 1)) / (H.ry + 2.5 + (opts.lift || 2) - 2);
      if (nx * nx + ny * ny > 1) return null;
      const fr = opts.fringe ? opts.fringe(x) : H.cy - 6;
      if (y > fr && Math.abs(x - H.cx) < H.rx - (opts.side || 2.5)) return null;
      return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))];
    }, h, { edge: 'bottom' });
    return h;
  }
  // Блики и пряди на волосах.
  function hairShine(c, h, list) { list.forEach(([x, y]) => c.set(x, y, h, 0)); }
  function strands(c, h, list) { list.forEach(([a, b, d, e]) => line(c, a, b, d, e, h, 2)); }
  // ---------- причёски: мягкий объём, пряди и блик ----------
  // Волосы строятся из «массы» (округлая шапка чуть больше головы), чёлки из заострённых
  // прядей, прядей по бокам лица и (у длинных) волос за спиной, которые рисуются до тела.

  // Линия чёлки по точкам [x, y]: между точками — прямые, кончики прядей острые.
  function fringeLine(pts) {
    return (x) => {
      if (x <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      }
      return pts[pts.length - 1][1];
    };
  }
  // Чёлка «пёрышками»: n прядей между x0 и x1. Каждая прядь — мягкий острый язычок:
  // у корня (root) широкий, к кончику (tip ± разброс) сужается. lean — наклон кончиков.
  function feathers(x0, x1, n, root, tip, jitter, lean) {
    const w = (x1 - x0) / n;
    return (x) => {
      if (x < x0 || x > x1) return root - 1;
      const i = Math.min(n - 1, Math.floor((x - x0) / w));
      const tj = jitter ? [0, -jitter, jitter * 0.5][i % 3] : 0;
      const c0 = x0 + (i + 0.5 + (lean || 0) * 0.5) * w;
      const uu = Math.min(1, Math.abs(x - c0) / (w * 0.62));
      return root + (tip + tj - root) * (1 - Math.pow(uu, 1.5));
    };
  }

  // Основная форма волос. o: rx, ry, cy — размер «массы»; fringe(x) — нижний край чёлки;
  // side — до какой высоты спускаются пряди у висков; sideIn — насколько они заходят на лицо;
  // mat — материал (по умолчанию цвет волос); shine — блик-дуга; noFace — не вырезать лицо.
  function hairMass(c, k, o) {
    const H = k.G.H, h = o.mat || mat(k.hair);
    const rx = o.rx || H.rx + 2.5, ry = o.ry || H.ry + 2, cy = o.cy || H.cy - 1.5, cx = H.cx;
    const side = o.side || H.cy + 3, sideIn = o.sideIn !== undefined ? o.sideIn : 10.5;
    const fr = o.fringe || (() => H.cy - 6);
    c.cur = P.head;
    const mask = fill(c, [cx - rx - 1, cy - ry - 1, cx + rx + 1, side + 1], (x, y) => {
      const nx = (x - cx) / rx, ny = (y - cy) / ry;
      const dx = Math.abs(x - cx);
      // выше центра — эллипс, ниже — пряди спускаются прямо вниз
      if (y <= cy ? nx * nx + ny * ny > 1 : Math.abs(nx) > 1 || y > side - Math.max(0, (dx - (rx - 2.5))) * 1.5) return null;
      if (!o.noFace && dx < sideIn && y > fr(x)) return null;
      // кончики боковых прядей сужаются
      if (y > side - 3 && dx < sideIn + (side - y) * 0.2 + 0.5 && y > fr(x)) return null;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - Math.min(1, ny * ny) * (y <= cy ? 1 : 0)));
      return [nx, y <= cy ? ny : 0.2, nz];
    }, h, { edge: 'bottom', edgeTone: 3 });
    // волосы на границе с кожей — тёмная кромка (снизу — темнее, по бокам — мягче)
    const skinM = mat(k.skin, true);
    const edgeT = [];
    mask.forEach((i) => {
      if (c.m[i] !== h) return;
      if (c.m[i + N] === skinM) edgeT.push([i, 3]);
      else if (c.m[i - 1] === skinM || c.m[i + 1] === skinM) edgeT.push([i, 2]);
    });
    edgeT.forEach(([i, tn]) => { c.t[i] = Math.max(c.t[i], tn); });
    // блик-дуга на макушке
    if (o.shine !== false) {
      const R = rx - 4, bx = cx - 1.5, by = cy + 2.5;
      mask.forEach((i) => {
        const x = i % N, y = YI(i);
        if (y > cy - 3 || c.m[i] !== h) return;
        const d = Math.hypot(x + 0.5 - bx, (y + 0.5 - by) * 1.15);
        if (Math.abs(d - R) < 0.75 && (x + y) % 5 !== 0) c.t[i] = 0;
      });
    }
    return { h, mask, fr, rx, ry, cy };
  }

  // Пряди-линии от пробора к краям (тон тени).
  function partLines(c, h, px, top, list) {
    list.forEach(([x, y]) => {
      line(c, px, top, x, y, h, 2);
    });
  }

  // Волосы за спиной (рисуются до тела, поэтому туловище и руки оказываются впереди).
  // bottom — нижний край, w — половина ширины, wave — волнистый низ.
  function backHair(c, k, bottom, w, o) {
    o = o || {};
    const H = k.G.H, h = o.mat || mat(k.hair), cx = H.cx;
    c.cur = P.head;
    const mask = fill(c, [cx - w - 1, H.cy - 2, cx + w + 1, bottom + 2], (x, y) => {
      const dx = Math.abs(x - cx);
      // верх скруглён: при наклоне головы из-под неё не выглядывает квадратный угол
      const topY = H.cy - 2 + Math.max(0, dx - (w - 6)) * 1.1;
      if (y < topY) return null;
      const wv = o.wave ? Math.sin(x * 0.9) * 1.6 : 0;
      const b = bottom + wv - Math.max(0, dx - w + 3) * 1.4 - (o.point ? Math.abs(Math.sin(x * 0.75)) * 2.5 : 0);
      if (dx > w || y > b) return null;
      const nx = (x - cx) / w;
      return [nx, 0.1, Math.sqrt(Math.max(0, 1 - nx * nx))];
    }, h, { edge: true, edgeTone: 3, minTone: 1 });
    // нижняя часть волос за спиной двигается с туловищем, а не с головой
    // (иначе при наклоне головы в танце волосы «разлетаются» за руки и ноги)
    // волосы за спиной двигаются с туловищем: при наклоне головы не «разлетаются»,
    // а когда руки поднимаются, за ними видна целая прядь (её пиксели хранятся под руками)
    mask.forEach((i) => c.reassign(i, P.torso));
    // пряди вдоль волос
    for (let x = cx - w + 3; x <= cx + w - 3; x += 4) {
      for (let y = H.cy + 4; y < bottom - 3; y++) {
        const i = IX(Math.round(x + (x < cx ? -1 : 1) * (y - H.cy) / (bottom - H.cy)), y);
        if (mask.has(i)) c.t[i] = 2;
      }
    }
    return mask;
  }

  // Прядь, лежащая на плече спереди: от виска вниз до bottom, ширина w, side: −1 слева, 1 справа.
  function frontLock(c, k, side, bottom, w, o) {
    o = o || {};
    const H = k.G.H, h = o.mat || mat(k.hair);
    const x0 = side < 0 ? H.cx - H.rx - 2 : H.cx + H.rx + 2 - w;
    c.cur = P.head;
    const pts = [[x0, H.cy - 2], [x0 + w, H.cy - 2], [x0 + w + side * 0.5, bottom - 3], [x0 + w / 2 + side, bottom], [x0 - side * 0.5, bottom - 3]];
    poly(c, pts, h, { edge: true, edgeTone: 2 });
    line(c, x0 + w / 2, H.cy + 2, x0 + w / 2 + side, bottom - 3, h, 2);
    if (o.wave) for (let y = H.cy + 3; y < bottom - 2; y += 4) c.set(side < 0 ? x0 + 1 : x0 + w - 1, y, h, 2);
  }

  // Шапка/головной убор по форме головы, до высоты yBottom.
  function headwear(c, k, m, yBottom, lift) {
    const H = k.G.H;
    c.cur = P.head;
    return fill(c, [H.cx - H.rx - 1.5, H.cy - H.ry - (lift || 3), H.cx + H.rx + 1.5, yBottom], (x, y) => {
      const nx = (x - H.cx) / (H.rx + 1.5), ny = (y - (H.cy - 2)) / (H.ry + 1 + (lift || 3) - 3);
      return nx * nx + ny * ny <= 1 && y <= yBottom ? [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))] : null;
    }, m, { edge: true });
  }

  const GOLD = '#e8c547', WHITE = '#f6f7fb', DARK = '#2a2a32';

  // ---------- каталог вещей ----------
  // rarity: base (бесплатная), common, rare, legendary; style: base, sport, classic, street, fantasy.
  // pal: цвета для перекраски (первый — основной). Причёски без pal красятся цветом волос.

  const ITEMS = [
    // ===================== ПРИЧЁСКИ =====================
    { id: 'hair_short', cat: 'hair', name: 'Короткая', en: 'Short', style: 'base', rarity: 'base', price: 0,
      draw(c, k) {
        const H = k.G.H;
        const r = hairMass(c, k, { fringe: feathers(20, 44, 4, H.cy - 9, H.cy - 3, 1, 0.2), side: H.cy + 3, sideIn: 11 });
        partLines(c, r.h, 30, 5, [[22, 12], [26, 9], [36, 9], [41, 12]]);
      } },
    { id: 'hair_long', cat: 'hair', name: 'Длинная', en: 'Long', style: 'base', rarity: 'base', price: 0,
      back(c, k) { backHair(c, k, 45, 18.5, { wave: true }); },
      draw(c, k) {
        const H = k.G.H;
        const r = hairMass(c, k, { fringe: feathers(20, 44, 4, H.cy - 9, H.cy - 2, 1.5, -0.2), side: H.cy + 9, sideIn: 10.5 });
        partLines(c, r.h, 33, 5, [[23, 12], [27, 9], [38, 9], [42, 13]]);
      } },
    { id: 'hair_twintails', cat: 'hair', name: 'Высокие хвостики', en: 'High twin tails', style: 'street', rarity: 'common', price: 320,
      draw(c, k) {
        const H = k.G.H, h = mat(k.hair);
        c.cur = P.head;
        // хвостики, перехваченные резинками, падают волной
        [-1, 1].forEach((sd) => {
          const x = sd < 0 ? 15 : 49;
          poly(c, [[x - sd * 3, 9], [x + sd * 4, 10], [x + sd * 5, 20], [x + sd * 3, 30], [x + sd * 0.5, 36], [x - sd * 1.5, 28], [x - sd * 0.5, 18]], h, { edge: true, edgeTone: 3 });
          line(c, x + sd, 12, x + sd * 2, 30, h, 2);
          c.set(x + sd * 3, 14, h, 0); c.set(x + sd * 3, 15, h, 0);
        });
        const r = hairMass(c, k, { fringe: feathers(20, 44, 4, H.cy - 9, H.cy - 2, 1.5, 0), side: H.cy + 6, sideIn: 10.5 });
        partLines(c, r.h, 32, 5, [[20, 10], [44, 10]]);
        // резинки-звёздочки
        [[19, 9], [44, 9]].forEach(([x, y]) => { c.pts([[x, y - 1], [x - 1, y], [x, y], [x + 1, y], [x, y + 1]], '#ffd84a'); c.px(x, y, '#fff6c2'); });
      } },
    { id: 'hair_buzz', cat: 'hair', name: 'Бокс', en: 'Buzz cut', style: 'sport', rarity: 'common', price: 100,
      draw(c, k) {
        const H = k.G.H;
        // короткий ёжик по форме головы: без чёлки, мягкая линия роста волос
        const r = hairMass(c, k, { rx: H.rx + 0.8, ry: H.ry + 0.8, cy: H.cy - 0.5, fringe: fringeLine([[18, H.cy - 6], [26, H.cy - 8], [32, H.cy - 8.5], [38, H.cy - 8], [46, H.cy - 6]]), side: H.cy - 1, sideIn: 12, shine: false });
        r.mask.forEach((i) => { const x = i % N, y = YI(i); if ((x * 3 + y * 5) % 7 === 0 && c.t[i] < 3) c.t[i] = Math.min(3, c.t[i] + 1); });
      } },
    { id: 'hair_spiky', cat: 'hair', name: 'Ёжик', en: 'Spiky', style: 'street', rarity: 'common', price: 150,
      draw(c, k) {
        const H = k.G.H, h = mat(k.hair);
        c.cur = P.head;
        // торчащие вверх пряди-шипы
        [[19, 8], [23, 4], [28, 1], [33, 0], [38, 2], [42, 5], [46, 9]].forEach(([x, y], i) => {
          const lean = (x - 32) * 0.12;
          poly(c, [[x - 3.5, y + 9], [x + 3.5, y + 9], [x + lean + 0.5, y], [x + lean - 0.5, y]], h, { edge: true, edgeTone: 2 });
          void i;
        });
        hairMass(c, k, { fringe: feathers(20, 44, 5, H.cy - 9, H.cy - 4, 1, 0.3), side: H.cy + 2, sideIn: 11.5 });
      } },
    { id: 'hair_side', cat: 'hair', name: 'Чёлка набок', en: 'Side part', style: 'classic', rarity: 'common', price: 180,
      draw(c, k) {
        const H = k.G.H;
        // косой пробор: чёлка зачёсана вправо и спускается к брови
        const r = hairMass(c, k, { fringe: fringeLine([[18, H.cy - 3], [22, H.cy - 6], [26, H.cy - 8], [30, H.cy - 7], [34, H.cy - 5], [38, H.cy - 3], [42, H.cy - 2], [46, H.cy]]), side: H.cy + 3, sideIn: 11 });
        line(c, 26, 5, 26, 9, r.h, 3);
        partLines(c, r.h, 26, 6, [[34, H.cy - 6], [38, H.cy - 5], [42, H.cy - 4], [21, 10]]);
      } },
    { id: 'hair_curly', cat: 'hair', name: 'Кудри', en: 'Curly', style: 'classic', rarity: 'common', price: 200,
      back(c, k) {
        const H = k.G.H, h = mat(k.hair);
        // пышные локоны у плеч (двигаются с головой и не торчат отдельно от причёски)
        [[17, 29], [47, 29], [18, 33], [46, 33]].forEach(([x, y]) => ell(c, x, y, 4.2, 3.6, h, { edge: true, edgeTone: 3 }));
        void H;
      },
      draw(c, k) {
        const H = k.G.H;
        const r = hairMass(c, k, { rx: H.rx + 3.5, ry: H.ry + 2.5, fringe: feathers(20, 44, 4, H.cy - 9, H.cy - 3, 1, 0.2), side: H.cy + 8, sideIn: 11 });
        // завитки по краю
        [[16, 15], [48, 15], [17, 22], [47, 22], [21, 7], [43, 7], [28, 4], [36, 4]].forEach(([x, y], i) => {
          ell(c, x, y, 2.8, 2.6, r.h, { edge: true, edgeTone: 3 });
          c.set(x - 1, y - 1, r.h, 0);
          if (i < 4) c.set(x, y + 1, r.h, 3);
        });
        for (let i = 0; i < 6; i++) { const x = 22 + i * 4, y = 7 + (i % 2) * 2; c.set(x, y, r.h, 2); c.set(x + 1, y + 1, r.h, 2); }
      } },
    { id: 'hair_bun', cat: 'hair', name: 'Пучок', en: 'Bun', style: 'classic', rarity: 'common', price: 220,
      draw(c, k) {
        const H = k.G.H;
        const h = mat(k.hair);
        c.cur = P.head;
        ell(c, 32, 3.2, 5.5, 3.6, h, { edge: true, edgeTone: 3 });
        line(c, 29, 3, 33, 2, h, 2); line(c, 31, 5, 35, 4, h, 2); c.set(30, 1, h, 0); c.set(31, 1, h, 0);
        const r = hairMass(c, k, { fringe: feathers(21, 43, 4, H.cy - 9, H.cy - 5, 1, 0.1), side: H.cy + 2, sideIn: 11.5 });
        partLines(c, r.h, 32, 5, [[22, 12], [27, 10], [37, 10], [42, 12]]);
        line(c, 28, 6, 36, 6, mat('#e85a7a'), 1);
      } },
    { id: 'hair_ponytail', cat: 'hair', name: 'Хвостик', en: 'Ponytail', style: 'sport', rarity: 'common', price: 250,
      back(c, k) {
        const h = mat(k.hair);
        // хвост, выглядывающий сбоку из-за головы
        poly(c, [[42, 8], [48, 11], [50, 20], [48, 30], [45, 36], [44, 26], [44, 16]], h, { edge: true, edgeTone: 3 });
        line(c, 47, 13, 47, 30, h, 2);
      },
      draw(c, k) {
        const H = k.G.H;
        const r = hairMass(c, k, { fringe: feathers(20, 44, 4, H.cy - 9, H.cy - 3, 1, -0.2), side: H.cy + 3, sideIn: 11 });
        partLines(c, r.h, 32, 5, [[22, 12], [42, 9], [44, 11]]);
        c.pts([[44, 9], [45, 10], [44, 10], [45, 9]], '#e74c3c');
      } },
    { id: 'hair_pigtails', cat: 'hair', name: 'Два хвостика', en: 'Pigtails', style: 'sport', rarity: 'common', price: 280,
      draw(c, k) {
        const H = k.G.H, h = mat(k.hair);
        c.cur = P.head;
        // низкие хвостики за ушами
        [-1, 1].forEach((sd) => {
          const x = sd < 0 ? 16 : 48;
          poly(c, [[x - sd * 2, 20], [x + sd * 3, 22], [x + sd * 4, 30], [x + sd * 2, 37], [x, 39], [x - sd * 1.5, 31]], h, { edge: true, edgeTone: 3 });
          line(c, x + sd, 23, x + sd * 2, 35, h, 2);
        });
        const r = hairMass(c, k, { fringe: feathers(20, 44, 4, H.cy - 9, H.cy - 2, 1.5, 0), side: H.cy + 4, sideIn: 10.5 });
        partLines(c, r.h, 32, 5, [[20, 14], [44, 14]]);
        c.pts([[17, 21], [18, 21], [45, 21], [46, 21]], '#ec6fae');
      } },
    { id: 'hair_afro', cat: 'hair', name: 'Афро', en: 'Afro', style: 'street', rarity: 'common', price: 300,
      draw(c, k) {
        const H = k.G.H, h = mat(k.hair);
        c.cur = P.head;
        // пышное облако из мягких завитков, лицо открыто
        [[15, 14], [49, 14], [16, 22], [48, 22], [19, 6], [45, 6], [25, 2], [32, 1], [39, 2]].forEach(([x, y]) => ell(c, x, y, 5, 4.6, h, { edge: true, edgeTone: 3 }));
        const r = hairMass(c, k, { rx: H.rx + 5, ry: H.ry + 4, cy: H.cy - 2, fringe: feathers(20, 44, 5, H.cy - 9, H.cy - 6, 0.8, 0), side: H.cy + 6, sideIn: 11, shine: false });
        r.mask.forEach((i) => { const x = i % N, y = YI(i); if ((x * 7 + y * 11) % 13 === 0 && c.t[i] < 3) c.t[i] = 2; if ((x * 5 + y * 3) % 17 === 0) c.t[i] = 0; });
      } },
    { id: 'hair_mohawk', cat: 'hair', name: 'Ирокез', en: 'Mohawk', style: 'street', rarity: 'common', price: 350,
      draw(c, k) {
        const H = k.G.H, h = mat(k.hair);
        // выбритые виски (тёмная щетина) и высокий гребень посередине
        const [hh, hs, hl] = hsl(k.hair);
        const stub = mat(fromHsl(hh, hs * 0.5, Math.min(0.85, hl * 0.5 + 0.35)), true);
        hairMass(c, k, { mat: stub, rx: H.rx + 0.6, ry: H.ry + 0.6, cy: H.cy - 0.5, fringe: () => H.cy - 8, side: H.cy - 1, sideIn: 12, shine: false });
        c.cur = P.head;
        poly(c, [[28.5, 12], [35.5, 12], [37, 4], [35, 0], [33, 0], [29, 2]], h, { edge: true, edgeTone: 2 });
        line(c, 32, 1, 33, 10, h, 2); c.set(31, 3, h, 0); c.set(31, 4, h, 0); c.set(30, 6, h, 0);
      } },
    { id: 'hair_topknot', cat: 'hair', name: 'Самурайский пучок', en: 'Topknot', style: 'fantasy', rarity: 'rare', price: 650,
      draw(c, k) {
        const H = k.G.H, h = mat(k.hair);
        c.cur = P.head;
        ell(c, 32, 3, 3.2, 3, h, { edge: true, edgeTone: 3 });
        const r = hairMass(c, k, { fringe: fringeLine([[18, H.cy - 2], [22, H.cy - 5], [26, H.cy - 9], [38, H.cy - 9], [42, H.cy - 5], [46, H.cy - 2]]), side: H.cy + 4, sideIn: 11 });
        rr(c, 30, 5, 34, 6, 0, mat('#c0392b'), {});
        partLines(c, r.h, 32, 7, [[22, 13], [26, 10], [38, 10], [42, 13]]);
        // свободные пряди у висков
        line(c, 21, 12, 20, 22, r.h, 2); line(c, 43, 12, 44, 22, r.h, 2);
      } },
    { id: 'hair_bob', cat: 'hair', name: 'Каре', en: 'Bob', style: 'classic', rarity: 'rare', price: 600,
      draw(c, k) {
        const H = k.G.H;
        // ровная густая чёлка и волосы до подбородка, кончики подкручены внутрь
        const r = hairMass(c, k, { rx: H.rx + 3, ry: H.ry + 2.5, fringe: feathers(20, 44, 6, H.cy - 7, H.cy - 3, 0.5, 0), side: H.cy + 11, sideIn: 10 });
        [[18, H.cy + 10], [45, H.cy + 10]].forEach(([x, y]) => { c.set(x, y, r.h, 3); c.set(x + (x < 32 ? 1 : -1), y + 1, r.h, 3); });
        partLines(c, r.h, 32, 4, [[22, 11], [27, 8], [37, 8], [42, 11]]);
      } },
    { id: 'hair_wavy', cat: 'hair', name: 'Длинные волны', en: 'Long waves', style: 'classic', rarity: 'rare', price: 700,
      back(c, k) { backHair(c, k, 48, 19, { wave: true }); },
      draw(c, k) {
        const H = k.G.H;
        const r = hairMass(c, k, { fringe: fringeLine([[18, H.cy - 2], [22, H.cy - 5], [27, H.cy - 8], [31, H.cy - 9], [35, H.cy - 6], [39, H.cy - 4], [43, H.cy - 2], [46, H.cy]]), side: H.cy + 10, sideIn: 10.5 });
        partLines(c, r.h, 31, 5, [[22, 12], [37, 8], [42, 12]]);
      } },
    { id: 'hair_braids', cat: 'hair', name: 'Косички', en: 'Braids', style: 'street', rarity: 'rare', price: 800,
      back(c, k) { backHair(c, k, 42, 17.5, { point: true }); },
      draw(c, k) {
        const H = k.G.H;
        const r = hairMass(c, k, { fringe: feathers(20, 44, 5, H.cy - 9, H.cy - 4, 1, 0), side: H.cy + 4, sideIn: 11 });
        // тонкие косички спереди по бокам
        [15, 18, 45, 48].forEach((x) => {
          for (let y = H.cy - 2; y <= 42; y += 2) { c.set(x, y, r.h, 1); c.set(x + 1, y, r.h, 2); c.set(x, y + 1, r.h, 2); c.set(x + 1, y + 1, r.h, 3); }
          c.pts([[x, 43], [x + 1, 43]], '#e7b23c');
        });
        partLines(c, r.h, 32, 5, [[22, 12], [42, 12]]);
      } },
    { id: 'hair_elf', cat: 'hair', name: 'Эльфийские волосы', en: 'Elven hair', style: 'fantasy', rarity: 'rare', price: 1000,
      back(c, k) { backHair(c, k, 50, 18.5, { point: true }); },
      draw(c, k) {
        const H = k.G.H;
        // острые уши выглядывают из-под волос
        const sk = mat(k.skin, true);
        const r = hairMass(c, k, { fringe: fringeLine([[18, H.cy - 1], [22, H.cy - 4], [27, H.cy - 8], [30, H.cy - 9], [32, H.cy - 7], [34, H.cy - 9], [37, H.cy - 8], [42, H.cy - 4], [46, H.cy - 1]]), side: H.cy + 12, sideIn: 11.5 });
        c.cur = P.head;
        poly(c, [[16, 18], [11, 12], [17, 23]], sk, { edge: true, soft: true }); poly(c, [[48, 18], [53, 12], [47, 23]], sk, { edge: true, soft: true });
        // обруч с камнем
        line(c, 20, 11, 44, 11, mat('#e8c547'), 0); ell(c, 32, 11, 1.6, 1.3, mat('#3ec1d3'), { tone: 0 });
        partLines(c, r.h, 32, 5, [[22, 13], [42, 13]]);
      } },
    { id: 'hair_messy', cat: 'hair', name: 'Растрёпанные', en: 'Messy', style: 'street', rarity: 'common', price: 230,
      draw(c, k) {
        const H = k.G.H, h = mat(k.hair);
        c.cur = P.head;
        // торчащие во все стороны пряди, будто только проснулся
        [[17, 11, -1], [20, 5, -1], [27, 2, -0.4], [35, 1, 0.5], [42, 4, 1], [47, 10, 1], [48, 18, 1], [16, 18, -1]].forEach(([x, y, d]) => {
          poly(c, [[x - 2.5 - d, y + 6], [x + 2.5 - d, y + 6], [x + d * 2, y]], h, { edge: true, edgeTone: 2 });
        });
        const r = hairMass(c, k, { fringe: feathers(19, 45, 5, H.cy - 9, H.cy - 2, 2.5, 0.35), side: H.cy + 4, sideIn: 11 });
        partLines(c, r.h, 30, 5, [[21, 10], [26, 8], [37, 8], [43, 11], [33, 6]]);
      } },
    { id: 'hair_emo', cat: 'hair', name: 'Неформальная чёлка', en: 'Emo fringe', style: 'street', rarity: 'common', price: 360,
      draw(c, k) {
        const H = k.G.H;
        // длинная косая чёлка закрывает один глаз
        const r = hairMass(c, k, { fringe: fringeLine([[18, H.cy - 3], [22, H.cy - 6], [25, H.cy - 8], [28, H.cy - 6], [31, H.cy - 2], [34, H.cy + 2], [37, H.cy + 4], [39, H.cy + 6], [41, H.cy + 3], [43, H.cy + 5], [46, H.cy + 4]]), side: H.cy + 8, sideIn: 11 });
        partLines(c, r.h, 24, 6, [[34, H.cy + 1], [38, H.cy + 3], [42, H.cy + 3], [29, H.cy - 3]]);
        line(c, 24, 5, 24, 9, r.h, 3);
      } },
    { id: 'hair_wolf', cat: 'hair', name: 'Волчья стрижка', en: 'Wolf cut', style: 'street', rarity: 'rare', price: 620,
      back(c, k) { backHair(c, k, 37, 17, { point: true }); },
      draw(c, k) {
        const H = k.G.H, h = mat(k.hair);
        // многослойная рваная стрижка: объём сверху, пряди-«перья» по бокам
        const r = hairMass(c, k, { rx: H.rx + 3.5, fringe: feathers(19, 45, 5, H.cy - 9, H.cy - 2, 2, -0.3), side: H.cy + 7, sideIn: 11 });
        c.cur = P.head;
        [[15, 24], [17, 28], [47, 28], [49, 24]].forEach(([x, y]) => poly(c, [[x - 2, y - 6], [x + 2, y - 6], [x + (x < 32 ? -1 : 1), y]], h, { edge: true, edgeTone: 2 }));
        partLines(c, r.h, 32, 4, [[21, 11], [26, 8], [38, 8], [43, 11]]);
      } },
    { id: 'hair_messybun', cat: 'hair', name: 'Небрежный пучок', en: 'Messy bun', style: 'street', rarity: 'common', price: 260,
      draw(c, k) {
        const H = k.G.H, h = mat(k.hair);
        c.cur = P.head;
        ell(c, 33, 3.5, 6, 4, h, { edge: true, edgeTone: 3 });
        [[28, 1], [38, 2], [33, -1]].forEach(([x, y]) => line(c, x, y + 2, x + (x < 33 ? -2 : 2), y, h, 2));
        const r = hairMass(c, k, { fringe: feathers(21, 43, 4, H.cy - 9, H.cy - 5, 1.5, 0.2), side: H.cy + 2, sideIn: 11.5 });
        // выбившиеся пряди у лица
        line(c, 21, H.cy - 4, 20, H.cy + 8, r.h, 2); line(c, 43, H.cy - 4, 44, H.cy + 8, r.h, 2);
        line(c, 22, H.cy - 3, 21, H.cy + 6, r.h, 1); line(c, 42, H.cy - 3, 43, H.cy + 6, r.h, 1);
      } },
    { id: 'hair_sideplaits', cat: 'hair', name: 'Косы по бокам', en: 'Side plaits', style: 'classic', rarity: 'rare', price: 750,
      draw(c, k) {
        const H = k.G.H, h = mat(k.hair);
        c.cur = P.head;
        // две толстые косы, перекинутые вперёд через плечи
        [-1, 1].forEach((sd) => {
          const x = sd < 0 ? 18 : 46;
          for (let y = H.cy + 2; y <= 44; y += 4) ell(c, x + (Math.floor(y / 4) % 2 ? sd * 0.6 : 0), y, 3.2, 2.4, h, { edge: true, edgeTone: 3 });
          c.pts([[x - 1, 47], [x, 47], [x + 1, 47]], '#f2f2f2');
          poly(c, [[x - 2, 48], [x + 2, 48], [x, 52]], h, { edge: true, edgeTone: 2 });
        });
        const r = hairMass(c, k, { fringe: feathers(20, 44, 4, H.cy - 9, H.cy - 3, 1, 0), side: H.cy + 4, sideIn: 10.5 });
        partLines(c, r.h, 32, 5, [[20, 16], [44, 16]]);
      } },
    { id: 'hair_fluffy', cat: 'hair', name: 'Пышное каре', en: 'Fluffy bob', style: 'classic', rarity: 'rare', price: 680,
      draw(c, k) {
        const H = k.G.H, h = mat(k.hair);
        // объёмное каре с мягкими завитками на концах
        const r = hairMass(c, k, { rx: H.rx + 4, ry: H.ry + 2.5, fringe: feathers(20, 44, 4, H.cy - 9, H.cy - 2, 1.5, 0.1), side: H.cy + 10, sideIn: 10.5 });
        c.cur = P.head;
        [[16, H.cy + 9], [20, H.cy + 11], [44, H.cy + 11], [48, H.cy + 9]].forEach(([x, y]) => { ell(c, x, y, 2.6, 2.2, h, { edge: true, edgeTone: 3 }); c.set(x - 1, y - 1, h, 0); });
        partLines(c, r.h, 32, 4, [[21, 12], [26, 9], [38, 9], [43, 12]]);
      } },
    { id: 'hair_fire', cat: 'hair', name: 'Огненные волосы', en: 'Fire hair', style: 'fantasy', rarity: 'legendary', price: 3500,
      pal: { F: '#ff5a1f', D: '#d63a12', L: '#ffb43a', T: '#ffe066' },
      draw(c, k, p) {
        const H = k.G.H, F = mat(p.F), Y = mat(p.L);
        const r = hairMass(c, k, { mat: F, fringe: feathers(20, 44, 4, H.cy - 9, H.cy - 3, 1, 0.2), side: H.cy + 3, sideIn: 11 });
        // языки пламени торчат вверх, но целиком помещаются в картинку (кончики не обрезаны)
        c.cur = P.head;
        [[19, 7, 3.5], [24, 3, 3.5], [29, 1, 3.5], [35, 1, 3.5], [40, 3, 3.5], [45, 7, 3.5]].forEach(([x, y, w], i) => {
          const lean = i < 3 ? -1 : 1;
          poly(c, [[x - w, y + 8], [x + w, y + 8], [x + lean, y], [x - lean * 0.5, y + 3]], F, { edge: true, edgeTone: 2 });
          const lx = i < 3 ? x : x - 1; // зеркально: у правых языков жёлтая сердцевина левее середины
          line(c, lx, y + 3, lx, y + 6, Y, 0);
        });
        void r;
        // мерцающие искры над пламенем — два кадра, тоже внутри картинки
        const a = c.layer('fx-a', true), b = c.layer('fx-b', true);
        [19, 24, 29, 35, 40, 45].forEach((x, i) => {
          const y = [7, 3, 1, 1, 3, 7][i];
          const cx = i < 3 ? x : x - 1, out = i < 3 ? -1 : 1; // зеркально относительно середины головы
          a.px(cx + out, Math.max(0, y - 1), p.T); a.px(cx, y + 1, p.L);
          b.px(cx, Math.max(0, y), p.T); b.px(cx - out, y + 2, p.L);
        });
      } },

    // ===================== ВЕРХ =====================
    { id: 'top_tee', cat: 'top', name: 'Базовая футболка', en: 'Basic T-shirt', style: 'base', rarity: 'base', price: 0,
      pal: { C: '#eef1f6', D: '#cfd5df' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        c.cur = P.torso; torsoShape(c, G, m, { bottom: 45 }); neckRound(c, k, m);
        sleeves(c, G, m, 'short');
        line(c, 27, 39, 28, 43, m, 2); line(c, 37, 38, 36, 42, m, 2);
      } },
    { id: 'top_tank', cat: 'top', name: 'Спортивная майка', en: 'Tank top', style: 'sport', rarity: 'common', price: 150,
      pal: { C: '#e74c3c', D: '#b8392c' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), W = mat(WHITE);
        c.cur = P.torso;
        torsoShape(c, G, m, { bottom: 45, up: -2 });
        rr(c, G.tx0 + 2, 31, G.tx0 + 4, 34, 1, m, { edge: true }); rr(c, G.tx1 - 4, 31, G.tx1 - 2, 34, 1, m, { edge: true });
        ell(c, 32, 33.5, 4, 2.4, mat(k.skin, true), { minTone: 2 });
        line(c, G.tx0, 38, G.tx0, 45, W, 1); line(c, G.tx1, 38, G.tx1, 45, W, 1);
        // номер 7
        c.pts([[30, 38], [31, 38], [32, 38], [33, 38], [33, 39], [32, 40], [32, 41], [31, 42], [31, 43]], WHITE);
      } },
    { id: 'top_print', cat: 'top', name: 'Футболка с принтом', en: 'Graphic tee', style: 'street', rarity: 'common', price: 200,
      pal: { C: '#2d2f3a', D: '#22232c' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        c.cur = P.torso; torsoShape(c, G, m, { bottom: 45 }); neckRound(c, k, m);
        sleeves(c, G, m, 'short');
        // ретро-закат
        ell(c, 32, 39.5, 5, 4, mat('#ffb347'), {});
        line(c, 27, 40, 36, 40, '#ff5d73'); line(c, 27, 42, 36, 42, '#ff5d73'); line(c, 27, 44, 36, 44, '#3ec1d3');
      } },
    { id: 'top_polo', cat: 'top', name: 'Поло', en: 'Polo shirt', style: 'sport', rarity: 'common', price: 250,
      pal: { C: '#2f9e8f', D: '#237a6e', L: '#53c1b2' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), L = mat(p.L);
        c.cur = P.torso; torsoShape(c, G, m, { bottom: 45 }); neckRound(c, k);
        poly(c, [[27, 31], [32, 33], [30, 35]], L, { edge: true }); poly(c, [[37, 31], [32, 33], [34, 35]], L, { edge: true });
        line(c, 32, 33, 32, 37, m, 3); c.pts([[31, 35], [31, 37]], WHITE);
        sleeves(c, G, m, 'short', { cuff: L });
      } },
    { id: 'top_stripes', cat: 'top', name: 'Тельняшка', en: 'Striped shirt', style: 'street', rarity: 'common', price: 300,
      pal: { C: '#2c3e7a', D: '#1f2d5c' },
      draw(c, k, p) {
        const G = k.G, W = mat(WHITE), S = mat(p.C);
        c.cur = P.torso; const body = torsoShape(c, G, W, { bottom: 45 });
        sleeves(c, G, W, 'long');
        // полосы по всем деталям
        for (let y = 34; y <= 45; y += 3) {
          for (let x = 12; x <= 52; x++) {
            const i = IX(x, y);
            // меняем только цвет: пиксель остаётся в своей части тела (рукав двигается с рукой)
            if (c.m[i] === W) { c.m[i] = S; c.t[i] = c.t[i] >= 2 ? 2 : 1; }
          }
        }
        neckRound(c, k, S);
        void body;
      } },
    { id: 'top_jersey', cat: 'top', name: 'Футбольная форма', en: 'Football jersey', style: 'sport', rarity: 'common', price: 320,
      pal: { C: '#f5c83a', D: '#cfa52a' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), A = mat('#1e3a8a');
        c.cur = P.torso; torsoShape(c, G, m, { bottom: 45 });
        poly(c, [[28, 31], [36, 31], [32, 36]], mat(k.skin, true), { minTone: 2 }); line(c, 28, 31, 31, 35, A, 1); line(c, 35, 31, 32, 35, A, 1);
        sleeves(c, G, m, 'short', { cuff: A });
        // номер 10
        line(c, 28, 38, 28, 43, A, 1); rr(c, 31, 38, 35, 43, 2, A, { tone: 1 }); rr(c, 32, 39, 34, 42, 1, m, { tone: 1 });
      } },
    { id: 'top_shirt', cat: 'top', name: 'Рубашка', en: 'Shirt', style: 'classic', rarity: 'common', price: 350,
      pal: { C: '#a9cdf0', D: '#86afd8', B: '#5d7fa6' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), W = mat(WHITE);
        c.cur = P.torso; torsoShape(c, G, m, { bottom: 45 }); neckRound(c, k);
        poly(c, [[27, 31], [32, 33.5], [29, 35]], W, { edge: true }); poly(c, [[37, 31], [32, 33.5], [35, 35]], W, { edge: true });
        line(c, 32, 34, 32, 45, m, 2); c.pts([[31, 36], [31, 39], [31, 42]], p.B);
        rr(c, 34, 36, 37, 38, 0, m, { tone: 2, edge: true });
        sleeves(c, G, m, 'long', { cuff: W });
      } },
    { id: 'top_sweater', cat: 'top', name: 'Свитер', en: 'Sweater', style: 'classic', rarity: 'common', price: 380,
      pal: { C: '#c8553d', D: '#a1412e', L: '#e07a62' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), L = mat(p.L);
        c.cur = P.torso; torsoShape(c, G, m, { bottom: 46, grow: 1 });
        rr(c, 28, 30, 35, 33, 2, m, { tone: 2, edge: true });
        // узор «косы» и ромбы
        for (let x = G.tx0 + 1; x <= G.tx1 - 1; x += 3) { c.set(x, 38, L, 0); c.set(x + 1, 39, L, 0); c.set(x, 40, L, 0); }
        line(c, G.tx0, 44, G.tx1, 44, m, 3);
        sleeves(c, G, m, 'long', { cuff: mat(p.D) });
      } },
    { id: 'top_vest', cat: 'top', name: 'Жилетка', en: 'Vest', style: 'classic', rarity: 'common', price: 400,
      pal: { C: '#5a4636', D: '#43342a' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), W = mat(WHITE);
        c.cur = P.torso; torsoShape(c, G, W, { bottom: 45 }); neckRound(c, k);
        sleeves(c, G, W, 'long', { cuff: W });
        c.cur = P.torso;
        poly(c, [[G.tx0, 33], [29, 32], [32, 41], [32, 46], [G.tx0, 46]], m, { edge: true });
        poly(c, [[G.tx1 + 1, 33], [35, 32], [32, 41], [32, 46], [G.tx1 + 1, 46]], m, { edge: true });
        c.pts([[31, 42], [31, 44]], GOLD); line(c, 25, 40, 28, 40, m, 3);
      } },
    { id: 'top_hoodie', cat: 'top', name: 'Худи', en: 'Hoodie', style: 'street', rarity: 'rare', price: 700,
      pal: { C: '#3aa66a', D: '#2b8452' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        c.cur = P.torso; torsoShape(c, G, m, { grow: 1, up: 1, straight: true });
        ell(c, 32, 31, 7, 3, m, { tone: 2 }); ell(c, 32, 30.5, 3.5, 1.8, mat(k.skin, true), { tone: 2 });
        rr(c, 26, 40, 37, 44, 2, m, { tone: 2 }); line(c, 26, 40, 37, 40, m, 3);
        line(c, 30, 33, 30, 37, mat('#f4f4f4'), 1); line(c, 33, 33, 33, 37, mat('#f4f4f4'), 1);
        c.pts([[30, 38], [33, 38]], '#d0d3da');
        line(c, G.tx0, 45, G.tx1, 45, m, 3);
        sleeves(c, G, m, 'long', { cuff: mat(p.D) });
      } },
    { id: 'top_denim', cat: 'top', name: 'Джинсовка', en: 'Denim jacket', style: 'street', rarity: 'rare', price: 900,
      pal: { C: '#4a6fa5', D: '#38598a', L: '#6d8fc2' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), L = mat(p.L);
        c.cur = P.torso; torsoShape(c, G, mat(WHITE), { bottom: 45 });
        poly(c, [[G.tx0 - 1, 33], [29, 31], [31, 46], [G.tx0 - 1, 46]], m, { edge: true });
        poly(c, [[G.tx1 + 2, 33], [35, 31], [33, 46], [G.tx1 + 2, 46]], m, { edge: true });
        poly(c, [[26, 31], [30, 31], [29, 35]], L, { edge: true }); poly(c, [[38, 31], [34, 31], [35, 35]], L, { edge: true });
        rr(c, 24, 36, 28, 39, 1, L, { edge: true }); rr(c, 35, 36, 39, 39, 1, L, { edge: true });
        c.pts([[30, 38], [30, 41], [30, 44], [33, 38], [33, 41], [33, 44]], '#d4af37');
        line(c, G.tx0, 45, G.tx1, 45, L, 2);
        sleeves(c, G, m, 'long', { cuff: L });
      } },
    { id: 'top_blazer', cat: 'top', name: 'Пиджак', en: 'Blazer', style: 'classic', rarity: 'rare', price: 1000,
      pal: { C: '#2c3e66', D: '#1f2d4d' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), W = mat(WHITE);
        c.cur = P.torso; torsoShape(c, G, m, { grow: 1 });
        poly(c, [[28, 32], [36, 32], [32, 41]], W, {});
        poly(c, [[31, 34], [33, 34], [33.6, 39], [32, 41], [30.4, 39]], mat('#c0392b'), {});
        line(c, 28, 32, 32, 41, m, 3); line(c, 36, 32, 32, 41, m, 3); line(c, 27, 33, 30, 38, m, 0);
        c.pts([[32, 43], [32, 45]], GOLD); c.pts([[37, 36], [38, 36]], WHITE);
        sleeves(c, G, m, 'long', { cuff: W });
      } },
    { id: 'top_kimono', cat: 'top', name: 'Кимоно', en: 'Kimono', style: 'fantasy', rarity: 'rare', price: 1000,
      pal: { C: '#f2f0ea', D: '#d6d2c6' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        c.cur = P.torso; torsoShape(c, G, m, { grow: 1, straight: true });
        poly(c, [[28, 31], [37, 31], [32.5, 38]], mat(k.skin, true), { minTone: 2 });
        line(c, 28, 31, 35, 41, m, 3); line(c, 37, 31, 34, 35, m, 2);
        rr(c, G.tx0 - 1, 41, G.tx1 + 1, 43, 0, mat('#2b2b33'), { edge: 'bottom' }); c.pts([[36, 42], [37, 43]], '#c0392b');
        sleeves(c, G, m, 'long', { wide: 3 });
      } },
    { id: 'top_puffer', cat: 'top', name: 'Пуховик', en: 'Puffer jacket', style: 'street', rarity: 'rare', price: 1100,
      pal: { C: '#e85d3f', D: '#c0462c' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        c.cur = P.torso;
        for (let y = 33; y <= 44; y += 4) rr(c, G.tx0 - 2, y, G.tx1 + 2, y + 3, 2, m, { edge: true });
        rr(c, 26, 29, 37, 33, 2, m, { edge: true });
        line(c, 32, 30, 32, 46, '#d0d3da');
        c.cur = P.larm; for (let y = G.ay0; y < G.ay1; y += 4) rr(c, G.ax0 - 2, y, G.ax1 + 1, y + 3, 2, m, { edge: true });
        c.cur = P.rarm; for (let y = G.ay0; y < G.ay1; y += 4) rr(c, G.bx0 - 1, y, G.bx1 + 2, y + 3, 2, m, { edge: true });
      } },
    { id: 'top_leather', cat: 'top', name: 'Кожаная куртка', en: 'Leather jacket', style: 'street', rarity: 'rare', price: 1200,
      pal: { C: '#26262d', D: '#17171b', L: '#4a4a58' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), L = mat(p.L);
        c.cur = P.torso; torsoShape(c, G, m, { grow: 1 });
        ell(c, 33, 32, 3, 2, mat(WHITE), {});
        poly(c, [[G.tx0, 32], [29, 31], [26, 38]], L, { edge: true }); poly(c, [[G.tx1 + 1, 32], [35, 31], [38, 38]], L, { edge: true });
        line(c, 30, 33, 34, 46, '#c9ccd3');
        line(c, G.tx0 + 1, 36, G.tx0 + 1, 44, L, 0);
        rr(c, 35, 39, 39, 40, 0, L, {});
        sleeves(c, G, m, 'long', { cuff: L });
        c.cur = P.larm; line(c, G.ax0, G.ay0 + 2, G.ax0, G.ay1 - 2, L, 0);
      } },
    { id: 'top_armor', cat: 'top', name: 'Рыцарские доспехи', en: 'Knight armor', style: 'fantasy', rarity: 'rare', price: 1200,
      pal: { C: '#aeb6c2', D: '#7d8695', L: '#e2e7ee' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), L = mat(p.L);
        c.cur = P.torso; torsoShape(c, G, m, { grow: 1, straight: true });
        ell(c, 32, 38, 7, 6, m, { edge: true });
        line(c, G.tx0 - 1, 44, G.tx1 + 1, 44, m, 3);
        rr(c, 30, 35, 33, 40, 1, mat('#c0392b'), { edge: true }); line(c, 31, 36, 31, 39, '#f2c230'); line(c, 32, 36, 32, 39, '#f2c230');
        sleeves(c, G, m, 'long');
        c.cur = P.larm; ell(c, G.ax0 + 1, G.ay0 + 1, 4.5, 3.5, L, { edge: true });
        c.cur = P.rarm; ell(c, G.bx0 + 3, G.ay0 + 1, 4.5, 3.5, L, { edge: true });
      } },
    { id: 'top_school', cat: 'top', name: 'Школьный свитер', en: 'School sweater', style: 'classic', rarity: 'common', price: 340,
      pal: { C: '#e8d3a8', D: '#cdb586', B: '#d94a4a' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), W = mat('#f4f1ea');
        c.cur = P.torso; torsoShape(c, G, m, { grow: 1, bottom: 46 });
        // воротник рубашки и бантик
        poly(c, [[27, 31], [32, 34], [29, 36]], W, { edge: true }); poly(c, [[37, 31], [32, 34], [35, 36]], W, { edge: true });
        poly(c, [[28, 33], [32, 35], [28, 37]], mat(p.B), { edge: true }); poly(c, [[36, 33], [32, 35], [36, 37]], mat(p.B), { edge: true });
        rr(c, 31, 34, 32, 36, 1, mat(p.B), { tone: 1 });
        // вязаный низ и мягкие складки
        line(c, G.tx0, 44, G.tx1, 44, m, 2); line(c, G.tx0, 45, G.tx1, 45, m, 3);
        line(c, 26, 38, 27, 42, m, 2); line(c, 37, 38, 36, 42, m, 2);
        sleeves(c, G, m, 'long', { cuff: mat(p.D) });
      } },
    { id: 'top_sweatshirt', cat: 'top', name: 'Мягкий свитшот', en: 'Soft sweatshirt', style: 'street', rarity: 'common', price: 300,
      pal: { C: '#f6b8cf', D: '#e396b2' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        c.cur = P.torso; torsoShape(c, G, m, { grow: 1, straight: true });
        neckRound(c, k, m); line(c, 28, 33, 35, 33, m, 2);
        rr(c, G.tx0 - 1, 44, G.tx1 + 1, 46, 1, m, { tone: 2, edge: 'bottom' });
        // маленькое сердечко
        c.pts([[30, 36], [33, 36], [29, 37], [30, 37], [31, 37], [32, 37], [33, 37], [34, 37], [30, 38], [31, 38], [32, 38], [33, 38], [31, 39], [32, 39]], '#ffffff');
        sleeves(c, G, m, 'long', { cuff: mat(p.D) });
      } },
    { id: 'top_shirtdress', cat: 'top', long: true, name: 'Рубашка-оверсайз', en: 'Oversized shirt', style: 'classic', rarity: 'common', price: 330,
      pal: { C: '#f7f5f0', D: '#dcd8cf' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        // длинная свободная рубашка, закрывает бёдра; широкие рукава
        c.cur = P.torso;
        poly(c, [[G.tx0 - 1, G.ty0 + 1], [G.tx0 + 2, G.ty0 - 1], [G.tx1 - 1, G.ty0 - 1], [G.tx1 + 2, G.ty0 + 1], [G.tx1 + 4, 51], [32, 52], [G.tx0 - 3, 51]], m, { edge: true });
        poly(c, [[27, 31], [32, 34], [29, 36]], m, { edge: true, tone: 0 }); poly(c, [[37, 31], [32, 34], [35, 36]], m, { edge: true, tone: 0 });
        line(c, 32, 34, 32, 51, m, 2); c.pts([[31, 37], [31, 41], [31, 45]], '#c9c4b8');
        line(c, 26, 40, 25, 50, m, 2); line(c, 37, 40, 38, 50, m, 2);
        sleeves(c, G, m, 'long', { wide: 2, cuff: mat(p.D) });
      } },
    { id: 'top_cropped', cat: 'top', name: 'Укороченное худи', en: 'Cropped hoodie', style: 'street', rarity: 'common', price: 360,
      pal: { C: '#9aa5b8', D: '#7c879b' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        c.cur = P.torso; torsoShape(c, G, m, { grow: 1, up: 1, straight: true, bottom: 41 });
        rr(c, G.tx0 - 1, 40, G.tx1 + 1, 42, 1, m, { tone: 2, edge: 'bottom' });
        ell(c, 32, 31, 7, 3, m, { tone: 2 }); ell(c, 32, 30.5, 3.5, 1.8, mat(k.skin, true), { tone: 2 });
        line(c, 30, 33, 30, 37, mat('#f4f4f4'), 1); line(c, 33, 33, 33, 37, mat('#f4f4f4'), 1);
        sleeves(c, G, m, 'long', { cuff: mat(p.D) });
      } },
    { id: 'top_cardigan', cat: 'top', long: true, name: 'Длинный кардиган', en: 'Long cardigan', style: 'classic', rarity: 'rare', price: 600,
      pal: { C: '#c9a27a', D: '#a8835d', L: '#e2c4a2' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), W = mat('#f4f1ea');
        c.cur = P.torso; torsoShape(c, G, W, { bottom: 45 }); neckRound(c, k);
        // полы кардигана ниже бёдер, крупная вязка
        poly(c, [[G.tx0 - 1, 33], [29, 31], [30, 54], [G.tx0 - 2, 54]], m, { edge: true });
        poly(c, [[G.tx1 + 2, 33], [35, 31], [34, 54], [G.tx1 + 3, 54]], m, { edge: true });
        for (let y = 36; y <= 52; y += 3) { c.set(G.tx0 + 1, y, m, 0); c.set(G.tx1 - 1, y, m, 0); }
        c.pts([[29, 38], [29, 43], [34, 38], [34, 43]], p.D);
        rr(c, G.tx0 - 2, 53, 29, 54, 0, mat(p.D), { tone: 2 }); rr(c, 34, 53, G.tx1 + 2, 54, 0, mat(p.D), { tone: 2 });
        sleeves(c, G, m, 'long', { cuff: mat(p.L) });
      } },
    { id: 'top_trench', cat: 'top', long: true, name: 'Тренч', en: 'Trench coat', style: 'classic', rarity: 'rare', price: 1050,
      pal: { C: '#c8a978', D: '#a88b5c', B: '#5a4630' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        // длинное пальто с поясом и двубортной застёжкой
        c.cur = P.torso;
        poly(c, [[G.tx0 - 1, G.ty0 + 1], [G.tx0 + 2, G.ty0 - 1], [G.tx1 - 1, G.ty0 - 1], [G.tx1 + 2, G.ty0 + 1], [G.tx1 + 4, 56], [G.tx0 - 3, 56]], m, { edge: true });
        poly(c, [[27, 31], [32, 36], [28, 37], [25, 33]], m, { edge: true, tone: 0 }); poly(c, [[37, 31], [32, 36], [36, 37], [39, 33]], m, { edge: true, tone: 0 });
        line(c, 33, 36, 33, 56, m, 3);
        rr(c, G.tx0 - 2, 43, G.tx1 + 2, 44, 0, mat(p.D), { tone: 2 }); rr(c, 30, 42, 33, 45, 0, mat(p.B), { tone: 1 });
        c.pts([[29, 38], [29, 40], [36, 38], [36, 40], [29, 48], [36, 48]], p.B);
        sleeves(c, G, m, 'long', { cuff: mat(p.D) });
      } },
    { id: 'top_asym', cat: 'top', name: 'Асимметричный топ', en: 'Asymmetric top', style: 'fantasy', rarity: 'rare', price: 850,
      pal: { C: '#1f1f26', D: '#121217', L: '#f2f2f2' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), L = mat(p.L);
        // авангард: одно плечо открыто, драпировка по диагонали, один длинный рукав
        c.cur = P.torso;
        poly(c, [[G.tx0 + 3, G.ty0 + 3], [G.tx1, G.ty0 - 1], [G.tx1 + 1, 46], [G.tx0 - 1, 46], [G.tx0 - 1, G.ty0 + 6]], m, { edge: true });
        for (let i = 0; i < 4; i++) line(c, G.tx0 + i * 4, 46, G.tx1 - 2, G.ty0 + 2 + i * 3, m, i % 2 ? 0 : 2);
        line(c, G.tx0 + 3, G.ty0 + 3, G.tx1, G.ty0 - 1, L, 1);
        c.cur = P.rarm; rr(c, G.bx0 - 1, G.ay0, G.bx1 + 1, G.ay1, 2, m, { edge: true }); line(c, G.bx0 - 1, G.ay1, G.bx1 + 1, G.ay1, L, 1);
        c.cur = P.torso;
      } },
    { id: 'top_sculpt', cat: 'top', name: 'Скульптурный жакет', en: 'Sculpted jacket', style: 'fantasy', rarity: 'rare', price: 1150,
      pal: { C: '#e9e4f2', D: '#c8c0d8', A: '#7b5cff' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        // авангард: огромные «крылья»-плечи, узкая талия, контрастная линия
        c.cur = P.torso; torsoShape(c, G, m, { grow: 1, bottom: 46 });
        c.cur = P.larm; poly(c, [[G.ax0 - 5, G.ay0 + 1], [G.ax1 + 2, G.ay0 - 2], [G.ax1 + 1, G.ay0 + 5], [G.ax0 - 3, G.ay0 + 5]], m, { edge: true });
        rr(c, G.ax0 - 1, G.ay0 + 4, G.ax1 + 1, G.ay1, 2, m, { edge: true });
        c.cur = P.rarm; poly(c, [[G.bx1 + 6, G.ay0 + 1], [G.bx0 - 1, G.ay0 - 2], [G.bx0, G.ay0 + 5], [G.bx1 + 4, G.ay0 + 5]], m, { edge: true });
        rr(c, G.bx0 - 1, G.ay0 + 4, G.bx1 + 1, G.ay1, 2, m, { edge: true });
        c.cur = P.torso;
        line(c, 32, 32, 32, 46, mat(p.A), 1); poly(c, [[29, 31], [35, 31], [32, 35]], mat(k.skin, true), { minTone: 2 });
        line(c, G.tx0, 41, G.tx1, 41, m, 3);
      } },
    { id: 'top_robe', cat: 'top', long: true, name: 'Мантия мага', en: 'Wizard robe', style: 'fantasy', rarity: 'legendary', price: 5000,
      pal: { C: '#4b2a8a', D: '#361d66', R: '#7df9ff' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), T = mat(GOLD);
        c.cur = P.torso;
        poly(c, [[G.tx0, G.ty0 + 1], [G.tx0 + 3, G.ty0 - 1], [G.tx1 - 2, G.ty0 - 1], [G.tx1 + 1, G.ty0 + 1], [G.tx1 + 5, 60], [G.tx0 - 4, 60]], m, { edge: true });
        rr(c, 30, 32, 33, 60, 0, T, {}); line(c, G.tx0 - 3, 59, G.tx1 + 3, 59, T, 1);
        c.cur = P.larm; poly(c, [[G.ax0 - 1, G.ay0], [G.ax1 + 2, G.ay0], [G.ax1 + 3, G.ay1 + 1], [G.ax0 - 4, G.ay1 + 1]], m, { edge: true });
        c.cur = P.rarm; poly(c, [[G.bx0 - 1, G.ay0], [G.bx1 + 2, G.ay0], [G.bx1 + 5, G.ay1 + 1], [G.bx0 - 2, G.ay1 + 1]], m, { edge: true });
        c.cur = P.torso;
        const r = c.layer('fx-pulse', true);
        [[26, 38], [38, 41], [25, 50], [39, 53], [28, 56], [36, 47]].forEach(([x, y]) => { r.px(x, y, p.R); r.px(x + 1, y, '#ffffff'); r.px(x, y + 1, p.R); });
      } },

    // ===================== ШТАНЫ =====================
    { id: 'pants_jeans', cat: 'pants', name: 'Базовые джинсы', en: 'Basic jeans', style: 'base', rarity: 'base', price: 0,
      pal: { C: '#3b5b92', D: '#2c4672' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        trousers(c, G, m, 57);
        line(c, G.tx0 + 1, 45, G.tx1 - 1, 45, m, 3); c.px(32, 46, GOLD);
        c.cur = P.legl; line(c, G.lx1 - 1, 49, G.lx1 - 1, 56, m, 2);
        c.cur = P.legr; line(c, G.rx0 + 1, 49, G.rx0 + 1, 56, m, 2);
      } },
    { id: 'pants_shorts', cat: 'pants', name: 'Спортивные шорты', en: 'Sport shorts', style: 'sport', rarity: 'common', price: 120,
      pal: { C: '#2b2b33', D: '#1e1e24' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), W = mat(WHITE);
        trousers(c, G, m, 51, { widen: 1 });
        c.cur = P.legl; line(c, G.lx0 - 1, 47, G.lx0 - 1, 50, W, 1);
        c.cur = P.legr; line(c, G.rx1 + 1, 47, G.rx1 + 1, 50, W, 1);
      } },
    { id: 'pants_leggings', cat: 'pants', name: 'Леггинсы', en: 'Leggings', style: 'sport', rarity: 'common', price: 150,
      pal: { C: '#2a2a35', D: '#1d1d26' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), A = mat('#8b5cf6');
        c.cur = P.torso; rr(c, G.tx0 + 1, 44, G.tx1 - 1, 48, 1, m, { edge: true });
        c.cur = P.legl; rr(c, G.lx0, 46, G.lx1, 57, 2, m, { edge: true }); line(c, G.lx0, 47, G.lx0, 56, A, 1);
        c.cur = P.legr; rr(c, G.rx0, 46, G.rx1, 57, 2, m, { edge: true }); line(c, G.rx1, 47, G.rx1, 56, A, 1);
      } },
    { id: 'pants_capri', cat: 'pants', name: 'Бриджи', en: 'Capri pants', style: 'street', rarity: 'common', price: 180,
      pal: { C: '#d9c08b', D: '#bfa46f' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        trousers(c, G, m, 53);
        c.cur = P.legl; line(c, G.lx0 - 1, 53, G.lx1 + 1, 53, m, 3);
        c.cur = P.legr; line(c, G.rx0 - 1, 53, G.rx1 + 1, 53, m, 3);
      } },
    { id: 'pants_sweat', cat: 'pants', name: 'Спортивные штаны', en: 'Sweatpants', style: 'sport', rarity: 'common', price: 220,
      pal: { C: '#8a8f98', D: '#6e737c' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), W = mat(WHITE);
        trousers(c, G, m, 57, { widen: 1 });
        c.pts([[30, 45], [33, 45], [30, 46], [33, 47]], WHITE);
        c.cur = P.legl; line(c, G.lx0 - 1, 47, G.lx0 - 1, 54, W, 1); rr(c, G.lx0 - 2, 55, G.lx1 + 1, 57, 1, m, { tone: 2 });
        c.cur = P.legr; line(c, G.rx1 + 1, 47, G.rx1 + 1, 54, W, 1); rr(c, G.rx0 - 1, 55, G.rx1 + 2, 57, 1, m, { tone: 2 });
      } },
    { id: 'pants_skirt', cat: 'pants', name: 'Юбка в клетку', en: 'Plaid skirt', style: 'classic', rarity: 'common', price: 250,
      pal: { C: '#b23a48', D: '#8e2c39', L: '#d65a68' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        skirt(c, G, m, 52, 4);
        [26, 30, 34, 38].forEach((x) => line(c, x, 45, x + (x - 32) * 0.25, 51, m, 2));
        line(c, G.tx0 - 2, 49, G.tx1 + 2, 49, mat(p.L), 0);
      } },
    { id: 'pants_pleated', cat: 'pants', name: 'Плиссированная юбка', en: 'Pleated skirt', style: 'classic', rarity: 'common', price: 270,
      pal: { C: '#4a3a4f', D: '#352938' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        // складки: светлая полоса и тень рядом (только внутри самой юбки)
        const mask = skirt(c, G, m, 52, 4);
        for (let x = G.tx0 + 1; x <= G.tx1 - 2; x += 3) {
          const dx = (x + 1 - 32) * 0.22;
          for (let y = 46; y <= 51; y++) {
            const xx = Math.round(x + dx * (y - 46) / 5);
            if (mask.has(IX(xx, y))) c.t[IX(xx, y)] = 3;
            if (mask.has(IX(xx + 1, y))) c.t[IX(xx + 1, y)] = 0;
          }
        }
        line(c, G.tx0 + 1, 44, G.tx1 - 1, 44, m, 3);
      } },
    { id: 'pants_pajama', cat: 'pants', name: 'Пижамные штаны', en: 'Pajama pants', style: 'classic', rarity: 'common', price: 180,
      pal: { C: '#b8d4f2', D: '#94b6db' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), W = mat('#ffffff');
        trousers(c, G, m, 57, { widen: 1 });
        // мелкие звёздочки
        [[25, 49], [28, 53], [35, 48], [38, 52], [26, 56], [37, 56]].forEach(([x, y]) => { c.cur = x < 32 ? P.legl : P.legr; c.set(x, y, W, 0); });
        c.cur = P.torso; line(c, G.tx0 + 1, 44, G.tx1 - 1, 44, m, 2); c.pts([[31, 45], [33, 45]], '#ffffff');
      } },
    { id: 'pants_balloon', cat: 'pants', name: 'Брюки-баллоны', en: 'Balloon trousers', style: 'fantasy', rarity: 'rare', price: 700,
      pal: { C: '#d9d2c3', D: '#b8af9c' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        // авангард: объёмные штанины, сужаются к щиколотке
        c.cur = P.torso; rr(c, G.tx0 + 1, 44, G.tx1 - 1, 48, 1, m, { edge: true });
        c.cur = P.legl; ell(c, 26.5, 51.5, 5.5, 6, m, { edge: true }); rr(c, 24, 55, 29, 57, 1, m, { edge: true, tone: 2 });
        c.cur = P.legr; ell(c, 37.5, 51.5, 5.5, 6, m, { edge: true }); rr(c, 35, 55, 40, 57, 1, m, { edge: true, tone: 2 });
        c.cur = P.legl; line(c, 25, 47, 24, 54, m, 2); c.cur = P.legr; line(c, 39, 47, 40, 54, m, 2);
      } },
    { id: 'pants_asymskirt', cat: 'pants', name: 'Асимметричная юбка', en: 'Asymmetric skirt', style: 'fantasy', rarity: 'rare', price: 650,
      pal: { C: '#2b2b33', D: '#1b1b21', L: '#5a5a68' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        // авангард: косой край — с одной стороны короткая, с другой до щиколотки
        c.cur = P.torso;
        poly(c, [[G.tx0 + 1, 44], [G.tx1, 44], [G.tx1 + 4, 57], [G.tx0 - 2, 50]], m, { edge: true });
        line(c, G.tx0 - 1, 50, G.tx1 + 2, 57, mat(p.L), 1);
        [28, 33, 37].forEach((x) => line(c, x, 45, x + 1, 50 + (x - 28) * 0.6, m, 2));
      } },
    { id: 'pants_pencil', cat: 'pants', name: 'Юбка-карандаш', en: 'Pencil skirt', style: 'classic', rarity: 'common', price: 260,
      pal: { C: '#2c2e3a', D: '#1f2029' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        skirt(c, G, m, 54, 0);
        line(c, 35, 50, 35, 54, mat(k.skin, true), 2);
        line(c, G.tx0 + 1, 45, G.tx1 - 1, 45, m, 3);
      } },
    { id: 'pants_chinos', cat: 'pants', name: 'Чиносы', en: 'Chinos', style: 'classic', rarity: 'common', price: 280,
      pal: { C: '#c9a77c', D: '#a98a62' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        trousers(c, G, m, 57);
        line(c, G.tx0 + 1, 44, G.tx1 - 1, 44, mat('#5a3b22'), 1); c.px(32, 44, GOLD);
        c.cur = P.legl; line(c, 27, 49, 27, 56, m, 2);
        c.cur = P.legr; line(c, 36, 49, 36, 56, m, 2);
      } },
    { id: 'pants_cargo', cat: 'pants', name: 'Карго', en: 'Cargo pants', style: 'street', rarity: 'common', price: 300,
      pal: { C: '#6b7a3a', D: '#55612d' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        trousers(c, G, m, 57, { widen: 1 });
        c.cur = P.legl; rr(c, G.lx0 - 2, 50, G.lx0 + 2, 54, 1, m, { tone: 2, edge: true });
        c.cur = P.legr; rr(c, G.rx1 - 2, 50, G.rx1 + 2, 54, 1, m, { tone: 2, edge: true });
      } },
    { id: 'pants_wide', cat: 'pants', over: true, name: 'Широкие брюки', en: 'Wide-leg pants', style: 'street', rarity: 'common', price: 330,
      pal: { C: '#6a5acd', D: '#5446a8' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        trousers(c, G, m, 57, { widen: 1, flare: 2 });
        c.cur = P.legl; line(c, 27, 49, 26, 56, m, 2);
        c.cur = P.legr; line(c, 36, 49, 37, 56, m, 2);
      } },
    { id: 'pants_trousers', cat: 'pants', name: 'Классические брюки', en: 'Dress trousers', style: 'classic', rarity: 'common', price: 400,
      pal: { C: '#3a3d46', D: '#2c2e35', L: '#50545f' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        trousers(c, G, m, 57);
        line(c, G.tx0 + 1, 44, G.tx1 - 1, 44, mat('#1b1b1f'), 1); c.pts([[31, 44], [32, 44]], GOLD);
        c.cur = P.legl; line(c, 27, 48, 27, 56, m, 0);
        c.cur = P.legr; line(c, 36, 48, 36, 56, m, 0);
      } },
    { id: 'pants_bell', cat: 'pants', over: true, name: 'Клёш', en: 'Flared pants', style: 'street', rarity: 'rare', price: 550,
      pal: { C: '#7d5ba6', D: '#634788' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C);
        trousers(c, G, m, 58, { flare: 4 });
        c.cur = P.legl; line(c, 25, 52, 22, 58, m, 2);
        c.cur = P.legr; line(c, 38, 52, 41, 58, m, 2);
      } },
    { id: 'pants_ripped', cat: 'pants', name: 'Рваные джинсы', en: 'Ripped jeans', style: 'street', rarity: 'rare', price: 600,
      pal: { C: '#6f8fc4', D: '#55729f' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), sk = mat(k.skin, true);
        trousers(c, G, m, 57);
        c.cur = P.legl; rr(c, 25, 50, 28, 51, 0, sk, { tone: 1 }); line(c, 24, 49, 29, 49, '#eef3fa'); line(c, 24, 52, 29, 52, '#eef3fa');
        c.cur = P.legr; rr(c, 35, 53, 37, 54, 0, sk, { tone: 1 }); line(c, 34, 52, 38, 52, '#eef3fa');
      } },
    { id: 'pants_kilt', cat: 'pants', name: 'Килт', en: 'Kilt', style: 'classic', rarity: 'rare', price: 650,
      pal: { C: '#2e7d4f', D: '#1f5c39' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), R = mat('#c0392b');
        skirt(c, G, m, 53, 2);
        [26, 30, 34, 38].forEach((x) => line(c, x, 45, x, 52, m, 3)); [47, 50].forEach((y) => line(c, G.tx0, y, G.tx1, y, R, 1));
        rr(c, 30, 45, 33, 49, 1, mat('#7a4a2a'), { edge: true });
      } },
    { id: 'pants_tutu', cat: 'pants', name: 'Пышная юбка', en: 'Tutu skirt', style: 'fantasy', rarity: 'rare', price: 700,
      pal: { C: '#f7a8c8', D: '#e083aa', L: '#fcd2e3' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), L = mat(p.L);
        c.cur = P.torso; rr(c, G.tx0 + 1, 44, G.tx1 - 1, 46, 1, m, {});
        ell(c, 32, 49, 14, 4, m, { edge: true }); ell(c, 32, 47.5, 12, 2.6, L, {});
        c.pts([[24, 49], [31, 47], [38, 50], [28, 51], [35, 48]], '#ffffff');
      } },
    { id: 'pants_leather', cat: 'pants', name: 'Кожаные штаны', en: 'Leather pants', style: 'street', rarity: 'rare', price: 800,
      pal: { C: '#1f1f24', D: '#141418', L: '#4a4a58' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), L = mat(p.L);
        trousers(c, G, m, 57);
        c.cur = P.legl; line(c, 25, 47, 25, 55, L, 0);
        c.cur = P.legr; line(c, 34, 47, 34, 55, L, 0);
      } },
    { id: 'pants_ninja', cat: 'pants', name: 'Штаны ниндзя', en: 'Ninja pants', style: 'fantasy', rarity: 'rare', price: 900,
      pal: { C: '#1e1e26', D: '#121218', L: '#3b3b48' },
      draw(c, k, p) {
        const G = k.G, m = mat(p.C), L = mat(p.L), R = mat('#c0392b');
        trousers(c, G, m, 57, { widen: 1 });
        c.cur = P.torso; rr(c, G.tx0, 43, G.tx1, 46, 1, R, { edge: 'bottom' }); poly(c, [[26, 45], [29, 45], [27, 52]], R, { edge: true });
        c.cur = P.legl; for (let y = 52; y <= 56; y += 2) line(c, G.lx0 - 1, y, G.lx1 + 1, y + 1, L, 1);
        c.cur = P.legr; for (let y = 52; y <= 56; y += 2) line(c, G.rx0 - 1, y, G.rx1 + 1, y + 1, L, 1);
      } },

    // ===================== ОБУВЬ =====================
    { id: 'shoes_keds', cat: 'shoes', name: 'Кеды', en: 'Canvas shoes', style: 'base', rarity: 'base', price: 0,
      pal: { C: '#f2f2f2', L: '#c8ccd3' },
      draw(c, k, p) {
        shoes(c, mat(p.C), 56, '#9aa1ab', (x0, x1) => line(c, x0 + 3, 57, x0 + 6, 57, mat(p.L), 2));
      } },
    { id: 'shoes_sandals', cat: 'shoes', name: 'Сандалии', en: 'Sandals', style: 'sport', rarity: 'common', price: 100,
      pal: { C: '#8a5a2b', D: '#6e4520' },
      draw(c, k, p) {
        const m = mat(p.C);
        [[P.legl, 22, 31], [P.legr, 32, 41]].forEach(([part, x0, x1]) => {
          c.cur = part; rr(c, x0, 60, x1, 61, 1, mat(p.D), { tone: 2 });
          line(c, x0 + 1, 58, x1 - 1, 58, m, 1); line(c, x0 + 4, 56, x0 + 4, 59, m, 1);
        });
      } },
    { id: 'shoes_flipflops', cat: 'shoes', name: 'Шлёпанцы', en: 'Flip-flops', style: 'sport', rarity: 'common', price: 110,
      pal: { C: '#3ec1d3', D: '#2b97a6' },
      draw(c, k, p) {
        const m = mat(p.C);
        [[P.legl, 22, 31], [P.legr, 32, 41]].forEach(([part, x0, x1]) => {
          c.cur = part; rr(c, x0, 60, x1, 61, 1, m, { tone: 1 }); line(c, x0 + 4, 59, x0 + 2, 57, m, 2); line(c, x0 + 4, 59, x0 + 7, 57, m, 2);
        });
      } },
    { id: 'shoes_slipons', cat: 'shoes', name: 'Слипоны', en: 'Slip-ons', style: 'street', rarity: 'common', price: 180,
      pal: { C: '#2a2a30' },
      draw(c, k, p) {
        const W = mat(WHITE), B = mat(p.C);
        shoes(c, W, 56, '#f6f6f6', (x0, x1) => {
          for (let x = x0 + 1; x < x1; x++) for (let y = 57; y <= 59; y++) if ((x + y) % 2 === 0) c.set(x, y, B, 1);
        });
      } },
    { id: 'shoes_rain', cat: 'shoes', tall: true, name: 'Резиновые сапоги', en: 'Rain boots', style: 'street', rarity: 'common', price: 240,
      pal: { C: '#f5c83a', D: '#cfa52a' },
      draw(c, k, p) {
        shoes(c, mat(p.C), 50, '#8a6d1d', (x0, x1) => line(c, x0 + 1, 51, x1 - 1, 51, mat(p.D), 2));
      } },
    { id: 'shoes_sneakers', cat: 'shoes', name: 'Кроссовки', en: 'Sneakers', style: 'sport', rarity: 'common', price: 250,
      pal: { C: '#e74c3c' },
      draw(c, k, p) {
        shoes(c, mat(p.C), 56, '#ffffff', (x0, x1, i) => { line(c, x0 + 2, 59, x1 - 2, 58 - (i ? -1 : 0) , mat(WHITE), 0); c.px(x0 + 4, 57, WHITE); c.px(x0 + 6, 57, WHITE); });
      } },
    { id: 'shoes_cleats', cat: 'shoes', name: 'Бутсы', en: 'Football boots', style: 'sport', rarity: 'common', price: 280,
      pal: { C: '#1f1f24' },
      draw(c, k, p) {
        shoes(c, mat(p.C), 56, null, (x0, x1) => {
          line(c, x0 + 2, 58, x1 - 2, 57, mat('#3fa45b'), 0);
          for (let x = x0 + 1; x <= x1 - 1; x += 3) c.px(x, 61, '#d0d3da');
        });
      } },
    { id: 'shoes_loafers', cat: 'shoes', name: 'Лоферы', en: 'Loafers', style: 'classic', rarity: 'common', price: 300,
      pal: { C: '#7a4a2a', D: '#5c361d' },
      draw(c, k, p) {
        shoes(c, mat(p.C), 56, '#3a2416', (x0) => { line(c, x0 + 3, 57, x0 + 6, 57, mat(p.D), 3); c.px(x0 + 5, 58, GOLD); });
      } },
    { id: 'shoes_classic', cat: 'shoes', name: 'Туфли', en: 'Dress shoes', style: 'classic', rarity: 'common', price: 350,
      pal: { C: '#1d1d22', D: '#111114', L: '#5a5a66' },
      draw(c, k, p) {
        shoes(c, mat(p.C), 56, '#0c0c10', (x0) => { c.px(x0 + 2, 57, p.L); c.px(x0 + 3, 57, p.L); line(c, x0 + 4, 57, x0 + 7, 57, mat(p.C), 3); });
      } },
    { id: 'shoes_kneesocks', cat: 'shoes', name: 'Гольфы и лоферы', en: 'Knee socks & loafers', style: 'classic', rarity: 'common', price: 320,
      pal: { C: '#2b2b3a', D: '#1c1c28', S: '#f6f4ef' },
      draw(c, k, p) {
        const S = mat(p.S), m = mat(p.C);
        [[P.legl, 22, 31, 24, 30], [P.legr, 32, 41, 33, 39]].forEach(([part, x0, x1, l0, l1]) => {
          c.cur = part;
          // гольфы с подвёрнутым верхом
          rr(c, l0, 49, l1, 57, 1, S, { edge: true });
          rr(c, l0 - 1, 49, l1 + 1, 51, 1, S, { edge: 'bottom' });
          line(c, l0, 52, l1, 52, S, 2);
          rr(c, x0, 57, x1, 60, 2, m, { edge: true });
          line(c, x0, 61, x1, 61, mat(p.D), 1);
          line(c, x0 + 3, 58, x0 + 6, 58, m, 0);
        });
        c.cur = P.torso;
      } },
    { id: 'shoes_slippers', cat: 'shoes', name: 'Тапочки и тёплые носки', en: 'Slippers & cozy socks', style: 'classic', rarity: 'common', price: 150,
      pal: { C: '#f2a7b8', D: '#d98698', S: '#f4ead8' },
      draw(c, k, p) {
        const S = mat(p.S), m = mat(p.C);
        [[P.legl, 22, 31, 24, 30], [P.legr, 32, 41, 33, 39]].forEach(([part, x0, x1, l0, l1]) => {
          c.cur = part;
          rr(c, l0, 52, l1, 57, 1, S, { edge: true });
          for (let x = l0 + 1; x < l1; x += 2) c.set(x, 53, S, 2);
          ell(c, (x0 + x1 + 1) / 2, 59, (x1 - x0) / 2 + 0.5, 2.6, m, { edge: true });
          c.set((x0 + x1 - 1) / 2, 58, m, 0); c.set((x0 + x1 + 1) / 2, 58, m, 0);
          line(c, x0 + 1, 61, x1 - 1, 61, mat(p.D), 2);
        });
        c.cur = P.torso;
      } },
    { id: 'shoes_chunky', cat: 'shoes', name: 'Массивные кроссовки', en: 'Chunky sneakers', style: 'street', rarity: 'rare', price: 650,
      pal: { C: '#f2f2f4', A: '#7b5cff' },
      draw(c, k, p) {
        const m = mat(p.C), A = mat(p.A);
        [[P.legl, 21, 31], [P.legr, 32, 42]].forEach(([part, x0, x1]) => {
          c.cur = part;
          rr(c, x0, 56, x1, 60, 3, m, { edge: true });
          rr(c, x0, 60, x1, 62, 1, mat('#d8d8de'), { edge: 'bottom' });
          line(c, x0 + 2, 58, x1 - 3, 57, A, 1); line(c, x0 + 1, 61, x1 - 1, 61, mat('#b9b9c2'), 2);
        });
        c.cur = P.torso;
      } },
    { id: 'shoes_platformboots', cat: 'shoes', name: 'Ботинки на платформе', en: 'Platform boots', style: 'fantasy', rarity: 'rare', price: 900, tall: true,
      pal: { C: '#1d1d22', D: '#0f0f12', L: '#cfd2da' },
      draw(c, k, p) {
        const m = mat(p.C), L = mat(p.L);
        [[P.legl, 22, 31], [P.legr, 32, 41]].forEach(([part, x0, x1]) => {
          c.cur = part;
          rr(c, x0 + 1, 48, x1 - 1, 59, 2, m, { edge: true });
          rr(c, x0 - 1, 58, x1 + 1, 62, 1, mat(p.D), { edge: true });
          for (let y = 50; y <= 56; y += 2) { c.set(x0 + 4, y, L, 0); c.set(x0 + 6, y, L, 0); }
          line(c, x0 - 1, 60, x1 + 1, 60, L, 1);
        });
        c.cur = P.torso;
      } },
    { id: 'shoes_boots', cat: 'shoes', tall: true, name: 'Ботинки', en: 'Boots', style: 'street', rarity: 'rare', price: 550,
      pal: { C: '#6b4226', D: '#4f2f1a' },
      draw(c, k, p) {
        shoes(c, mat(p.C), 52, '#2b1d12', (x0) => { for (let y = 53; y <= 57; y += 2) { c.px(x0 + 4, y, '#e0c39a'); c.px(x0 + 6, y, '#e0c39a'); } });
      } },
    { id: 'shoes_platform', cat: 'shoes', tall: true, name: 'Кеды на платформе', en: 'Platform sneakers', style: 'street', rarity: 'rare', price: 600,
      pal: { C: '#ec6fae', D: '#c85390' },
      draw(c, k, p) {
        shoes(c, mat(WHITE), 55, null, (x0, x1) => { rr(c, x0, 60, x1, 62, 1, mat(p.C), { edge: true }); line(c, x0 + 3, 56, x0 + 6, 56, mat('#c8ccd3'), 2); });
      } },
    { id: 'shoes_heels', cat: 'shoes', name: 'Туфли на каблуке', en: 'High heels', style: 'classic', rarity: 'rare', price: 700,
      pal: { C: '#d23a4b', D: '#a52a39' },
      draw(c, k, p) {
        const m = mat(p.C);
        [[P.legl, 22, 31], [P.legr, 32, 41]].forEach(([part, x0, x1], i) => {
          c.cur = part;
          poly(c, [[x0 + 1, 57], [x1 - 1, 57], [x1 - 1, 60], [x0 + 1, 59]], m, { edge: true });
          rr(c, i ? x1 - 2 : x0 + 1, 60, i ? x1 - 1 : x0 + 2, 62, 0, mat(p.D), { tone: 2 });
        });
      } },
    { id: 'shoes_hightops', cat: 'shoes', tall: true, name: 'Высокие кеды', en: 'High-tops', style: 'street', rarity: 'rare', price: 750,
      pal: { C: '#e74c3c' },
      draw(c, k, p) {
        shoes(c, mat(WHITE), 51, '#222228', (x0, x1) => { rr(c, x0 + 1, 51, x1 - 1, 53, 1, mat(p.C), { edge: true }); ell(c, x0 + 5, 56, 1.5, 1.2, mat(p.C), {}); });
      } },
    { id: 'shoes_cowboy', cat: 'shoes', tall: true, name: 'Ковбойские сапоги', en: 'Cowboy boots', style: 'classic', rarity: 'rare', price: 850,
      pal: { C: '#9a6033', D: '#744622', L: '#c58a55' },
      draw(c, k, p) {
        shoes(c, mat(p.C), 49, '#3a2416', (x0, x1) => {
          line(c, x0 + 3, 51, x0 + 5, 54, mat(p.L), 0); line(c, x0 + 7, 51, x0 + 5, 54, mat(p.L), 0);
          rr(c, x0 + 1, 49, x1 - 1, 50, 0, mat(p.D), { tone: 2 });
        });
      } },
    { id: 'shoes_armor', cat: 'shoes', tall: true, name: 'Латные сапоги', en: 'Armored boots', style: 'fantasy', rarity: 'rare', price: 1100,
      pal: { C: '#aeb6c2', D: '#7d8695', L: '#e2e7ee' },
      draw(c, k, p) {
        shoes(c, mat(p.C), 49, '#5a6170', (x0, x1) => { line(c, x0 + 1, 53, x1 - 1, 53, mat(p.D), 3); ell(c, x0 + 5, 51, 2.5, 2, mat(p.L), { edge: true }); });
      } },
    { id: 'shoes_winged', cat: 'shoes', name: 'Крылатые сандалии', en: 'Winged sandals', style: 'fantasy', rarity: 'legendary', price: 2500,
      pal: { G: '#e8c547', D: '#b8962f' },
      draw(c, k, p) {
        const G = mat(p.G);
        [[P.legl, 22, 31], [P.legr, 32, 41]].forEach(([part, x0, x1], i) => {
          c.cur = part; rr(c, x0, 60, x1, 61, 1, mat(p.D), { tone: 2 });
          line(c, x0 + 1, 58, x1 - 1, 58, G, 0); line(c, x0 + 1, 55, x1 - 1, 57, G, 1);
          // крылышко у пятки: два кадра (вверх / вниз)
          const sx = i ? x1 + 1 : x0 - 1, d = i ? 1 : -1;
          [['fx-a', -1], ['fx-b', 1]].forEach(([cls, up]) => {
            const l = c.layer(cls, true);
            for (let f = 0; f < 3; f++) {
              const len = 5 - f, y = 56 + f * 1.5 * (up < 0 ? 0.6 : 1) - (up < 0 ? 3 - f : 0);
              for (let j = 0; j < len; j++) l.px(sx + d * j, y - (up < 0 ? j * 0.6 : -j * 0.3), j === len - 1 ? '#9fb8ea' : f ? '#dbe8ff' : '#ffffff');
            }
          });
        });
      } },

    // ===================== АКСЕССУАРЫ =====================
    { id: 'acc_cap', cat: 'acc', hat: 13, name: 'Кепка', en: 'Cap', style: 'sport', rarity: 'common', price: 100,
      pal: { C: '#e74c3c', D: '#b8392c' },
      draw(c, k, p) {
        const m = mat(p.C), H = k.G.H;
        headwear(c, k, m, H.cy - 5);
        rr(c, H.cx - H.rx - 2, H.cy - 6, H.cx + 6, H.cy - 4, 1, m, { tone: 2, edge: 'bottom' });
        ell(c, 32, 6, 1.5, 1, mat(WHITE), { tone: 1 });
        c.pts([[29, 11], [30, 10], [31, 11]], WHITE);
      } },
    { id: 'acc_bandana', cat: 'acc', hat: 11, name: 'Бандана', en: 'Bandana', style: 'street', rarity: 'common', price: 120,
      pal: { C: '#c0392b', D: '#962d22' },
      draw(c, k, p) {
        const m = mat(p.C), H = k.G.H;
        headwear(c, k, m, H.cy - 7, 1);
        poly(c, [[44, 10], [50, 7], [49, 13]], m, { edge: true }); poly(c, [[44, 11], [49, 16], [46, 17]], m, { edge: true });
        c.pts([[25, 9], [29, 7], [33, 8], [37, 7], [40, 10], [27, 11], [35, 11]], WHITE);
      } },
    { id: 'acc_headband', cat: 'acc', name: 'Спортивная повязка', en: 'Sweatband', style: 'sport', rarity: 'common', price: 130,
      pal: { C: '#e74c3c', D: '#b8392c' },
      draw(c, k, p) {
        const m = mat(p.C);
        c.cur = P.head; rr(c, 18, 11, 45, 13, 1, m, { edge: true }); line(c, 29, 12, 34, 12, mat(WHITE), 1);
      } },
    { id: 'acc_glasses', cat: 'acc', name: 'Очки', en: 'Glasses', style: 'classic', rarity: 'common', price: 150,
      pal: { F: '#3a2f46' },
      draw(c, k, p) {
        c.cur = P.head; const F = p.F;
        [[23, 18], [35, 18]].forEach(([x0, y0]) => {
          for (let x = x0; x <= x0 + 5; x++) { c.px(x, y0, F); c.px(x, y0 + 6, F); }
          for (let y = y0; y <= y0 + 6; y++) { c.px(x0, y, F); c.px(x0 + 5, y, F); }
          c.px(x0 + 4, y0 + 1, '#ffffff');
        });
        line(c, 29, 20, 34, 20, F); c.px(18, 20, F); c.px(45, 20, F);
      } },
    { id: 'acc_bowtie', cat: 'acc', name: 'Галстук-бабочка', en: 'Bow tie', style: 'classic', rarity: 'common', price: 160,
      pal: { C: '#c0392b', D: '#962d22' },
      draw(c, k, p) {
        const m = mat(p.C);
        c.cur = P.torso; poly(c, [[27, 30], [31, 32], [27, 34]], m, { edge: true }); poly(c, [[37, 30], [33, 32], [37, 34]], m, { edge: true });
        rr(c, 31, 31, 32, 33, 1, mat(p.D), { tone: 1 });
      } },
    { id: 'acc_beanie', cat: 'acc', hat: 14, name: 'Шапка-бини', en: 'Beanie', style: 'street', rarity: 'common', price: 180,
      pal: { C: '#3b82f6', D: '#2c64c4' },
      draw(c, k, p) {
        const m = mat(p.C), H = k.G.H;
        headwear(c, k, m, H.cy - 6, 4);
        rr(c, H.cx - H.rx - 1.5, H.cy - 8, H.cx + H.rx + 0.5, H.cy - 5, 1, m, { tone: 2, edge: true });
        for (let x = 20; x <= 43; x += 2) { c.set(x, H.cy - 7, m, 3); c.set(x + 1, H.cy - 6, m, 3); }
        ell(c, 32, 2.5, 3, 2.5, mat(WHITE), { edge: true });
      } },
    { id: 'acc_scarf', cat: 'acc', name: 'Шарф', en: 'Scarf', style: 'classic', rarity: 'common', price: 200,
      pal: { C: '#d64545', D: '#a83232', L: '#ee7070' },
      draw(c, k, p) {
        const m = mat(p.C), L = mat(p.L);
        c.cur = P.torso; rr(c, 24, 29, 39, 34, 3, m, { edge: true }); rr(c, 35, 33, 39, 42, 1, m, { edge: true });
        for (let x = 26; x <= 38; x += 3) line(c, x, 30, x, 33, L, 0);
        line(c, 35, 41, 39, 41, L, 0);
      } },
    { id: 'acc_puffscarf', cat: 'acc', name: 'Тёплый шарф', en: 'Cozy scarf', style: 'classic', rarity: 'common', price: 240,
      pal: { C: '#f3ead2', D: '#d9cba6' },
      draw(c, k, p) {
        const m = mat(p.C);
        // объёмный шарф под подбородком и свисающий конец
        c.cur = P.torso;
        rr(c, 32, 33, 37, 45, 2, m, { edge: true });
        line(c, 33, 43, 36, 43, m, 2); line(c, 33, 45, 36, 45, m, 2);
        c.cur = P.head;
        ell(c, 32, 31, 10, 3.6, m, { edge: true });
        for (let x = 24; x <= 40; x += 3) c.set(x, 32, m, 2);
      } },
    { id: 'acc_bow', cat: 'acc', name: 'Бант в волосах', en: 'Hair bow', style: 'classic', rarity: 'common', price: 160,
      pal: { C: '#e8536f', D: '#c23a56' },
      draw(c, k, p) {
        const m = mat(p.C);
        c.cur = P.head;
        poly(c, [[38, 6], [44, 2], [45, 9]], m, { edge: true }); poly(c, [[38, 6], [32, 2], [31, 9]], m, { edge: true });
        rr(c, 37, 5, 39, 7, 1, mat(p.D), { tone: 1 });
        line(c, 37, 8, 35, 11, m, 2); line(c, 39, 8, 41, 11, m, 2);
      } },
    { id: 'acc_starclips', cat: 'acc', name: 'Заколки-звёздочки', en: 'Star hair clips', style: 'street', rarity: 'common', price: 140,
      pal: { G: '#ffd84a', D: '#e0b020' },
      draw(c, k, p) {
        c.cur = P.head;
        [[20, 11], [44, 10], [41, 7]].forEach(([x, y]) => {
          c.pts([[x, y - 2], [x - 2, y], [x - 1, y], [x, y], [x + 1, y], [x + 2, y], [x, y - 1], [x, y + 1], [x - 1, y + 2], [x + 1, y + 2]], p.G);
          c.px(x, y, '#fff6c2');
        });
      } },
    { id: 'acc_pearls', cat: 'acc', name: 'Серьги-жемчуг', en: 'Pearl earrings', style: 'classic', rarity: 'common', price: 200,
      pal: { W: '#f7f3ea', D: '#d8cdb8' },
      draw(c, k, p) {
        c.cur = P.head;
        [[18, 24], [46, 24]].forEach(([x, y]) => { ell(c, x, y, 1.6, 1.6, mat(p.W), { edge: true }); c.px(x - 1, y - 1, '#ffffff'); });
      } },
    { id: 'acc_chick', cat: 'acc', sits: 'top', name: 'Цыплёнок на голове', en: 'Chick on head', style: 'fantasy', rarity: 'rare', price: 500,
      pal: { C: '#f5c84a', D: '#d9a52a' },
      draw(c, k, p) {
        const m = mat(p.C);
        c.cur = P.head;
        // круглый цыплёнок дремлет на макушке
        ell(c, 32, 2.6, 5.5, 3.4, m, { edge: true });
        ell(c, 29.5, 1.4, 2.6, 2.2, m, {});
        c.px(28, 1, '#3a2a20'); c.pts([[26, 2], [25, 2]], '#f08a2a');
        line(c, 34, 3, 36, 2, m, 2);
      } },
    { id: 'acc_bunny', cat: 'acc', name: 'Плюшевый зайка', en: 'Plush bunny', style: 'fantasy', rarity: 'rare', price: 550, part: 'rarm',
      pal: { W: '#f7f4f6', P: '#f2a7c0' },
      draw(c, k, p) {
        const G = k.G, W = mat(p.W);
        // игрушка висит в правой руке
        c.cur = P.rarm;
        const x = G.bx0 + 4, y = G.ay1 + 6;
        rr(c, x - 3, y - 1, x + 3, y + 6, 3, W, { edge: true });
        ell(c, x, y - 3, 3.2, 2.8, W, { edge: true });
        rr(c, x - 3, y - 10, x - 2, y - 5, 1, W, { edge: true }); rr(c, x + 1, y - 10, x + 2, y - 5, 1, W, { edge: true });
        c.pts([[x - 2, y - 8], [x + 1, y - 8], [x - 1, y + 2], [x, y + 2]], p.P);
        c.pts([[x - 1, y - 3], [x + 1, y - 3]], '#3a2a30');
      } },
    { id: 'acc_visor', cat: 'acc', name: 'Очки-визор', en: 'Visor glasses', style: 'fantasy', rarity: 'rare', price: 800,
      pal: { C: '#7b5cff', D: '#4b34c4', L: '#a7f0ff' },
      draw(c, k, p) {
        const m = mat(p.C);
        c.cur = P.head;
        // авангард: цельная полупрозрачная полоса с переливом
        rr(c, 19, 18, 44, 22, 2, m, { edge: true });
        line(c, 21, 19, 30, 19, mat(p.L), 0); line(c, 34, 19, 38, 19, mat(p.L), 0);
        line(c, 17, 20, 18, 20, mat(p.D), 2); line(c, 45, 20, 46, 20, mat(p.D), 2);
      } },
    { id: 'acc_chain', cat: 'acc', name: 'Цепочка', en: 'Gold chain', style: 'street', rarity: 'common', price: 250,
      pal: { G: '#e8c547', D: '#b8962f' },
      draw(c, k, p) {
        c.cur = P.torso;
        for (let i = 0; i <= 13; i++) { const x = 25 + i, y = 33 + Math.round(Math.sin(i / 13 * Math.PI) * 5); c.px(x, y, (i < 7 ? i : 13 - i) % 2 ? p.D : p.G); }
        ell(c, 32, 39.5, 2, 2, mat(p.G), { edge: true });
      } },
    { id: 'acc_headphones', cat: 'acc', name: 'Наушники', en: 'Headphones', style: 'street', rarity: 'common', price: 350,
      pal: { C: '#21b8b0', D: '#178a84' },
      draw(c, k, p) {
        const m = mat(p.C), B = mat(DARK), H = k.G.H;
        c.cur = P.head;
        // дужка — половина эллипса от чашек до верха причёски (на пышных волосах она выше)
        const top = Math.max(-OY + 1, Math.min(4, (k.top ? k.top.wide : 4) - 2)), ry = 17 - top;
        for (let a = 0; a <= 200; a++) {
          const an = Math.PI * a / 200, cs = Math.cos(an), sn = Math.sin(an);
          c.set(Math.floor(32 - cs * 14.5), Math.floor(17 - sn * (ry - 1)), B, 2);
          c.set(Math.floor(32 - cs * 15.5), Math.floor(17 - sn * ry), B, 1);
        }
        rr(c, 15, 16, 20, 25, 2, m, { edge: true }); rr(c, 43, 16, 48, 25, 2, m, { edge: true });
        void H;
      } },
    { id: 'acc_sunglasses', cat: 'acc', name: 'Солнечные очки', en: 'Sunglasses', style: 'street', rarity: 'rare', price: 500,
      pal: { K: '#15151c' },
      draw(c, k, p) {
        const m = mat(p.K);
        c.cur = P.head; rr(c, 22, 18, 29, 23, 2, m, { edge: true }); rr(c, 34, 18, 41, 23, 2, m, { edge: true });
        line(c, 30, 19, 33, 19, m, 2); line(c, 18, 19, 21, 19, m, 2); line(c, 42, 19, 45, 19, m, 2);
        c.pts([[24, 19], [25, 19], [24, 20], [36, 19], [37, 19], [36, 20]], '#a8b4cc');
      } },
    { id: 'acc_fedora', cat: 'acc', hat: 10, name: 'Шляпа', en: 'Fedora', style: 'classic', rarity: 'rare', price: 600,
      pal: { C: '#5a4636', D: '#43342a' },
      draw(c, k, p) {
        const m = mat(p.C), H = k.G.H;
        c.cur = P.head;
        rr(c, 21, 1, 42, 9, 4, m, { edge: true }); line(c, 31, 1, 31, 4, m, 3); line(c, 32, 1, 32, 4, m, 3);
        rr(c, 21, 7, 42, 9, 0, mat('#1f1f24'), { tone: 1 });
        ell(c, 32, 10, 18, 2.2, mat(p.D), { edge: true });
        void H;
      } },
    { id: 'acc_ninjamask', cat: 'acc', name: 'Маска ниндзя', en: 'Ninja mask', style: 'fantasy', rarity: 'rare', price: 700,
      pal: { C: '#2a2a35', D: '#1d1d26' },
      draw(c, k, p) {
        const m = mat(p.C), H = k.G.H;
        c.cur = P.head;
        fill(c, [H.cx - H.rx, 24, H.cx + H.rx, H.cy + H.ry], (x, y) => {
          const nx = (x - H.cx) / H.rx, ny = (y - H.cy) / H.ry;
          return nx * nx + ny * ny <= 1 && y >= 24 ? [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))] : null;
        }, m, { edge: true });
        poly(c, [[45, 22], [51, 20], [49, 26]], m, { edge: true });
      } },
    { id: 'acc_wizard', cat: 'acc', hat: 10, name: 'Шляпа волшебника', en: 'Wizard hat', style: 'fantasy', rarity: 'rare', price: 1100,
      pal: { C: '#3a4fb0', D: '#2c3c8a' },
      draw(c, k, p) {
        const m = mat(p.C);
        c.cur = P.head;
        poly(c, [[22, 10], [42, 10], [38, 2], [33, -3], [30, 2]], m, { edge: true });
        ell(c, 32, 10, 18, 2.4, mat(p.D), { edge: true });
        [[28, 6], [36, 4], [33, 8]].forEach(([x, y]) => { c.px(x, y, '#f5c83a'); c.px(x + 1, y, '#fff3a0'); });
      } },
    { id: 'acc_crown', cat: 'acc', sits: 'wide', name: 'Корона', en: 'Crown', style: 'fantasy', rarity: 'rare', price: 1200,
      pal: { G: '#f2c230', D: '#c99a1a' },
      draw(c, k, p) {
        const m = mat(p.G);
        c.cur = P.head;
        poly(c, [[22, 8], [42, 8], [42, 1], [38, 5], [35, 0], [32, 4], [29, 0], [26, 5], [22, 1]], m, { edge: true });
        ell(c, 32, 6, 1.5, 1.4, mat('#3a7bd5'), { tone: 0 }); ell(c, 26, 6, 1.2, 1.2, mat('#e0314b'), { tone: 0 }); ell(c, 38, 6, 1.2, 1.2, mat('#e0314b'), { tone: 0 });
      } },
    { id: 'acc_halo', cat: 'acc', sits: 'top', name: 'Нимб', en: 'Halo', style: 'fantasy', rarity: 'legendary', price: 4000,
      pal: { A: '#fff3a0', B: '#ffe066', C: '#fff8cc' },
      draw(c, k, p) {
        c.cur = P.head;
        const h = c.layer('fx-pulse', true);
        for (let x = 22; x <= 41; x++) { const y = 1 + Math.round(Math.pow((x + 0.5 - 32) / 10, 2) * 2); h.px(x, y, p.A); h.px(x, y + 1, (x < 32 ? x : 63 - x) % 3 ? p.B : p.C); }
      } },
    { id: 'acc_wings', cat: 'acc', name: 'Ангельские крылья', en: 'Angel wings', style: 'fantasy', rarity: 'legendary', price: 4500, part: 'torso',
      pal: { W: '#f4f8ff', B: '#bcd0f5', E: '#7f9fdc' },
      draw(c, k, p) {
        c.cur = P.torso;
        // крылья за спиной машут: кадр с поднятыми и с опущенными кончиками
        [['fx-a', 0], ['fx-b', 5]].forEach(([cls, flap]) => {
          const l = c.layer(cls, true, true);
          [-1, 1].forEach((side) => {
            const x0 = side < 0 ? 27 : 36, len = 22;
            for (let u = 0; u <= len; u++) {
              const x = x0 + side * u, f = u / len;
              const top = Math.round(37 - u * 1.05 + flap * f + (u > len - 3 ? (u - len + 3) * 2 : 0));
              const scal = (u % 4) < 2 ? 0 : -2;
              const bot = Math.round(41 - u * 0.25 + flap * f * 0.5 + scal - (u > len - 4 ? (u - len + 4) * 2 : 0));
              for (let y = top; y <= bot; y++) {
                const edge = y === top || y === bot || u === len;
                l.px(x, y, edge ? p.E : y > bot - 3 ? p.B : p.W);
              }
            }
          });
        });
      } },
  ];

  // ===================== ТАНЦЫ =====================
  // Танец — это несколько кадров. В каждом кадре части тела сдвигаются (T) и поворачиваются (R)
  // вокруг своих точек (плечо, бедро, шея). Кадры сменяются рывком, как в пиксельных играх.
  // Координаты — в пикселях сетки 64×64. Поворот руки на +90° — рука в сторону (левая — влево),
  // для правой руки то же движение — −90°.
  const T = (x, y) => 'translate(' + x + 'px,' + y + 'px)';
  const R = (a) => 'rotate(' + a + 'deg)';
  const DANCES = {
    six7: { dur: 0.6, frames: [
      { larm: T(0, -7) + R(42), rarm: T(0, 3) + R(-42), all: T(0, 0), head: R(-4) },
      { larm: T(0, -2) + R(42), rarm: T(0, -2) + R(-42), all: T(0, 1) },
      { larm: T(0, 3) + R(42), rarm: T(0, -7) + R(-42), all: T(0, 0), head: R(4) },
      { larm: T(0, -2) + R(42), rarm: T(0, -2) + R(-42), all: T(0, 1) },
    ] },
    floss: { dur: 0.9, frames: [
      { larm: T(8, 0) + R(18), rarm: T(8, 0) + R(18), torso: T(-2, 0), head: T(-2, 0), legl: T(-2, 0), legr: T(-2, 0) },
      { larm: T(0, 0), rarm: T(0, 0) },
      { larm: T(-8, 0) + R(-18), rarm: T(-8, 0) + R(-18), torso: T(2, 0), head: T(2, 0), legl: T(2, 0), legr: T(2, 0) },
      { larm: T(0, 0), rarm: T(0, 0) },
    ] },
    dab: { dur: 1.6, frames: [
      { all: T(0, 0) },
      { larm: R(-140), rarm: R(-118), head: T(2, -1) + R(-12), all: T(0, 1) },
      { larm: R(-140), rarm: R(-118), head: T(2, -1) + R(-12), all: T(0, 1) },
      { all: T(0, 0) },
    ] },
    robot: { dur: 1.4, frames: [
      { larm: R(90), head: R(8) },
      { larm: R(90), rarm: R(-90), head: R(0) },
      { larm: R(0), rarm: R(-90), head: R(-8) },
      { all: T(0, 1) },
    ] },
    runningman: { dur: 0.6, frames: [
      { legl: T(0, -5), all: T(0, -1), larm: R(-25), rarm: R(-25) },
      { legr: T(0, -5), all: T(0, -1), larm: R(25), rarm: R(25) },
    ] },
    shuffle: { dur: 0.8, frames: [
      { legl: T(-3, 0) + R(18), legr: T(3, 0) + R(-18), larm: T(0, -3) + R(35), rarm: T(0, -3) + R(-35), all: T(1, 0) },
      { all: T(0, 1) },
      { legl: T(-3, 0) + R(18), legr: T(3, 0) + R(-18), larm: T(0, -3) + R(35), rarm: T(0, -3) + R(-35), all: T(-1, 0) },
      { all: T(0, 1) },
    ] },
    carlton: { dur: 1.0, frames: [
      { larm: R(45), rarm: R(45), torso: T(3, 0), legl: T(3, 0), legr: T(3, 0), head: T(-1, 0) },
      { larm: R(-45), rarm: R(-45), torso: T(-3, 0), legl: T(-3, 0), legr: T(-3, 0), head: T(1, 0) },
    ] },
    macarena: { dur: 3.2, frames: [
      { larm: R(75) },
      { larm: R(75), rarm: R(-75) },
      { larm: R(155), rarm: R(-75) },
      { larm: R(155), rarm: R(-155) },
      { larm: T(3, -5) + R(25), rarm: R(-155) },
      { larm: T(3, -5) + R(25), rarm: T(-3, -5) + R(-25) },
      { larm: T(3, -5) + R(25), rarm: T(-3, -5) + R(-25), torso: T(3, 0), legl: T(3, 0), legr: T(3, 0) },
      { all: T(0, -4) },
    ] },
    bounce: { dur: 0.6, frames: [
      { all: T(0, 2), head: T(0, 1) + R(10), larm: R(12), rarm: R(-12) },
      { all: T(0, 0), head: R(-3) },
    ] },
    gangnam: { dur: 0.7, frames: [
      { legl: T(0, -4), larm: T(6, -3) + R(-35), rarm: T(-6, -3) + R(35), all: T(0, -2) },
      { legr: T(0, -4), larm: T(6, -3) + R(-35), rarm: T(-6, -3) + R(35), all: T(0, 0) },
    ] },
    moonwalk: { dur: 1.4, frames: [
      { all: T(6, 0), legl: T(0, -3) },
      { all: T(3, 0), legr: T(0, -3) },
      { all: T(0, 0), legl: T(0, -3) },
      { all: T(-3, 0), legr: T(0, -3) },
      { all: T(-6, 0), legl: T(0, -3) },
      { all: T(-3, 0), legr: T(0, -3) },
      { all: T(0, 0), legl: T(0, -3) },
      { all: T(3, 0), legr: T(0, -3) },
    ] },
    twist: { dur: 0.6, frames: [
      { torso: T(2, 0), legl: R(12), legr: R(12), larm: R(35), rarm: R(-10), head: T(-1, 0) },
      { torso: T(-2, 0), legl: R(-12), legr: R(-12), larm: R(10), rarm: R(-35), head: T(1, 0) },
    ] },
    disco: { dur: 1.0, frames: [
      { rarm: R(-160), larm: R(20), all: T(2, 0), head: R(-8) },
      { rarm: R(-30), larm: R(10), all: T(-2, 0), head: R(6) },
    ] },
    windmill: { dur: 0.8, frames: [
      { rarm: R(0) }, { rarm: R(-90), all: T(0, 1) }, { rarm: R(-180) }, { rarm: R(-270), all: T(0, 1) },
    ] },
    spin: { dur: 1.2, frames: [
      { all: 'scaleX(1)' }, { all: 'scaleX(0.45)' }, { all: 'scaleX(-1)' }, { all: 'scaleX(-0.45)' },
    ] },
    jacks: { dur: 0.7, frames: [
      { larm: R(160), rarm: R(-160), legl: T(-3, 0) + R(18), legr: T(3, 0) + R(-18), all: T(0, -4) },
      { all: T(0, 0) },
    ] },
    lforehead: { dur: 1.2, frames: [
      { larm: T(3, 0) + R(168), legl: T(0, -3) + R(22), all: T(0, -1) },
      { larm: T(3, 0) + R(168), legr: T(0, -3) + R(-22), all: T(0, 0) },
    ] },
    clap: { dur: 0.8, frames: [
      { larm: R(150), rarm: R(-150), all: T(0, 0) },
      { larm: T(4, 0) + R(172), rarm: T(-4, 0) + R(-172), all: T(0, -2) },
    ] },
    wave: { dur: 1.0, frames: [
      { larm: T(0, -4) + R(90) },
      { larm: T(0, -2) + R(90), head: T(0, -3) },
      { larm: T(0, 0) + R(90), rarm: T(0, -4) + R(-90), torso: T(0, -1) },
      { rarm: T(0, -2) + R(-90) },
    ] },
    charleston: { dur: 0.8, frames: [
      { legl: T(0, -2) + R(32), rarm: R(-45), larm: R(10), all: T(0, -1) },
      { legr: T(0, -2) + R(-32), larm: R(45), rarm: R(-10), all: T(0, -1) },
    ] },
  };

  // CSS для танцев создаётся один раз, при первом показе танцующего персонажа.
  let danceCssDone = false;
  function ensureDanceCss() {
    if (danceCssDone) return;
    danceCssDone = true;
    let css = '';
    Object.keys(DANCES).forEach((id) => {
      const d = DANCES[id];
      const n = d.frames.length;
      ['all', 'head', 'torso', 'larm', 'rarm', 'legl', 'legr'].forEach((part) => {
        if (!d.frames.some((f) => f[part])) return;
        const name = 'pfd-' + id + '-' + part;
        let kf = '';
        d.frames.forEach((f, i) => {
          kf += (i * 100 / n).toFixed(2) + '%{transform:' + (f[part] || 'none') + '}';
        });
        kf += '100%{transform:' + (d.frames[n - 1][part] || 'none') + '}';
        css += '@keyframes ' + name + '{' + kf + '}' +
          '.dance-' + id + ' .pp-' + part + '{animation:' + name + ' ' + d.dur + 's steps(1,end) infinite}';
      });
    });
    const st = document.createElement('style');
    st.id = 'pf-dances';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // Танцы в магазине: id, название, цена.
  const DANCE_ITEMS = [
    ['bounce', 'Хип-хоп кач', 'Hip-hop Bounce', 'street', 'common', 150],
    ['clap', 'Хлопки', 'Clap', 'sport', 'common', 180],
    ['wave', 'Волна', 'The Wave', 'street', 'common', 200],
    ['twist', 'Твист', 'Twist', 'classic', 'common', 220],
    ['jacks', 'Джампинг-джек', 'Jumping Jacks', 'sport', 'common', 250],
    ['runningman', 'Бегущий человек', 'Running Man', 'street', 'common', 280],
    ['carlton', 'Карлтон', 'Carlton', 'classic', 'common', 300],
    ['robot', 'Робот', 'Robot', 'street', 'common', 320],
    ['macarena', 'Макарена', 'Macarena', 'classic', 'common', 350],
    ['disco', 'Диско', 'Disco', 'classic', 'common', 380],
    ['charleston', 'Чарльстон', 'Charleston', 'classic', 'common', 400],
    ['lforehead', 'L на лбу', 'L on Forehead', 'street', 'rare', 500],
    ['dab', 'Даб', 'Dab', 'street', 'rare', 550],
    ['floss', 'Флосс', 'Floss', 'street', 'rare', 600],
    ['windmill', 'Мельница', 'Windmill', 'sport', 'rare', 650],
    ['six7', '67', '67', 'street', 'rare', 670],
    ['shuffle', 'Электро-шаффл', 'Electro Shuffle', 'street', 'rare', 700],
    ['spin', 'Вращение', 'Spin', 'fantasy', 'rare', 750],
    ['gangnam', 'Гангнам', 'Gangnam Style', 'street', 'rare', 800],
    ['moonwalk', 'Лунная походка', 'Moonwalk', 'classic', 'rare', 900],
  ];
  DANCE_ITEMS.forEach(([dance, name, en, style, rarity, price]) => {
    ITEMS.push({ id: 'dance_' + dance, cat: 'dance', name, en, style, rarity, price, dance, draw() {} });
  });

  const byId = {};
  ITEMS.forEach((it) => { byId[it.id] = it; });

  const CATS = [
    { id: 'hair', name: 'Причёски' },
    { id: 'top', name: 'Верх' },
    { id: 'pants', name: 'Штаны' },
    { id: 'shoes', name: 'Обувь' },
    { id: 'acc', name: 'Аксессуары' },
    { id: 'dance', name: 'Танцы' },
  ];
  const LAYER_ORDER = ['shoes', 'pants', 'top', 'hair', 'acc'];
  const BASE = { hair: 'hair_short', top: 'top_tee', pants: 'pants_jeans', shoes: 'shoes_keds', acc: null, dance: null };

  const RARITY = {
    base: { name: 'бесплатная', color: '#9aa0a8' },
    common: { name: 'обычная', color: '#9aa0a8' },
    rare: { name: 'редкая', color: '#3b82f6' },
    legendary: { name: 'легендарная', color: '#f59e0b' },
  };
  const STYLES = { base: 'Базовый', sport: 'Спорт', classic: 'Классика', street: 'Уличный', fantasy: 'Фэнтези' };

  // Название вещи на текущем языке.
  const itemName = (it) => (PF.i18n && PF.i18n.lang === 'en' ? it.en : it.name);
  const colorName = (i) => (PF.i18n && PF.i18n.lang === 'en' ? PALETTE[i].en : PALETTE[i].ru);
  // Стоимость нового цвета: 20% цены вещи, округлённо до 10, но не меньше 30.
  const colorPrice = (it) => Math.max(30, Math.round(it.price * 0.2 / 10) * 10);


  // ---------- сборка картинки ----------

  // look: { g, skin, eyes, hc, eq: { cat: id }, col: { cat: номер цвета } }
  function compose(look) {
    const hair = HAIR[look.hc] || HAIR[1];
    const [hh, hs, hl] = hsl(hair);
    const k = {
      G: geo(look.g),
      skin: SKINS[look.skin] || SKINS[1],
      eye: EYES[look.eyes] || EYES[0],
      hair,
      brow: fromHsl(hh, hs, Math.max(0.08, hl - 0.15)),
    };
    const c = new Canvas();
    const palOf = (it, cat) => (it.pal ? (Number.isInteger(look.col && look.col[cat]) ? recolor(it.pal, look.col[cat]) : it.pal) : {});
    // головной убор прячет волосы выше своего нижнего края
    const accIt = byId[look.eq && look.eq.acc];
    const hat = accIt && accIt.cat === 'acc' && accIt.hat !== undefined ? hatClip(accIt, k, palOf(accIt, 'acc')) : null;
    // длинный верх (тренч, кардиган) прячет края широких юбок и штанов, которые торчали бы из-под него по бокам
    const topIt = byId[look.eq && look.eq.top];
    const coat = topIt && topIt.cat === 'top' && topIt.long ? coatClip(topIt, k, palOf(topIt, 'top')) : null;
    // волосы за спиной — до тела
    const hairIt = byId[look.eq && look.eq.hair];
    if (hairIt && hairIt.back) { c.cur = P.head; c.clip = hat; hairIt.back(c, k, palOf(hairIt, 'hair')); c.clip = null; }
    drawBody(c, k);
    // высокая обувь (сапоги) надевается поверх штанин
    // (кроме широких штанов и клёша — они свободно лежат поверх сапог)
    const shoe = byId[look.eq && look.eq.shoes], pantsIt = byId[look.eq && look.eq.pants];
    const order = shoe && shoe.tall && !(pantsIt && pantsIt.over) ? ['pants', 'shoes', 'top', 'hair', 'acc'] : LAYER_ORDER;
    order.forEach((cat) => {
      const it = byId[look.eq && look.eq[cat]];
      if (!it || it.cat !== cat) return;
      const p = palOf(it, cat);
      c.cur = it.part ? P[it.part] : cat === 'hair' ? P.head : P.torso;
      if (cat === 'hair') {
        c.clip = hat; it.draw(c, k, p); c.clip = null;
        k.top = hairTop(c);
      } else if (cat === 'pants' && coat) {
        c.clip = coat; it.draw(c, k, p); c.clip = null;
      } else if (it.sits) {
        // корона, нимб, цыплёнок сидят на причёске, а не тонут в ней
        if (!k.top) k.top = hairTop(c);
        drawShifted(c, it, k, p, (it.sits === 'top' ? k.top.abs - 3 : k.top.wide - 4));
      } else it.draw(c, k, p);
    });
    if (HAIR_LEGEND[look.hc]) legendHair(c, k, HAIR_LEGEND[look.hc]);
    c.syncOwn();
    return c;
  }

  // Высота причёски над головой: abs — самый верхний пиксель (пучок, шипы),
  // wide — верх широкой части (без узких пучков и гребней). Считается по середине головы.
  function hairTop(c) {
    let abs = null, wide = null;
    for (let y = -OY; y < 12 && wide === null; y++) {
      let n = 0;
      for (let x = 22; x <= 41; x++) if (c.m[IX(x, y)]) n++;
      if (n && abs === null) abs = y;
      if (n >= 14) wide = y;
    }
    if (abs === null) abs = 7;
    if (wide === null) wide = 7;
    return { abs, wide };
  }

  // Какие пиксели волос спрятать под головным убором. it.hat — строка, где убор шире всего:
  // выше неё волос не видно, по бокам от убора волосы начинаются чуть ниже (скос).
  function hatClip(it, k, p) {
    const tmp = new Canvas();
    it.draw(tmp, k, p);
    const row = it.hat;
    let x0 = N, x1 = -1;
    for (let y = row - 3; y < row; y++) {
      for (let x = 0; x < N; x++) if (tmp.m[IX(x, y)]) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    }
    return (x, y) => y < row + Math.min(6, Math.round(Math.max(0, x0 - x, x - x1) * 0.7));
  }

  // Длинный верх: в строках, которые он закрывает, штаны и юбки видны только в пределах его ширины.
  function coatClip(it, k, p) {
    const tmp = new Canvas();
    tmp.cur = P.torso;
    it.draw(tmp, k, p);
    const ext = {};
    for (let y = k.G.ty1 - 2; y < N; y++) {
      let x0 = N, x1 = -1;
      for (let x = 0; x < N; x++) {
        const i = IX(x, y);
        if (tmp.m[i] && tmp.part[i] === P.torso) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
      }
      if (x1 >= 0) ext[y] = [x0, x1];
    }
    return (x, y) => !!ext[y] && (x < ext[y][0] || x > ext[y][1]);
  }

  // Нарисовать вещь на отдельном холсте и перенести на основной со сдвигом по вертикали.
  function drawShifted(c, it, k, p, dy) {
    const tmp = new Canvas();
    tmp.cur = c.cur;
    it.draw(tmp, k, p);
    let minY = N;
    [tmp].concat(tmp.fx.map((f) => f.c)).forEach((src) => {
      for (let i = 0; i < N * NH; i++) if (src.m[i]) { minY = Math.min(minY, YI(i)); break; }
    });
    dy = Math.max(dy, -OY - minY);
    const put = (src, dst) => {
      for (let i = 0; i < N * NH; i++) {
        if (!src.m[i]) continue;
        const x = i % N, y = YI(i) + dy;
        dst.cur = src.part[i];
        dst.set(x, y, src.m[i], src.t[i]);
        if (src.raw[i]) dst.px(x, y, src.raw[i]);
      }
    };
    put(tmp, c);
    tmp.fx.forEach((f) => { const l = c.layer(f.cls, f.glow, f.back); put(f.c, l); });
    c.cur = tmp.cur;
  }

  // Перелив для легендарного цвета волос: градиент по диагонали, второй градиент на слое,
  // который плавно проявляется и гаснет (цвета «текут»), и искры в два кадра.
  function legendHair(c, k, L) {
    const hm = mat(k.hair);
    const idx = [];
    for (let i = 0; i < N * NH; i++) if (c.m[i] === hm && !c.raw[i]) idx.push(i);
    if (!idx.length) return;
    let lo = Infinity, hi = -Infinity;
    const pos = (i) => YI(i) + (i % N) * 0.45;
    idx.forEach((i) => { const v = pos(i); if (v < lo) lo = v; if (v > hi) hi = v; });
    const flow = c.layer('fx-shimmer', false);
    idx.forEach((i) => {
      const f = (pos(i) - lo) / Math.max(1, hi - lo);
      c.m[i] = mat(gradAt(L.grad, f));
      flow.cur = c.part[i];
      flow.set(i % N, YI(i), mat(gradAt(L.alt, f)), c.t[i]);
    });
    // скрытые копии волос (например, за руками) — тоже в перелив
    c.own.forEach((o) => {
      for (let i = 0; i < N * NH; i++) {
        if (o.m[i] === hm && !o.raw[i]) o.m[i] = mat(gradAt(L.grad, (pos(i) - lo) / Math.max(1, hi - lo)));
      }
    });
    const a = c.layer('fx-a', true), b = c.layer('fx-b', true);
    idx.forEach((i, n) => {
      const x = i % N, y = YI(i);
      if (c.t[i] > 1) return;
      const h = (x * 73 + y * 151) % 97;
      if (h === 3 || h === 41) { a.cur = c.part[i]; a.px(x, y, L.spark); }
      if (h === 17 || h === 66) { b.cur = c.part[i]; b.px(x, y, L.spark); }
      void n;
    });
  }

  // Готовые цвета пикселей + цветной контур снаружи силуэта.
  function paint(c, outline) {
    const col = new Array(N * NH).fill(null);
    const part = Int8Array.from(c.part);
    for (let i = 0; i < N * NH; i++) {
      if (c.raw[i]) col[i] = c.raw[i];
      else if (c.m[i]) col[i] = c.m[i].t[c.t[i]];
    }
    if (outline) {
      const add = [];
      for (let y = -OY; y < N; y++) {
        for (let x = 0; x < N; x++) {
          if (c.m[IX(x, y)]) continue;
          // сосед для цвета контура: сначала снизу/сверху, потом по бокам
          const nb = [[x, y + 1], [x, y - 1], [x - 1, y], [x + 1, y]].find(([a, b]) => c.filled(a, b));
          if (nb) { const j = IX(nb[0], nb[1]); add.push([IX(x, y), c.m[j].out, c.part[j]]); }
        }
      }
      add.forEach(([i, hex, p]) => { col[i] = hex; part[i] = p; });
    }
    return { c: col, p: part };
  }

  // Прямоугольники одной части тела (строки одинакового цвета склеиваются).
  function rects(img, part) {
    let out = '';
    const { c, p } = img;
    for (let y = -OY; y < N; y++) {
      let x = 0;
      while (x < N) {
        const i = IX(x, y);
        const col = c[i];
        if (!col || p[i] !== part) { x++; continue; }
        let w = 1;
        while (x + w < N && c[i + w] === col && p[i + w] === part) w++;
        out += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="1" fill="' + col + '"/>';
        x += w;
      }
    }
    return out;
  }

  // Порядок групп в SVG: ноги, туловище, голова, руки (руки поверх, когда поднимаются).
  const ORDER = ['legl', 'legr', 'torso', 'head', 'larm', 'rarm'];
  const ORD = PARTS.map((name) => ORDER.indexOf(name));

  // Раскладка готовой картинки по частям тела. В каждой части — её видимые пиксели и
  // скрытые под другими частями (они проявляются, когда в танце часть сдвигается).
  // Если видимый пиксель части лежит поверх части, которая рисуется позже (например,
  // прядь волос поверх руки), он попадает в «передний» слой этой части.
  function layered(c, img) {
    const normal = PARTS.map(() => new Array(N * NH).fill(null));
    const front = PARTS.map(() => new Array(N * NH).fill(null));
    const color = (o, i) => (o.raw[i] ? o.raw[i] : o.m[i] ? o.m[i].t[o.t[i]] : null);
    for (let i = 0; i < N * NH; i++) {
      const top = img.c[i];
      if (!top) continue;
      const q = img.p[i];
      let isFront = false;
      for (let p = 0; p < PARTS.length; p++) {
        if (p === q || !c.own[p].m[i]) continue;
        if (ORD[p] > ORD[q]) isFront = true;
        normal[p][i] = color(c.own[p], i); // скрытый пиксель другой части
      }
      (isFront ? front : normal)[q][i] = top;
    }
    return { normal, front };
  }
  function rectsOf(col) {
    let out = '';
    for (let y = -OY; y < N; y++) {
      let x = 0;
      while (x < N) {
        const i = IX(x, y);
        const v = col[i];
        if (!v) { x++; continue; }
        let w = 1;
        while (x + w < N && col[i + w] === v) w++;
        out += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="1" fill="' + v + '"/>';
        x += w;
      }
    }
    return out;
  }

  // Точки вращения частей тела: плечи, бёдра, шея.
  function pivots(G) {
    return {
      legl: [27, 47], legr: [36, 47], torso: [32, 46], head: [32, 30],
      larm: [G.ax0 + 2, 34], rarm: [G.bx0 + 2, 34],
    };
  }

  // Готовые картинки кэшируются: одна и та же внешность рисуется много раз.
  const cache = new Map();
  function build(look) {
    const key = JSON.stringify([look.g, look.skin, look.eyes, look.hc, look.eq, look.col]);
    let r = cache.get(key);
    if (r) return r;
    const c = compose(look);
    const img = paint(c, true);
    const lay = layered(c, img);
    const fx = c.fx.map((l) => ({ cls: l.cls, glow: l.glow, back: l.back, img: paint(l.c, false) }));
    const parts = PARTS.map((name, i) => ({
      name, main: rectsOf(lay.normal[i]), front: rectsOf(lay.front[i]),
      fx: fx.map((l) => ({ cls: l.cls, glow: l.glow, back: l.back, html: rects(l.img, i) })),
    }));
    r = { parts, piv: pivots(geo(look.g)), glow: fx.some((l) => l.glow) };
    if (cache.size > 300) cache.clear();
    cache.set(key, r);
    return r;
  }

  let svgId = 0;

  // SVG-картинка персонажа (64×64). size — сторона в пикселях (лучше кратно 64).
  function svg(look, size) {
    const r = build(look);
    const id = 'pfglow' + (++svgId);
    const dance = look.eq && look.eq.dance && byId[look.eq.dance] ? byId[look.eq.dance].dance : '';
    if (dance) ensureDanceCss();
    let body = '';
    const open = (name) => { const [ox, oy] = r.piv[name]; return '<g class="pp pp-' + name + '" style="transform-origin:' + ox + 'px ' + oy + 'px">'; };
    ORDER.forEach((name) => {
      const part = r.parts[PARTS.indexOf(name)];
      const [ox, oy] = r.piv[name];
      let inner = part.main;
      part.fx.forEach((f) => {
        if (!f.html) return;
        const g = '<g class="fx ' + f.cls + '"' + (f.glow ? ' filter="url(#' + id + ')"' : '') + '>' + f.html + '</g>';
        inner = f.back ? g + inner : inner + g;
      });
      if (inner) body += open(name) + inner + '</g>';
      void ox; void oy;
    });
    // передние слои (пряди поверх рук и т. п.) — после всех частей, двигаются со своей частью
    ORDER.forEach((name) => {
      const part = r.parts[PARTS.indexOf(name)];
      if (part.front) body += open(name) + part.front + '</g>';
    });
    const defs = r.glow
      ? '<defs><filter id="' + id + '" x="-50%" y="-50%" width="200%" height="200%">' +
        '<feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/>' +
        '<feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'
      : '';
    return '<svg class="pix' + (dance ? ' dancing dance-' + dance : '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 64 64" ' +
      'shape-rendering="crispEdges" overflow="visible" style="overflow:visible" aria-hidden="true">' + defs +
      '<g class="pp pp-all" style="transform-origin:32px 62px">' + body + '</g></svg>';
  }

  PF.char = {
    SKINS, EYES, HAIR, EYE_NAMES, HAIR_NAMES, PALETTE, HAIR_PRICE, HAIR_LEGEND, hairSwatch,
    ITEMS, byId, CATS, BASE, RARITY, STYLES,
    itemName, colorName, colorPrice,
    svg,
    compose,
    DANCES,
    recolor,
    // служебное — для автопроверок (tests/char-audit.js): холст, размеры, части тела
    _dbg: { Canvas, N, OY, P, PARTS, ORDER, geo, pivots, paint, layered },
  };
})(window.PF);
