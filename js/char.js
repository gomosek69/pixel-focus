// Пиксельный персонаж 32×32: тело, вещи, перекраска и сборка картинки.
//
// Всё рисуется кодом: каждая вещь — функция, которая закрашивает клетки сетки 32×32.
// Порядок слоёв: тело → обувь → штаны → верх → причёска → аксессуар.
// Затем вокруг фигуры автоматически рисуется тёмный контур.
// Особые эффекты (свечение, анимация) рисуются отдельными слоями поверх и без контура.
// Картинка выводится как SVG из квадратиков, поэтому при увеличении не размывается.
//
// Перекраска: у вещи есть палитра pal ({ C: основной, D: тень, ... }).
// Функция рисования получает палитру p — исходную или перекрашенную в выбранный цвет.
// При перекраске каждый цвет палитры получает новый оттенок, а разница в яркости
// между ним и основным цветом сохраняется (тени остаются тенями).
(function (PF) {
  'use strict';

  const N = 32;
  const OUTLINE = '#2b2233';

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
  const HAIR = ['#2a2320', '#6b4226', '#a0522d', '#e2bd62', '#c8452c', '#d9d9de'];
  const EYE_NAMES = ['Карие', 'Голубые', 'Зелёные', 'Серые', 'Ореховые', 'Фиолетовые'];
  const HAIR_NAMES = ['Чёрные', 'Каштановые', 'Рыжевато-каштановые', 'Светлые', 'Рыжие', 'Седые'];

  // ---------- сетка ----------

  class Grid {
    constructor() {
      this.c = new Array(N * N).fill(null);
      this.fx = [];
    }
    px(x, y, col) {
      if (x >= 0 && x < N && y >= 0 && y < N) this.c[y * N + x] = col;
    }
    get(x, y) {
      return x >= 0 && x < N && y >= 0 && y < N ? this.c[y * N + x] : null;
    }
    rect(x, y, w, h, col) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, col);
    }
    hline(x1, x2, y, col) { for (let x = x1; x <= x2; x++) this.px(x, y, col); }
    vline(x, y1, y2, col) { for (let y = y1; y <= y2; y++) this.px(x, y, col); }
    pts(list, col) { list.forEach(([x, y]) => this.px(x, y, col)); }
    mirror(list, col) { list.forEach(([x, y]) => { this.px(x, y, col); this.px(31 - x, y, col); }); }
    layer(cls, glow) {
      const g = new Grid();
      this.fx.push({ cls, glow: !!glow, grid: g });
      return g;
    }
  }

  function outline(g) {
    const out = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (g.get(x, y)) continue;
        if (g.get(x - 1, y) || g.get(x + 1, y) || g.get(x, y - 1) || g.get(x, y + 1)) out.push([x, y]);
      }
    }
    out.forEach(([x, y]) => g.px(x, y, OUTLINE));
  }

  // ---------- фигура ----------

  function geo(gender) {
    return gender === 'f'
      ? { fem: true, tl: 11, tr: 20, al: 9, ar: 21 }
      : { fem: false, tl: 10, tr: 21, al: 8, ar: 22 };
  }

  function drawBody(g, c) {
    const b = c.b;
    const S = c.skin;
    const D = c.skinS;
    g.hline(12, 19, 4, S);
    g.hline(11, 20, 5, S);
    for (let y = 6; y <= 13; y++) g.hline(10, 21, y, S);
    g.hline(11, 20, 14, S);
    g.hline(12, 19, 15, S);
    for (let y = 6; y <= 13; y++) g.px(21, y, D);
    g.px(20, 14, D);
    g.px(19, 15, D);
    g.vline(9, 9, 11, S);
    g.vline(22, 9, 11, D);
    g.hline(14, 17, 16, D);
    g.hline(b.tl + 1, b.tr - 1, 17, S);
    g.rect(b.tl, 18, b.tr - b.tl + 1, 7, S);
    g.rect(b.al, 18, 2, 7, S);
    g.rect(b.ar, 18, 2, 7, S);
    g.vline(b.ar + 1, 18, 24, D);
    g.hline(11, 20, 25, S);
    g.rect(11, 26, 4, 3, S);
    g.rect(17, 26, 4, 3, S);
    g.vline(14, 26, 28, D);
    g.vline(20, 26, 28, D);
    g.rect(10, 29, 5, 2, S);
    g.rect(17, 29, 5, 2, S);
    g.hline(12, 13, 8, c.brow);
    g.hline(18, 19, 8, c.brow);
    g.rect(12, 10, 2, 2, c.eye);
    g.rect(18, 10, 2, 2, c.eye);
    g.px(13, 10, '#ffffff');
    g.px(19, 10, '#ffffff');
    if (b.fem) {
      g.px(11, 10, OUTLINE);
      g.px(20, 10, OUTLINE);
      g.px(11, 12, '#f19a9a');
      g.px(20, 12, '#f19a9a');
      g.hline(15, 16, 13, '#d0606a');
    } else {
      g.hline(15, 16, 13, '#b0574f');
    }
  }

  // ---------- помощники для одежды ----------

  function torso(g, b, C, D) {
    g.hline(b.tl + 1, b.tr - 1, 17, C);
    g.rect(b.tl, 18, b.tr - b.tl + 1, 6, C);
    g.vline(b.tr, 18, 23, D);
  }
  function sleeves(g, b, C, D, len) {
    g.rect(b.al, 18, 2, len, C);
    g.rect(b.ar, 18, 2, len, C);
    g.vline(b.ar + 1, 18, 17 + len, D);
  }
  function cuffs(g, b, col) {
    g.hline(b.al, b.al + 1, 23, col);
    g.hline(b.ar, b.ar + 1, 23, col);
  }
  function pants(g, b, C, D, bottom) {
    g.hline(b.tl, b.tr, 24, C);
    g.hline(11, 20, 25, C);
    g.rect(11, 26, 4, bottom - 25, C);
    g.rect(17, 26, 4, bottom - 25, C);
    g.vline(14, 25, bottom, D);
    g.vline(20, 25, bottom, D);
  }
  function legs(g, C, y1, y2) {
    g.rect(11, y1, 4, y2 - y1 + 1, C);
    g.rect(17, y1, 4, y2 - y1 + 1, C);
  }
  function feet(g, C, rowY) {
    g.hline(10, 14, rowY, C);
    g.hline(17, 21, rowY, C);
  }
  function hairTop(g, c) {
    g.hline(12, 19, 3, c.hc);
    g.hline(11, 20, 4, c.hc);
    g.hline(10, 21, 5, c.hc);
    g.hline(10, 21, 6, c.hc);
    g.hline(13, 15, 4, c.hl);
    g.hline(19, 21, 6, c.hs);
  }
  function fringe(g, c) {
    [10, 11, 12, 15, 16, 19, 20, 21].forEach((x) => g.px(x, 7, c.hc));
  }

  // ---------- каталог вещей ----------
  // rarity: base (бесплатная), common, rare, legendary
  // style: base, sport, classic, street, fantasy
  // pal: цвета, которые меняются при перекраске (первый — основной).
  // Причёски без pal красятся бесплатным цветом волос.

  const ITEMS = [
    // ===================== ПРИЧЁСКИ =====================
    { id: 'hair_short', cat: 'hair', name: 'Короткая', en: 'Short', style: 'base', rarity: 'base', price: 0,
      draw(g, c) { hairTop(g, c); fringe(g, c); g.vline(10, 8, 9, c.hc); g.vline(21, 7, 9, c.hs); } },
    { id: 'hair_long', cat: 'hair', name: 'Длинная', en: 'Long', style: 'base', rarity: 'base', price: 0,
      draw(g, c) {
        hairTop(g, c);
        g.hline(10, 14, 7, c.hc); g.hline(17, 21, 7, c.hc);
        g.rect(9, 6, 2, 14, c.hc); g.rect(21, 6, 2, 14, c.hc);
        g.vline(22, 6, 19, c.hs); g.px(9, 20, c.hc); g.px(22, 20, c.hs);
      } },
    { id: 'hair_buzz', cat: 'hair', name: 'Бокс', en: 'Buzz cut', style: 'sport', rarity: 'common', price: 100,
      draw(g, c) {
        g.hline(12, 19, 3, c.hs); g.hline(11, 20, 4, c.hc); g.hline(10, 21, 5, c.hc);
        g.pts([[10, 6], [11, 6], [20, 6], [21, 6]], c.hs); g.pts([[14, 4], [15, 4]], c.hl);
      } },
    { id: 'hair_spiky', cat: 'hair', name: 'Ёжик', en: 'Spiky', style: 'street', rarity: 'common', price: 150,
      draw(g, c) {
        hairTop(g, c);
        g.pts([[11, 2], [12, 2], [14, 2], [15, 2], [17, 2], [18, 2], [20, 2], [12, 1], [15, 1], [18, 1]], c.hc);
        g.pts([[15, 1], [12, 2]], c.hl);
        g.pts([[10, 7], [11, 7], [20, 7], [21, 7]], c.hc);
      } },
    { id: 'hair_side', cat: 'hair', name: 'Чёлка набок', en: 'Side part', style: 'classic', rarity: 'common', price: 180,
      draw(g, c) {
        hairTop(g, c);
        g.hline(10, 17, 7, c.hc); g.hline(10, 13, 8, c.hc);
        g.vline(21, 7, 9, c.hs); g.px(17, 4, c.hs); g.px(18, 5, c.hs);
      } },
    { id: 'hair_curly', cat: 'hair', name: 'Кудри', en: 'Curly', style: 'classic', rarity: 'common', price: 200,
      draw(g, c) {
        const cells = [];
        const add = (x1, x2, y) => { for (let x = x1; x <= x2; x++) cells.push([x, y]); };
        add(11, 13, 2); add(16, 18, 2); add(10, 21, 3);
        for (let y = 4; y <= 7; y++) add(9, 22, y);
        add(9, 11, 8); add(20, 22, 8); add(9, 10, 9); add(21, 22, 9); add(9, 10, 10); add(21, 22, 10);
        cells.forEach(([x, y]) => g.px(x, y, (x * 7 + y * 3) % 5 === 0 ? c.hs : c.hc));
        g.hline(12, 14, 3, c.hl);
      } },
    { id: 'hair_bun', cat: 'hair', name: 'Пучок', en: 'Bun', style: 'classic', rarity: 'common', price: 220,
      draw(g, c) {
        hairTop(g, c);
        g.pts([[10, 7], [11, 7], [12, 7], [19, 7], [20, 7], [21, 7]], c.hc); g.vline(10, 8, 9, c.hc);
        g.hline(14, 17, 0, c.hc); g.hline(13, 18, 1, c.hc); g.hline(13, 18, 2, c.hc);
        g.px(15, 1, c.hl); g.px(18, 2, c.hs);
      } },
    { id: 'hair_ponytail', cat: 'hair', name: 'Хвостик', en: 'Ponytail', style: 'sport', rarity: 'common', price: 250,
      draw(g, c) {
        hairTop(g, c);
        g.hline(10, 16, 7, c.hc); g.vline(10, 8, 9, c.hc); g.vline(21, 7, 8, c.hs);
        g.px(22, 6, '#e74c3c'); g.rect(22, 7, 2, 6, c.hc); g.vline(23, 7, 14, c.hs);
      } },
    { id: 'hair_pigtails', cat: 'hair', name: 'Два хвостика', en: 'Pigtails', style: 'sport', rarity: 'common', price: 280,
      draw(g, c) {
        hairTop(g, c);
        g.hline(10, 14, 7, c.hc); g.hline(17, 21, 7, c.hc);
        g.rect(7, 8, 2, 6, c.hc); g.rect(23, 8, 2, 6, c.hc);
        g.vline(7, 9, 13, c.hs); g.vline(24, 9, 13, c.hs);
        g.pts([[9, 8], [22, 8]], '#ec6fae');
      } },
    { id: 'hair_afro', cat: 'hair', name: 'Афро', en: 'Afro', style: 'street', rarity: 'common', price: 300,
      draw(g, c) {
        const cells = [];
        const add = (x1, x2, y) => { for (let x = x1; x <= x2; x++) cells.push([x, y]); };
        add(12, 19, 0); add(10, 21, 1); add(9, 22, 2);
        for (let y = 3; y <= 6; y++) add(8, 23, y);
        for (let y = 7; y <= 10; y++) { add(8, 10, y); add(21, 23, y); }
        add(9, 10, 11); add(21, 22, 11);
        cells.forEach(([x, y]) => g.px(x, y, (x * 5 + y * 7) % 6 === 0 ? c.hs : c.hc));
        g.hline(12, 15, 1, c.hl);
      } },
    { id: 'hair_mohawk', cat: 'hair', name: 'Ирокез', en: 'Mohawk', style: 'street', rarity: 'common', price: 350,
      draw(g, c) {
        g.hline(11, 20, 4, c.hs); g.hline(10, 21, 5, c.hs); g.pts([[10, 6], [21, 6]], c.hs);
        g.rect(14, 1, 4, 6, c.hc); g.hline(15, 16, 0, c.hc); g.vline(15, 1, 4, c.hl);
      } },
    { id: 'hair_topknot', cat: 'hair', name: 'Самурайский пучок', en: 'Topknot', style: 'fantasy', rarity: 'rare', price: 650,
      draw(g, c) {
        g.hline(12, 19, 3, c.hc); g.hline(11, 20, 4, c.hc); g.hline(10, 21, 5, c.hc); g.hline(10, 21, 6, c.hc);
        g.pts([[10, 7], [21, 7]], c.hc); g.hline(19, 21, 6, c.hs);
        g.hline(15, 16, 0, c.hc); g.hline(14, 17, 1, c.hc); g.hline(15, 16, 2, '#c0392b');
      } },
    { id: 'hair_bob', cat: 'hair', name: 'Каре', en: 'Bob', style: 'classic', rarity: 'rare', price: 600,
      draw(g, c) {
        hairTop(g, c);
        g.hline(10, 21, 7, c.hc);
        g.rect(9, 7, 2, 8, c.hc); g.rect(21, 7, 2, 8, c.hc); g.vline(22, 7, 14, c.hs);
        g.hline(9, 11, 15, c.hs); g.hline(20, 22, 15, c.hs);
      } },
    { id: 'hair_wavy', cat: 'hair', name: 'Длинные волны', en: 'Long waves', style: 'classic', rarity: 'rare', price: 700,
      draw(g, c) {
        hairTop(g, c);
        g.hline(10, 14, 7, c.hc); g.hline(17, 21, 7, c.hc);
        for (let y = 6; y <= 21; y++) {
          const o = y % 4 < 2 ? 0 : -1;
          g.hline(9 + o, 10 + o, y, c.hc);
          g.hline(21 - o, 22 - o, y, c.hs);
        }
      } },
    { id: 'hair_braids', cat: 'hair', name: 'Косички', en: 'Braids', style: 'street', rarity: 'rare', price: 800,
      draw(g, c) {
        hairTop(g, c); fringe(g, c);
        for (let y = 7; y <= 20; y++) {
          const col = y % 2 ? c.hc : c.hs;
          g.hline(9, 10, y, col); g.hline(21, 22, y, col);
        }
        g.hline(9, 10, 21, '#e74c3c'); g.hline(21, 22, 21, '#e74c3c');
      } },
    { id: 'hair_elf', cat: 'hair', name: 'Эльфийские волосы', en: 'Elven hair', style: 'fantasy', rarity: 'rare', price: 1000,
      draw(g, c) {
        hairTop(g, c);
        g.hline(10, 14, 7, c.hc); g.hline(17, 21, 7, c.hc);
        g.rect(9, 6, 2, 16, c.hc); g.rect(21, 6, 2, 16, c.hc); g.vline(22, 6, 21, c.hs);
        g.hline(10, 21, 6, '#e8c547'); g.pts([[15, 6], [16, 6]], '#3ec1d3');
        g.pts([[8, 9], [8, 10], [7, 8]], c.skin); g.pts([[23, 9], [23, 10], [24, 8]], c.skinS);
      } },
    { id: 'hair_fire', cat: 'hair', name: 'Огненные волосы', en: 'Fire hair', style: 'fantasy', rarity: 'legendary', price: 3500,
      pal: { F: '#ff5a1f', D: '#d63a12', L: '#ffb43a', T: '#ffe066' },
      draw(g, c, p) {
        g.hline(12, 19, 3, p.F); g.hline(11, 20, 4, p.L); g.hline(10, 21, 5, p.F); g.hline(10, 21, 6, p.F);
        g.hline(19, 21, 6, p.D);
        g.pts([[10, 7], [11, 7], [20, 7], [21, 7], [10, 8], [21, 8]], p.D);
        g.pts([[11, 2], [12, 2], [14, 2], [15, 2], [17, 2], [18, 2], [20, 2]], p.F);
        const a = g.layer('fx-a', true);
        a.pts([[12, 1], [15, 1], [18, 1], [20, 1]], p.L); a.pts([[12, 0], [15, 0], [18, 0]], p.T);
        const b2 = g.layer('fx-b', true);
        b2.pts([[11, 1], [14, 1], [17, 1], [19, 1]], p.L); b2.pts([[14, 0], [17, 0], [11, 0]], p.T);
        g.layer('fx-pulse', true).pts([[13, 3], [16, 3], [18, 4]], p.T);
      } },

    // ===================== ВЕРХ =====================
    { id: 'top_tee', cat: 'top', name: 'Базовая футболка', en: 'Basic T-shirt', style: 'base', rarity: 'base', price: 0,
      pal: { C: '#eef1f6', D: '#cfd5df' },
      draw(g, c, p) { torso(g, c.b, p.C, p.D); sleeves(g, c.b, p.C, p.D, 2); g.hline(14, 17, 17, p.D); } },
    { id: 'top_tank', cat: 'top', name: 'Спортивная майка', en: 'Tank top', style: 'sport', rarity: 'common', price: 150,
      pal: { C: '#e74c3c', D: '#b8392c' },
      draw(g, c, p) {
        const b = c.b;
        g.hline(b.tl + 1, b.tl + 2, 17, p.C); g.hline(b.tr - 2, b.tr - 1, 17, p.C);
        g.hline(b.tl + 1, b.tr - 1, 18, p.C); g.rect(b.tl, 19, b.tr - b.tl + 1, 5, p.C); g.vline(b.tr, 19, 23, p.D);
        g.pts([[15, 19], [16, 19], [16, 20], [16, 21], [15, 22]], '#ffffff');
      } },
    { id: 'top_print', cat: 'top', name: 'Футболка с принтом', en: 'Graphic tee', style: 'street', rarity: 'common', price: 200,
      pal: { C: '#2d2f3a', D: '#22232c' },
      draw(g, c, p) {
        torso(g, c.b, p.C, p.D); sleeves(g, c.b, p.C, p.D, 2); g.hline(14, 17, 17, p.D);
        g.hline(13, 18, 19, '#ff5d73'); g.hline(13, 18, 20, '#ffd23f'); g.hline(13, 18, 21, '#3ec1d3');
      } },
    { id: 'top_polo', cat: 'top', name: 'Поло', en: 'Polo shirt', style: 'sport', rarity: 'common', price: 250,
      pal: { C: '#2f9e8f', D: '#237a6e', L: '#53c1b2' },
      draw(g, c, p) {
        torso(g, c.b, p.C, p.D); sleeves(g, c.b, p.C, p.D, 2);
        g.pts([[13, 17], [14, 17], [17, 17], [18, 17]], p.L); g.pts([[15, 18], [15, 19]], '#ffffff');
      } },
    { id: 'top_stripes', cat: 'top', name: 'Тельняшка', en: 'Striped shirt', style: 'street', rarity: 'common', price: 300,
      pal: { C: '#2c3e7a', D: '#1f2d5c' },
      draw(g, c, p) {
        const b = c.b, W = '#f4f4f6';
        torso(g, b, W, '#d9dbe2'); sleeves(g, b, W, '#d9dbe2', 6);
        [18, 20, 22].forEach((y) => {
          g.hline(b.tl, b.tr, y, p.C); g.px(b.tr, y, p.D);
          g.hline(b.al, b.al + 1, y, p.C); g.hline(b.ar, b.ar + 1, y, p.C);
        });
      } },
    { id: 'top_jersey', cat: 'top', name: 'Футбольная форма', en: 'Football jersey', style: 'sport', rarity: 'common', price: 320,
      pal: { C: '#f5c83a', D: '#cfa52a' },
      draw(g, c, p) {
        const b = c.b, A = '#1e3a8a';
        torso(g, b, p.C, p.D); sleeves(g, b, p.C, p.D, 2);
        g.hline(b.tl + 1, b.tr - 1, 17, A); g.hline(b.al, b.al + 1, 19, A); g.hline(b.ar, b.ar + 1, 19, A);
        g.vline(14, 19, 21, A); g.pts([[16, 19], [17, 19], [16, 20], [17, 21], [16, 21], [17, 20]], A);
      } },
    { id: 'top_shirt', cat: 'top', name: 'Рубашка', en: 'Shirt', style: 'classic', rarity: 'common', price: 350,
      pal: { C: '#a9cdf0', D: '#86afd8', B: '#5d7fa6' },
      draw(g, c, p) {
        const b = c.b, W = '#ffffff';
        torso(g, b, p.C, p.D); sleeves(g, b, p.C, p.D, 6);
        g.pts([[13, 17], [14, 17], [17, 17], [18, 17], [14, 18], [17, 18]], W);
        g.vline(16, 18, 23, p.D); g.pts([[15, 19], [15, 21], [15, 23]], p.B); cuffs(g, b, W);
      } },
    { id: 'top_sweater', cat: 'top', name: 'Свитер', en: 'Sweater', style: 'classic', rarity: 'common', price: 380,
      pal: { C: '#c8553d', D: '#a1412e', L: '#e07a62' },
      draw(g, c, p) {
        const b = c.b;
        torso(g, b, p.C, p.D); sleeves(g, b, p.C, p.D, 6);
        g.hline(13, 18, 17, p.D);
        for (let x = b.tl; x <= b.tr; x += 2) { g.px(x, 19, p.L); g.px(x + 1, 21, p.L); }
        cuffs(g, b, p.D); g.hline(b.tl, b.tr, 23, p.D);
      } },
    { id: 'top_vest', cat: 'top', name: 'Жилетка', en: 'Vest', style: 'classic', rarity: 'common', price: 400,
      pal: { C: '#5a4636', D: '#43342a' },
      draw(g, c, p) {
        const b = c.b, W = '#f4f4f6';
        torso(g, b, p.C, p.D); sleeves(g, b, W, '#d9dbe2', 6);
        g.hline(14, 17, 17, W); g.hline(15, 16, 18, W); g.hline(15, 16, 19, W);
        g.pts([[15, 21], [15, 23]], '#d4af37'); g.hline(b.tl + 1, b.tr - 1, 17, p.C); g.hline(14, 17, 17, W);
      } },
    { id: 'top_hoodie', cat: 'top', name: 'Худи', en: 'Hoodie', style: 'street', rarity: 'rare', price: 700,
      pal: { C: '#3aa66a', D: '#2b8452' },
      draw(g, c, p) {
        const b = c.b;
        torso(g, b, p.C, p.D); sleeves(g, b, p.C, p.D, 6);
        g.hline(11, 13, 16, p.D); g.hline(18, 20, 16, p.D);
        g.pts([[14, 18], [14, 19], [17, 18], [17, 19]], '#ffffff');
        g.rect(13, 21, 6, 2, p.D); cuffs(g, b, p.D);
      } },
    { id: 'top_denim', cat: 'top', name: 'Джинсовка', en: 'Denim jacket', style: 'street', rarity: 'rare', price: 900,
      pal: { C: '#4a6fa5', D: '#38598a', L: '#6d8fc2' },
      draw(g, c, p) {
        const b = c.b;
        torso(g, b, p.C, p.D); sleeves(g, b, p.C, p.D, 6);
        g.hline(b.tl + 1, b.tl + 3, 17, p.L); g.hline(b.tr - 3, b.tr - 1, 17, p.L);
        g.pts([[15, 17], [16, 17]], '#eef1f6');
        g.hline(12, 13, 19, p.L); g.hline(18, 19, 19, p.L);
        g.vline(15, 18, 23, p.D); g.pts([[14, 20], [14, 22]], '#d4af37'); cuffs(g, b, p.L);
      } },
    { id: 'top_blazer', cat: 'top', name: 'Пиджак', en: 'Blazer', style: 'classic', rarity: 'rare', price: 1000,
      pal: { C: '#2c3e66', D: '#1f2d4d' },
      draw(g, c, p) {
        const b = c.b, W = '#ffffff';
        torso(g, b, p.C, p.D); sleeves(g, b, p.C, p.D, 6);
        g.hline(14, 17, 17, W); g.pts([[14, 18], [17, 18]], W);
        g.rect(15, 18, 2, 4, '#c0392b');
        g.pts([[13, 18], [18, 18], [14, 19], [17, 19]], p.D);
        g.px(15, 22, '#d4af37'); g.px(19, 19, W);
      } },
    { id: 'top_kimono', cat: 'top', name: 'Кимоно', en: 'Kimono', style: 'fantasy', rarity: 'rare', price: 1000,
      pal: { C: '#f2f0ea', D: '#d6d2c6' },
      draw(g, c, p) {
        const b = c.b;
        torso(g, b, p.C, p.D); sleeves(g, b, p.C, p.D, 6);
        g.hline(b.al - 1, b.al + 1, 22, p.C); g.hline(b.al - 1, b.al + 1, 23, p.D);
        g.hline(b.ar, b.ar + 2, 22, p.C); g.hline(b.ar, b.ar + 2, 23, p.D);
        g.pts([[14, 17], [14, 18], [15, 19], [16, 20], [17, 21]], p.D);
        g.hline(b.tl, b.tr, 22, '#2b2b33');
      } },
    { id: 'top_puffer', cat: 'top', name: 'Пуховик', en: 'Puffer jacket', style: 'street', rarity: 'rare', price: 1100,
      pal: { C: '#e85d3f', D: '#c0462c' },
      draw(g, c, p) {
        const b = c.b;
        torso(g, b, p.C, p.D); sleeves(g, b, p.C, p.D, 6);
        g.hline(12, 19, 16, p.C); g.hline(12, 19, 17, p.D);
        [19, 21, 23].forEach((y) => { g.hline(b.tl, b.tr, y, p.D); g.hline(b.al, b.al + 1, y, p.D); g.hline(b.ar, b.ar + 1, y, p.D); });
        g.vline(15, 17, 23, '#d0d3da');
      } },
    { id: 'top_leather', cat: 'top', name: 'Кожаная куртка', en: 'Leather jacket', style: 'street', rarity: 'rare', price: 1200,
      pal: { C: '#26262d', D: '#17171b', L: '#4a4a58' },
      draw(g, c, p) {
        const b = c.b;
        torso(g, b, p.C, p.D); sleeves(g, b, p.C, p.D, 6);
        g.hline(b.tl + 1, b.tl + 3, 17, p.L); g.hline(b.tr - 3, b.tr - 1, 17, p.L);
        g.pts([[15, 17], [16, 17]], '#eef1f6');
        g.pts([[14, 18], [14, 19], [15, 20], [15, 21], [16, 22], [16, 23]], '#c9ccd3');
        g.vline(b.tl + 1, 18, 22, p.L); g.vline(b.al, 19, 22, p.L);
      } },
    { id: 'top_armor', cat: 'top', name: 'Рыцарские доспехи', en: 'Knight armor', style: 'fantasy', rarity: 'rare', price: 1200,
      pal: { C: '#aeb6c2', D: '#7d8695', L: '#e2e7ee' },
      draw(g, c, p) {
        const b = c.b;
        torso(g, b, p.C, p.D); sleeves(g, b, p.C, p.D, 6);
        g.rect(b.al - 1, 17, 3, 2, p.C); g.rect(b.ar, 17, 3, 2, p.C);
        g.hline(b.al - 1, b.al + 1, 17, p.L); g.hline(b.ar, b.ar + 2, 17, p.L);
        g.vline(b.tl + 2, 18, 21, p.L); g.hline(b.tl, b.tr, 20, p.D); g.hline(b.tl, b.tr, 23, p.D);
        g.rect(15, 18, 2, 2, '#c0392b');
      } },
    { id: 'top_robe', cat: 'top', name: 'Мантия мага', en: 'Wizard robe', style: 'fantasy', rarity: 'legendary', price: 5000,
      pal: { C: '#4b2a8a', D: '#361d66', R: '#7df9ff' },
      draw(g, c, p) {
        const b = c.b, T = '#e8c547';
        torso(g, b, p.C, p.D); sleeves(g, b, p.C, p.D, 6);
        g.hline(b.al - 1, b.al + 1, 22, p.C); g.hline(b.al - 1, b.al + 1, 23, p.D);
        g.hline(b.ar, b.ar + 2, 22, p.C); g.hline(b.ar, b.ar + 2, 23, p.D);
        g.hline(b.tl, b.tr, 24, p.C); g.hline(10, 21, 25, p.C); g.hline(10, 21, 26, p.C); g.hline(9, 22, 27, p.C);
        g.vline(21, 25, 26, p.D); g.px(22, 27, p.D);
        g.rect(15, 17, 2, 11, T); g.hline(9, 22, 28, T);
        g.layer('fx-pulse', true).pts([[12, 19], [13, 21], [19, 20], [18, 22], [12, 25], [19, 26], [11, 27], [20, 27]], p.R);
      } },

    // ===================== ШТАНЫ =====================
    { id: 'pants_jeans', cat: 'pants', name: 'Базовые джинсы', en: 'Basic jeans', style: 'base', rarity: 'base', price: 0,
      pal: { C: '#3b5b92', D: '#2c4672' },
      draw(g, c, p) { pants(g, c.b, p.C, p.D, 28); g.hline(c.b.tl, c.b.tr, 24, p.D); } },
    { id: 'pants_shorts', cat: 'pants', name: 'Спортивные шорты', en: 'Sport shorts', style: 'sport', rarity: 'common', price: 120,
      pal: { C: '#2b2b33', D: '#1e1e24' },
      draw(g, c, p) { pants(g, c.b, p.C, p.D, 26); g.vline(11, 25, 26, '#ffffff'); g.vline(20, 25, 26, '#ffffff'); } },
    { id: 'pants_leggings', cat: 'pants', name: 'Леггинсы', en: 'Leggings', style: 'sport', rarity: 'common', price: 150,
      pal: { C: '#2a2a35', D: '#1d1d26' },
      draw(g, c, p) { pants(g, c.b, p.C, p.D, 28); g.vline(11, 25, 28, '#8b5cf6'); g.vline(17, 26, 28, '#8b5cf6'); } },
    { id: 'pants_capri', cat: 'pants', name: 'Бриджи', en: 'Capri pants', style: 'street', rarity: 'common', price: 180,
      pal: { C: '#d9c08b', D: '#bfa46f' },
      draw(g, c, p) { pants(g, c.b, p.C, p.D, 27); g.hline(11, 14, 27, p.D); g.hline(17, 20, 27, p.D); } },
    { id: 'pants_sweat', cat: 'pants', name: 'Спортивные штаны', en: 'Sweatpants', style: 'sport', rarity: 'common', price: 220,
      pal: { C: '#8a8f98', D: '#6e737c' },
      draw(g, c, p) {
        pants(g, c.b, p.C, p.D, 28);
        g.vline(11, 25, 27, '#ffffff'); g.vline(20, 25, 27, '#ffffff');
        g.hline(11, 14, 28, p.D); g.hline(17, 20, 28, p.D); g.pts([[15, 24], [16, 24]], '#ffffff');
      } },
    { id: 'pants_skirt', cat: 'pants', name: 'Юбка в клетку', en: 'Plaid skirt', style: 'classic', rarity: 'common', price: 250,
      pal: { C: '#b23a48', D: '#8e2c39', L: '#d65a68' },
      draw(g, c, p) {
        g.hline(c.b.tl, c.b.tr, 24, p.C); g.hline(10, 21, 25, p.C); g.hline(9, 22, 26, p.D);
        g.vline(13, 24, 25, p.D); g.vline(18, 24, 25, p.D);
        g.pts([[11, 25], [15, 25], [16, 25], [20, 25]], p.L);
      } },
    { id: 'pants_pencil', cat: 'pants', name: 'Юбка-карандаш', en: 'Pencil skirt', style: 'classic', rarity: 'common', price: 260,
      pal: { C: '#2c2e3a', D: '#1f2029' },
      draw(g, c, p) {
        g.hline(c.b.tl, c.b.tr, 24, p.C); g.rect(11, 25, 10, 3, p.C); g.vline(20, 25, 27, p.D); g.px(17, 27, c.skin);
      } },
    { id: 'pants_chinos', cat: 'pants', name: 'Чиносы', en: 'Chinos', style: 'classic', rarity: 'common', price: 280,
      pal: { C: '#c9a77c', D: '#a98a62' },
      draw(g, c, p) { pants(g, c.b, p.C, p.D, 28); g.hline(c.b.tl, c.b.tr, 24, '#5a3b22'); g.pts([[15, 24]], '#d4af37'); } },
    { id: 'pants_cargo', cat: 'pants', name: 'Карго', en: 'Cargo pants', style: 'street', rarity: 'common', price: 300,
      pal: { C: '#6b7a3a', D: '#55612d' },
      draw(g, c, p) { pants(g, c.b, p.C, p.D, 28); g.rect(11, 26, 2, 2, p.D); g.rect(19, 26, 2, 2, p.D); } },
    { id: 'pants_wide', cat: 'pants', name: 'Широкие брюки', en: 'Wide-leg pants', style: 'street', rarity: 'common', price: 330,
      pal: { C: '#6a5acd', D: '#5446a8' },
      draw(g, c, p) {
        g.hline(c.b.tl, c.b.tr, 24, p.C); g.hline(10, 21, 25, p.C);
        g.rect(10, 26, 5, 3, p.C); g.rect(17, 26, 5, 3, p.C); g.vline(14, 25, 28, p.D); g.vline(21, 25, 28, p.D);
      } },
    { id: 'pants_trousers', cat: 'pants', name: 'Классические брюки', en: 'Dress trousers', style: 'classic', rarity: 'common', price: 400,
      pal: { C: '#3a3d46', D: '#2c2e35', L: '#50545f' },
      draw(g, c, p) {
        pants(g, c.b, p.C, p.D, 28);
        g.hline(c.b.tl, c.b.tr, 24, '#1b1b1f'); g.pts([[15, 24], [16, 24]], '#d4af37');
        g.vline(12, 26, 28, p.L); g.vline(18, 26, 28, p.L);
      } },
    { id: 'pants_bell', cat: 'pants', name: 'Клёш', en: 'Flared pants', style: 'street', rarity: 'rare', price: 550,
      pal: { C: '#7d5ba6', D: '#634788' },
      draw(g, c, p) { pants(g, c.b, p.C, p.D, 28); g.hline(10, 14, 28, p.C); g.hline(17, 21, 28, p.C); g.px(21, 28, p.D); } },
    { id: 'pants_ripped', cat: 'pants', name: 'Рваные джинсы', en: 'Ripped jeans', style: 'street', rarity: 'rare', price: 600,
      pal: { C: '#6f8fc4', D: '#55729f' },
      draw(g, c, p) {
        pants(g, c.b, p.C, p.D, 28);
        g.pts([[12, 26], [13, 26], [18, 27], [19, 27]], c.skin); g.pts([[11, 26], [17, 27]], '#e8eef7');
      } },
    { id: 'pants_kilt', cat: 'pants', name: 'Килт', en: 'Kilt', style: 'classic', rarity: 'rare', price: 650,
      pal: { C: '#2e7d4f', D: '#1f5c39' },
      draw(g, c, p) {
        g.hline(c.b.tl, c.b.tr, 24, p.C); g.rect(10, 25, 12, 2, p.C);
        [12, 16, 19].forEach((x) => g.vline(x, 24, 26, p.D)); g.hline(10, 21, 25, p.D);
        g.pts([[12, 25], [16, 25], [19, 25]], '#c0392b');
      } },
    { id: 'pants_tutu', cat: 'pants', name: 'Пышная юбка', en: 'Tutu skirt', style: 'fantasy', rarity: 'rare', price: 700,
      pal: { C: '#f7a8c8', D: '#e083aa', L: '#fcd2e3' },
      draw(g, c, p) {
        g.hline(c.b.tl, c.b.tr, 24, p.C); g.hline(9, 22, 25, p.L); g.hline(8, 23, 26, p.C); g.hline(9, 22, 27, p.D);
        g.pts([[11, 26], [16, 25], [20, 26]], '#ffffff');
      } },
    { id: 'pants_leather', cat: 'pants', name: 'Кожаные штаны', en: 'Leather pants', style: 'street', rarity: 'rare', price: 800,
      pal: { C: '#1f1f24', D: '#141418', L: '#4a4a58' },
      draw(g, c, p) { pants(g, c.b, p.C, p.D, 28); g.vline(12, 25, 27, p.L); g.vline(18, 26, 27, p.L); } },
    { id: 'pants_ninja', cat: 'pants', name: 'Штаны ниндзя', en: 'Ninja pants', style: 'fantasy', rarity: 'rare', price: 900,
      pal: { C: '#1e1e26', D: '#121218', L: '#3b3b48' },
      draw(g, c, p) {
        pants(g, c.b, p.C, p.D, 28);
        g.hline(c.b.tl, c.b.tr, 24, '#c0392b'); g.pts([[12, 25], [12, 26]], '#c0392b');
        g.hline(11, 14, 27, p.L); g.hline(17, 20, 27, p.L);
      } },

    // ===================== ОБУВЬ =====================
    { id: 'shoes_keds', cat: 'shoes', name: 'Кеды', en: 'Canvas shoes', style: 'base', rarity: 'base', price: 0,
      pal: { C: '#f2f2f2', L: '#c8ccd3' },
      draw(g, c, p) { feet(g, p.C, 29); feet(g, '#a3a9b3', 30); g.pts([[12, 29], [19, 29]], p.L); } },
    { id: 'shoes_sandals', cat: 'shoes', name: 'Сандалии', en: 'Sandals', style: 'sport', rarity: 'common', price: 100,
      pal: { C: '#8a5a2b', D: '#6e4520' },
      draw(g, c, p) { g.pts([[11, 29], [13, 29], [18, 29], [20, 29]], p.C); feet(g, p.D, 30); } },
    { id: 'shoes_flipflops', cat: 'shoes', name: 'Шлёпанцы', en: 'Flip-flops', style: 'sport', rarity: 'common', price: 110,
      pal: { C: '#3ec1d3', D: '#2b97a6' },
      draw(g, c, p) { g.pts([[12, 29], [19, 29]], p.C); feet(g, p.D, 30); } },
    { id: 'shoes_slipons', cat: 'shoes', name: 'Слипоны', en: 'Slip-ons', style: 'street', rarity: 'common', price: 180,
      pal: { C: '#2a2a30' },
      draw(g, c, p) {
        for (let x = 10; x <= 21; x++) if (x < 15 || x > 16) g.px(x, 29, x % 2 ? p.C : '#f2f2f2');
        feet(g, '#f2f2f2', 30);
      } },
    { id: 'shoes_rain', cat: 'shoes', name: 'Резиновые сапоги', en: 'Rain boots', style: 'street', rarity: 'common', price: 240,
      pal: { C: '#f5c83a', D: '#cfa52a' },
      draw(g, c, p) { legs(g, p.C, 26, 28); g.vline(14, 26, 28, p.D); g.vline(20, 26, 28, p.D); feet(g, p.C, 29); feet(g, p.D, 30); } },
    { id: 'shoes_sneakers', cat: 'shoes', name: 'Кроссовки', en: 'Sneakers', style: 'sport', rarity: 'common', price: 250,
      pal: { C: '#e74c3c' },
      draw(g, c, p) { feet(g, p.C, 29); feet(g, '#ffffff', 30); g.pts([[13, 29], [20, 29]], '#ffffff'); } },
    { id: 'shoes_cleats', cat: 'shoes', name: 'Бутсы', en: 'Football boots', style: 'sport', rarity: 'common', price: 280,
      pal: { C: '#1f1f24' },
      draw(g, c, p) {
        feet(g, p.C, 29); g.pts([[12, 29], [19, 29]], '#3fa45b'); feet(g, p.C, 30);
        g.pts([[10, 30], [12, 30], [14, 30], [17, 30], [19, 30], [21, 30]], '#d0d3da');
      } },
    { id: 'shoes_loafers', cat: 'shoes', name: 'Лоферы', en: 'Loafers', style: 'classic', rarity: 'common', price: 300,
      pal: { C: '#7a4a2a', D: '#5c361d' },
      draw(g, c, p) { feet(g, p.C, 29); feet(g, p.D, 30); g.pts([[12, 29], [19, 29]], '#d4af37'); } },
    { id: 'shoes_classic', cat: 'shoes', name: 'Туфли', en: 'Dress shoes', style: 'classic', rarity: 'common', price: 350,
      pal: { C: '#1d1d22', D: '#111114', L: '#5a5a66' },
      draw(g, c, p) { feet(g, p.C, 29); feet(g, p.D, 30); g.pts([[11, 29], [18, 29]], p.L); } },
    { id: 'shoes_boots', cat: 'shoes', name: 'Ботинки', en: 'Boots', style: 'street', rarity: 'rare', price: 550,
      pal: { C: '#6b4226', D: '#4f2f1a' },
      draw(g, c, p) {
        legs(g, p.C, 27, 28); feet(g, p.C, 29); feet(g, '#2b1d12', 30);
        g.pts([[12, 27], [12, 28], [18, 27], [18, 28]], '#d9b38c');
        g.pts([[14, 27], [14, 28], [20, 27], [20, 28], [14, 29], [21, 29]], p.D);
      } },
    { id: 'shoes_platform', cat: 'shoes', name: 'Кеды на платформе', en: 'Platform sneakers', style: 'street', rarity: 'rare', price: 600,
      pal: { C: '#ec6fae', D: '#c85390' },
      draw(g, c, p) { feet(g, '#f4f4f4', 29); feet(g, p.C, 30); feet(g, p.D, 31); } },
    { id: 'shoes_heels', cat: 'shoes', name: 'Туфли на каблуке', en: 'High heels', style: 'classic', rarity: 'rare', price: 700,
      pal: { C: '#d23a4b', D: '#a52a39' },
      draw(g, c, p) {
        g.hline(10, 13, 29, p.C); g.hline(17, 20, 29, p.C);
        g.pts([[10, 30], [11, 30], [14, 30], [17, 30], [18, 30], [21, 30]], p.D);
      } },
    { id: 'shoes_hightops', cat: 'shoes', name: 'Высокие кеды', en: 'High-tops', style: 'street', rarity: 'rare', price: 750,
      pal: { C: '#e74c3c' },
      draw(g, c, p) {
        const W = '#f4f4f4';
        legs(g, W, 27, 27); legs(g, p.C, 28, 28); feet(g, W, 29); feet(g, '#222228', 30); g.pts([[12, 29], [19, 29]], p.C);
      } },
    { id: 'shoes_cowboy', cat: 'shoes', name: 'Ковбойские сапоги', en: 'Cowboy boots', style: 'classic', rarity: 'rare', price: 850,
      pal: { C: '#9a6033', D: '#744622', L: '#c58a55' },
      draw(g, c, p) {
        legs(g, p.C, 26, 28); g.pts([[12, 27], [18, 27], [13, 28], [19, 28]], p.L);
        feet(g, p.C, 29); feet(g, p.D, 30); g.pts([[14, 30], [21, 30]], '#3a2416');
      } },
    { id: 'shoes_armor', cat: 'shoes', name: 'Латные сапоги', en: 'Armored boots', style: 'fantasy', rarity: 'rare', price: 1100,
      pal: { C: '#aeb6c2', D: '#7d8695', L: '#e2e7ee' },
      draw(g, c, p) {
        legs(g, p.C, 26, 28); g.vline(11, 26, 28, p.L); g.vline(17, 26, 28, p.L);
        g.hline(11, 14, 27, p.D); g.hline(17, 20, 27, p.D); feet(g, p.C, 29); feet(g, p.D, 30);
      } },
    { id: 'shoes_winged', cat: 'shoes', name: 'Крылатые сандалии', en: 'Winged sandals', style: 'fantasy', rarity: 'legendary', price: 2500,
      pal: { G: '#e8c547', D: '#b8962f' },
      draw(g, c, p) {
        g.pts([[11, 29], [13, 29], [18, 29], [20, 29], [12, 28], [19, 28]], p.G);
        feet(g, p.D, 30);
        const W = '#dbe8ff', B = '#7fa3e6';
        const up = g.layer('fx-a', true);
        up.mirror([[8, 28], [9, 28], [7, 27], [8, 27], [9, 29]], W); up.mirror([[7, 26]], B);
        const down = g.layer('fx-b', true);
        down.mirror([[8, 29], [9, 29], [7, 30], [8, 30], [9, 28]], W); down.mirror([[7, 31]], B);
      } },

    // ===================== АКСЕССУАРЫ =====================
    { id: 'acc_cap', cat: 'acc', name: 'Кепка', en: 'Cap', style: 'sport', rarity: 'common', price: 100,
      pal: { C: '#e74c3c', D: '#b8392c' },
      draw(g, c, p) {
        g.hline(12, 19, 2, p.C); g.hline(11, 20, 3, p.C); g.hline(10, 21, 4, p.C); g.hline(10, 21, 5, p.C);
        g.hline(9, 22, 6, p.D); g.pts([[15, 2], [16, 2], [14, 4], [15, 4]], '#ffffff');
      } },
    { id: 'acc_bandana', cat: 'acc', name: 'Бандана', en: 'Bandana', style: 'street', rarity: 'common', price: 120,
      pal: { C: '#c0392b', D: '#962d22' },
      draw(g, c, p) {
        g.hline(12, 19, 3, p.C); g.hline(11, 20, 4, p.C); g.hline(10, 21, 5, p.C);
        g.pts([[22, 5], [23, 6], [23, 4]], p.D); g.pts([[13, 4], [16, 4], [19, 4], [14, 5]], '#ffffff');
      } },
    { id: 'acc_headband', cat: 'acc', name: 'Спортивная повязка', en: 'Sweatband', style: 'sport', rarity: 'common', price: 130,
      pal: { C: '#e74c3c', D: '#b8392c' },
      draw(g, c, p) { g.hline(10, 21, 6, p.C); g.px(21, 6, p.D); g.hline(13, 18, 6, '#ffffff'); g.hline(14, 17, 6, p.C); } },
    { id: 'acc_glasses', cat: 'acc', name: 'Очки', en: 'Glasses', style: 'classic', rarity: 'common', price: 150,
      pal: { F: '#3a2f46' },
      draw(g, c, p) {
        [11, 17].forEach((x0) => {
          g.hline(x0, x0 + 3, 9, p.F); g.hline(x0, x0 + 3, 12, p.F); g.vline(x0, 10, 11, p.F); g.vline(x0 + 3, 10, 11, p.F);
        });
        g.pts([[15, 10], [16, 10]], p.F);
      } },
    { id: 'acc_bowtie', cat: 'acc', name: 'Галстук-бабочка', en: 'Bow tie', style: 'classic', rarity: 'common', price: 160,
      pal: { C: '#c0392b', D: '#962d22' },
      draw(g, c, p) { g.hline(13, 14, 17, p.C); g.hline(17, 18, 17, p.C); g.hline(15, 16, 17, p.D); g.pts([[13, 18], [18, 18]], p.C); } },
    { id: 'acc_beanie', cat: 'acc', name: 'Шапка-бини', en: 'Beanie', style: 'street', rarity: 'common', price: 180,
      pal: { C: '#3b82f6', D: '#2c64c4' },
      draw(g, c, p) {
        g.hline(12, 19, 2, p.C); g.hline(11, 20, 3, p.C); g.hline(10, 21, 4, p.C); g.hline(10, 21, 5, p.C);
        g.hline(10, 21, 6, p.D); for (let x = 11; x <= 21; x += 2) g.px(x, 6, p.C);
        g.hline(15, 16, 1, '#ffffff');
      } },
    { id: 'acc_scarf', cat: 'acc', name: 'Шарф', en: 'Scarf', style: 'classic', rarity: 'common', price: 200,
      pal: { C: '#d64545', D: '#a83232', L: '#ee7070' },
      draw(g, c, p) {
        g.hline(11, 20, 16, p.C); g.hline(11, 20, 17, p.D); g.rect(18, 18, 2, 4, p.C); g.vline(19, 18, 21, p.D);
        g.pts([[12, 16], [14, 16], [16, 16], [18, 16], [18, 19], [18, 21]], p.L);
      } },
    { id: 'acc_chain', cat: 'acc', name: 'Цепочка', en: 'Gold chain', style: 'street', rarity: 'common', price: 250,
      pal: { G: '#e8c547', D: '#b8962f' },
      draw(g, c, p) {
        [[12, 17], [13, 18], [14, 19], [15, 20], [16, 20], [17, 19], [18, 18], [19, 17]].forEach(([x, y], i) => g.px(x, y, i % 2 ? p.D : p.G));
        g.pts([[15, 21], [16, 21]], p.G);
      } },
    { id: 'acc_headphones', cat: 'acc', name: 'Наушники', en: 'Headphones', style: 'street', rarity: 'common', price: 350,
      pal: { C: '#21b8b0', D: '#178a84' },
      draw(g, c, p) {
        const B = '#2b2b33';
        g.hline(12, 19, 2, B); g.pts([[10, 3], [11, 3], [20, 3], [21, 3]], B); g.vline(9, 4, 8, B); g.vline(22, 4, 8, B);
        g.rect(8, 9, 3, 4, p.C); g.rect(21, 9, 3, 4, p.C); g.vline(10, 9, 12, p.D); g.vline(23, 9, 12, p.D);
      } },
    { id: 'acc_sunglasses', cat: 'acc', name: 'Солнечные очки', en: 'Sunglasses', style: 'street', rarity: 'rare', price: 500,
      pal: { K: '#15151c' },
      draw(g, c, p) {
        g.rect(11, 10, 4, 2, p.K); g.rect(17, 10, 4, 2, p.K); g.pts([[15, 10], [16, 10], [10, 10], [21, 10]], p.K);
        g.pts([[12, 10], [18, 10]], '#9aa4b8');
      } },
    { id: 'acc_fedora', cat: 'acc', name: 'Шляпа', en: 'Fedora', style: 'classic', rarity: 'rare', price: 600,
      pal: { C: '#5a4636', D: '#43342a' },
      draw(g, c, p) {
        g.hline(13, 18, 1, p.C); g.hline(12, 19, 2, p.C); g.hline(11, 20, 3, p.C);
        g.hline(11, 20, 4, '#1f1f24'); g.hline(8, 23, 5, p.D); g.px(15, 1, p.D);
      } },
    { id: 'acc_ninjamask', cat: 'acc', name: 'Маска ниндзя', en: 'Ninja mask', style: 'fantasy', rarity: 'rare', price: 700,
      pal: { C: '#2a2a35', D: '#1d1d26' },
      draw(g, c, p) {
        g.hline(10, 21, 12, p.C); g.hline(10, 21, 13, p.C); g.hline(11, 20, 14, p.C); g.hline(12, 19, 15, p.C);
        g.vline(21, 12, 13, p.D); g.pts([[22, 12], [23, 13], [23, 11]], p.D);
      } },
    { id: 'acc_wizard', cat: 'acc', name: 'Шляпа волшебника', en: 'Wizard hat', style: 'fantasy', rarity: 'rare', price: 1100,
      pal: { C: '#3a4fb0', D: '#2c3c8a' },
      draw(g, c, p) {
        g.hline(16, 17, 0, p.C); g.hline(15, 17, 1, p.C); g.hline(14, 17, 2, p.C); g.hline(13, 18, 3, p.C);
        g.hline(12, 19, 4, p.C); g.hline(11, 20, 5, p.C); g.hline(8, 23, 6, p.D);
        g.pts([[14, 4], [17, 2], [18, 5]], '#f5c83a');
      } },
    { id: 'acc_crown', cat: 'acc', name: 'Корона', en: 'Crown', style: 'fantasy', rarity: 'rare', price: 1200,
      pal: { G: '#f2c230', D: '#c99a1a' },
      draw(g, c, p) {
        g.hline(11, 20, 2, p.G); g.hline(11, 20, 3, p.D);
        g.pts([[11, 1], [13, 1], [15, 1], [16, 1], [18, 1], [20, 1], [15, 0], [16, 0]], p.G);
        g.pts([[13, 2], [18, 2]], '#e0314b'); g.pts([[15, 2], [16, 2]], '#3a7bd5');
      } },
    { id: 'acc_halo', cat: 'acc', name: 'Нимб', en: 'Halo', style: 'fantasy', rarity: 'legendary', price: 4000,
      pal: { A: '#fff3a0', B: '#ffe066', C: '#fff8cc' },
      draw(g, c, p) {
        const h = g.layer('fx-pulse', true);
        h.hline(12, 19, 0, p.A); h.pts([[11, 1], [12, 1], [19, 1], [20, 1]], p.B); h.hline(13, 18, 1, p.C);
      } },
    { id: 'acc_wings', cat: 'acc', name: 'Ангельские крылья', en: 'Angel wings', style: 'fantasy', rarity: 'legendary', price: 4500,
      pal: { W: '#f4f8ff', B: '#bcd0f5', E: '#7f9fdc' },
      draw(g, c, p) {
        // крылья машут: два кадра, по бокам от фигуры
        const shape = (dy) => {
          const rows = [[5, 6], [4, 6], [3, 6], [2, 6], [2, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6]];
          const cells = { W: [], B: [], E: [] };
          rows.forEach(([x1, x2], i) => {
            for (let x = x1; x <= x2; x++) {
              const k = x === x1 ? 'E' : x === x2 ? 'B' : 'W';
              cells[k].push([x, 12 + i + dy]);
            }
          });
          return cells;
        };
        [['fx-a', 0], ['fx-b', 2]].forEach(([cls, dy]) => {
          const l = g.layer(cls, true);
          const s = shape(dy);
          l.mirror(s.W, p.W); l.mirror(s.B, p.B); l.mirror(s.E, p.E);
        });
      } },
  ];

  const byId = {};
  ITEMS.forEach((it) => { byId[it.id] = it; });

  const CATS = [
    { id: 'hair', name: 'Причёски' },
    { id: 'top', name: 'Верх' },
    { id: 'pants', name: 'Штаны' },
    { id: 'shoes', name: 'Обувь' },
    { id: 'acc', name: 'Аксессуары' },
  ];
  const LAYER_ORDER = ['shoes', 'pants', 'top', 'hair', 'acc'];
  const BASE = { hair: 'hair_short', top: 'top_tee', pants: 'pants_jeans', shoes: 'shoes_keds', acc: null };

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
    const hc = HAIR[look.hc] || HAIR[1];
    const skin = SKINS[look.skin] || SKINS[1];
    const c = {
      b: geo(look.g),
      skin,
      skinS: tone(skin, -0.14),
      eye: EYES[look.eyes] || EYES[0],
      hc,
      hs: tone(hc, -0.25),
      hl: tone(hc, 0.3),
      brow: tone(hc, -0.2),
    };
    const g = new Grid();
    drawBody(g, c);
    LAYER_ORDER.forEach((cat) => {
      const it = byId[look.eq && look.eq[cat]];
      if (!it || it.cat !== cat) return;
      const ci = look.col ? look.col[cat] : null;
      const p = it.pal ? (Number.isInteger(ci) ? recolor(it.pal, ci) : it.pal) : {};
      it.draw(g, c, p);
    });
    outline(g);
    return g;
  }

  function rects(grid) {
    let out = '';
    for (let y = 0; y < N; y++) {
      let x = 0;
      while (x < N) {
        const col = grid.c[y * N + x];
        if (!col) { x++; continue; }
        let w = 1;
        while (x + w < N && grid.c[y * N + x + w] === col) w++;
        out += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="1" fill="' + col + '"/>';
        x += w;
      }
    }
    return out;
  }

  let svgId = 0;

  function svg(look, size) {
    const g = compose(look);
    const id = 'pfglow' + (++svgId);
    let fx = '';
    let needGlow = false;
    g.fx.forEach((l) => {
      if (l.glow) needGlow = true;
      fx += '<g class="fx ' + l.cls + '"' + (l.glow ? ' filter="url(#' + id + ')"' : '') + '>' + rects(l.grid) + '</g>';
    });
    const defs = needGlow
      ? '<defs><filter id="' + id + '" x="-50%" y="-50%" width="200%" height="200%">' +
        '<feGaussianBlur stdDeviation="0.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/>' +
        '<feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'
      : '';
    return '<svg class="pix" width="' + size + '" height="' + size + '" viewBox="0 0 32 32" shape-rendering="crispEdges" ' +
      'aria-hidden="true">' + defs + rects(g) + fx + '</svg>';
  }

  PF.char = {
    SKINS, EYES, HAIR, EYE_NAMES, HAIR_NAMES, PALETTE,
    ITEMS, byId, CATS, BASE, RARITY, STYLES,
    itemName, colorName, colorPrice,
    svg,
    compose,
    recolor,
  };
})(window.PF);
