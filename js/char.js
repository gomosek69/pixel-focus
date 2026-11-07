// Пиксельный персонаж 32×32: тело, вещи и сборка картинки.
//
// Всё рисуется кодом: каждая вещь — функция, которая закрашивает клетки сетки 32×32.
// Порядок слоёв: тело → обувь → штаны → верх → причёска → аксессуар.
// Затем вокруг фигуры автоматически рисуется тёмный контур.
// Особые эффекты легендарных вещей (свечение, анимация) рисуются отдельными
// слоями поверх и не получают контура.
// Картинка выводится как SVG из квадратиков, поэтому при увеличении не размывается.
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
  // Затемнить (f < 0) или осветлить (f > 0) цвет.
  function tone(hex, f) {
    const [r, g, b] = hexToRgb(hex);
    if (f < 0) return rgbToHex(r * (1 + f), g * (1 + f), b * (1 + f));
    return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
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
      this.fx = []; // слои эффектов: { cls, glow, grid }
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
    layer(cls, glow) {
      const g = new Grid();
      this.fx.push({ cls, glow: !!glow, grid: g });
      return g;
    }
  }

  // Контур: пустая клетка рядом с закрашенной становится тёмной.
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

  // Размеры тела: у женской фигуры плечи на клетку уже.
  function geo(gender) {
    return gender === 'f'
      ? { fem: true, tl: 11, tr: 20, al: 9, ar: 21 }
      : { fem: false, tl: 10, tr: 21, al: 8, ar: 22 };
  }

  function drawBody(g, c) {
    const b = c.b;
    const S = c.skin;
    const D = c.skinS;
    // голова
    g.hline(12, 19, 4, S);
    g.hline(11, 20, 5, S);
    for (let y = 6; y <= 13; y++) g.hline(10, 21, y, S);
    g.hline(11, 20, 14, S);
    g.hline(12, 19, 15, S);
    for (let y = 6; y <= 13; y++) g.px(21, y, D);
    g.px(20, 14, D);
    g.px(19, 15, D);
    // уши и шея
    g.vline(9, 9, 11, S);
    g.vline(22, 9, 11, D);
    g.hline(14, 17, 16, D);
    // туловище (17–24), руки (18–23) и кисти (24)
    g.hline(b.tl + 1, b.tr - 1, 17, S);
    g.rect(b.tl, 18, b.tr - b.tl + 1, 7, S);
    g.rect(b.al, 18, 2, 7, S);
    g.rect(b.ar, 18, 2, 7, S);
    g.vline(b.ar + 1, 18, 24, D);
    // ноги и ступни
    g.hline(11, 20, 25, S);
    g.rect(11, 26, 4, 3, S);
    g.rect(17, 26, 4, 3, S);
    g.vline(14, 26, 28, D);
    g.vline(20, 26, 28, D);
    g.rect(10, 29, 5, 2, S);
    g.rect(17, 29, 5, 2, S);
    // лицо
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
  function pants(g, b, C, D, bottom) {
    g.hline(b.tl, b.tr, 24, C);
    g.hline(11, 20, 25, C);
    g.rect(11, 26, 4, bottom - 25, C);
    g.rect(17, 26, 4, bottom - 25, C);
    g.vline(14, 25, bottom, D);
    g.vline(20, 25, bottom, D);
  }
  function feet(g, C, rowY) {
    g.hline(10, 14, rowY, C);
    g.hline(17, 21, rowY, C);
  }
  // Верх головы, общий для многих причёсок (строки 3–6).
  function hairTop(g, c) {
    g.hline(12, 19, 3, c.hc);
    g.hline(11, 20, 4, c.hc);
    g.hline(10, 21, 5, c.hc);
    g.hline(10, 21, 6, c.hc);
    g.hline(13, 15, 4, c.hl);
    g.hline(19, 21, 6, c.hs);
  }

  // ---------- каталог вещей ----------
  // rarity: base (бесплатная), common, rare, legendary
  // style: base, sport, classic, street, fantasy

  const ITEMS = [
    // ===== причёски =====
    {
      id: 'hair_short', cat: 'hair', name: 'Короткая', style: 'base', rarity: 'base', price: 0,
      draw(g, c) {
        hairTop(g, c);
        [10, 11, 12, 15, 16, 19, 20, 21].forEach((x) => g.px(x, 7, c.hc));
        g.vline(10, 8, 9, c.hc);
        g.vline(21, 7, 9, c.hs);
      },
    },
    {
      id: 'hair_long', cat: 'hair', name: 'Длинная', style: 'base', rarity: 'base', price: 0,
      draw(g, c) {
        hairTop(g, c);
        g.hline(10, 14, 7, c.hc);
        g.hline(17, 21, 7, c.hc);
        g.rect(9, 6, 2, 14, c.hc);
        g.rect(21, 6, 2, 14, c.hc);
        g.vline(22, 6, 19, c.hs);
        g.px(9, 20, c.hc);
        g.px(22, 20, c.hs);
      },
    },
    {
      id: 'hair_spiky', cat: 'hair', name: 'Ёжик', style: 'street', rarity: 'common', price: 150,
      draw(g, c) {
        hairTop(g, c);
        g.pts([[11, 2], [12, 2], [14, 2], [15, 2], [17, 2], [18, 2], [20, 2], [12, 1], [15, 1], [18, 1]], c.hc);
        g.pts([[15, 1], [12, 2]], c.hl);
        g.pts([[10, 7], [11, 7], [20, 7], [21, 7]], c.hc);
      },
    },
    {
      id: 'hair_curly', cat: 'hair', name: 'Кудри', style: 'classic', rarity: 'common', price: 200,
      draw(g, c) {
        const cells = [];
        const add = (x1, x2, y) => { for (let x = x1; x <= x2; x++) cells.push([x, y]); };
        add(11, 13, 2); add(16, 18, 2);
        add(10, 21, 3);
        for (let y = 4; y <= 7; y++) add(9, 22, y);
        add(9, 11, 8); add(20, 22, 8);
        add(9, 10, 9); add(21, 22, 9);
        add(9, 10, 10); add(21, 22, 10);
        cells.forEach(([x, y]) => g.px(x, y, (x * 7 + y * 3) % 5 === 0 ? c.hs : c.hc));
        g.hline(12, 14, 3, c.hl);
      },
    },
    {
      id: 'hair_ponytail', cat: 'hair', name: 'Хвостик', style: 'sport', rarity: 'common', price: 250,
      draw(g, c) {
        hairTop(g, c);
        g.hline(10, 16, 7, c.hc);
        g.vline(10, 8, 9, c.hc);
        g.vline(21, 7, 8, c.hs);
        g.px(22, 6, '#e74c3c');
        g.rect(22, 7, 2, 6, c.hc);
        g.vline(23, 7, 12, c.hs);
        g.vline(23, 13, 14, c.hs);
      },
    },
    {
      id: 'hair_bob', cat: 'hair', name: 'Каре', style: 'classic', rarity: 'rare', price: 600,
      draw(g, c) {
        hairTop(g, c);
        g.hline(10, 21, 7, c.hc);
        g.hline(12, 19, 7, c.hc);
        g.rect(9, 7, 2, 8, c.hc);
        g.rect(21, 7, 2, 8, c.hc);
        g.vline(22, 7, 14, c.hs);
        g.hline(9, 11, 15, c.hs);
        g.hline(20, 22, 15, c.hs);
      },
    },
    {
      id: 'hair_braids', cat: 'hair', name: 'Косички', style: 'street', rarity: 'rare', price: 800,
      draw(g, c) {
        hairTop(g, c);
        [10, 11, 12, 15, 16, 19, 20, 21].forEach((x) => g.px(x, 7, c.hc));
        for (let y = 7; y <= 20; y++) {
          const col = y % 2 ? c.hc : c.hs;
          g.hline(9, 10, y, col);
          g.hline(21, 22, y, col);
        }
        g.hline(9, 10, 21, '#e74c3c');
        g.hline(21, 22, 21, '#e74c3c');
      },
    },
    {
      id: 'hair_fire', cat: 'hair', name: 'Огненные волосы', style: 'fantasy', rarity: 'legendary', price: 3500,
      draw(g, c) {
        const F = '#ff5a1f', D = '#d63a12', L = '#ffb43a', T = '#ffe066';
        g.hline(12, 19, 3, F);
        g.hline(11, 20, 4, L);
        g.hline(10, 21, 5, F);
        g.hline(10, 21, 6, F);
        g.hline(19, 21, 6, D);
        g.pts([[10, 7], [11, 7], [20, 7], [21, 7], [10, 8], [21, 8]], D);
        g.pts([[11, 2], [12, 2], [14, 2], [15, 2], [17, 2], [18, 2], [20, 2]], F);
        // языки пламени: два кадра сменяют друг друга
        const a = g.layer('fx-a', true);
        a.pts([[12, 1], [15, 1], [18, 1], [20, 1]], L);
        a.pts([[12, 0], [15, 0], [18, 0]], T);
        const b2 = g.layer('fx-b', true);
        b2.pts([[11, 1], [14, 1], [17, 1], [19, 1]], L);
        b2.pts([[14, 0], [17, 0], [11, 0]], T);
        const glow = g.layer('fx-pulse', true);
        glow.pts([[13, 3], [16, 3], [18, 4]], T);
      },
    },

    // ===== верх =====
    {
      id: 'top_tee', cat: 'top', name: 'Базовая футболка', style: 'base', rarity: 'base', price: 0,
      draw(g, c) {
        const C = '#eef1f6', D = '#cfd5df';
        torso(g, c.b, C, D);
        sleeves(g, c.b, C, D, 2);
        g.hline(14, 17, 17, D);
      },
    },
    {
      id: 'top_tank', cat: 'top', name: 'Спортивная майка', style: 'sport', rarity: 'common', price: 150,
      draw(g, c) {
        const b = c.b, C = '#e74c3c', D = '#b8392c', W = '#ffffff';
        g.hline(b.tl + 1, b.tl + 2, 17, C);
        g.hline(b.tr - 2, b.tr - 1, 17, C);
        g.hline(b.tl + 1, b.tr - 1, 18, C);
        g.rect(b.tl, 19, b.tr - b.tl + 1, 5, C);
        g.vline(b.tr, 19, 23, D);
        g.pts([[15, 19], [16, 19], [16, 20], [16, 21], [15, 22]], W);
      },
    },
    {
      id: 'top_print', cat: 'top', name: 'Футболка с принтом', style: 'street', rarity: 'common', price: 200,
      draw(g, c) {
        const C = '#2d2f3a', D = '#22232c';
        torso(g, c.b, C, D);
        sleeves(g, c.b, C, D, 2);
        g.hline(14, 17, 17, D);
        g.hline(13, 18, 19, '#ff5d73');
        g.hline(13, 18, 20, '#ffd23f');
        g.hline(13, 18, 21, '#3ec1d3');
      },
    },
    {
      id: 'top_shirt', cat: 'top', name: 'Рубашка', style: 'classic', rarity: 'common', price: 350,
      draw(g, c) {
        const b = c.b, C = '#a9cdf0', D = '#86afd8', W = '#ffffff';
        torso(g, b, C, D);
        sleeves(g, b, C, D, 6);
        g.pts([[13, 17], [14, 17], [17, 17], [18, 17], [14, 18], [17, 18]], W);
        g.vline(16, 18, 23, D);
        g.pts([[15, 19], [15, 21], [15, 23]], '#5d7fa6');
        g.hline(b.al, b.al + 1, 23, W);
        g.hline(b.ar, b.ar + 1, 23, W);
      },
    },
    {
      id: 'top_hoodie', cat: 'top', name: 'Худи', style: 'street', rarity: 'rare', price: 700,
      draw(g, c) {
        const b = c.b, C = '#3aa66a', D = '#2b8452', W = '#ffffff';
        torso(g, b, C, D);
        sleeves(g, b, C, D, 6);
        g.hline(11, 13, 16, D);
        g.hline(18, 20, 16, D);
        g.pts([[14, 18], [14, 19], [17, 18], [17, 19]], W);
        g.rect(13, 21, 6, 2, D);
        g.hline(b.al, b.al + 1, 23, D);
        g.hline(b.ar, b.ar + 1, 23, D);
      },
    },
    {
      id: 'top_blazer', cat: 'top', name: 'Пиджак', style: 'classic', rarity: 'rare', price: 1000,
      draw(g, c) {
        const b = c.b, C = '#2c3e66', D = '#1f2d4d', W = '#ffffff', R = '#c0392b';
        torso(g, b, C, D);
        sleeves(g, b, C, D, 6);
        g.hline(14, 17, 17, W);
        g.pts([[14, 18], [17, 18]], W);
        g.rect(15, 18, 2, 4, R);
        g.pts([[13, 18], [18, 18], [14, 19], [17, 19]], D);
        g.px(15, 22, '#d4af37');
        g.px(19, 19, W);
      },
    },
    {
      id: 'top_leather', cat: 'top', name: 'Кожаная куртка', style: 'street', rarity: 'rare', price: 1200,
      draw(g, c) {
        const b = c.b, C = '#26262d', D = '#17171b', L = '#4a4a58', Z = '#c9ccd3';
        torso(g, b, C, D);
        sleeves(g, b, C, D, 6);
        g.hline(b.tl + 1, b.tl + 3, 17, L);
        g.hline(b.tr - 3, b.tr - 1, 17, L);
        g.pts([[15, 17], [16, 17]], '#eef1f6');
        g.pts([[14, 18], [14, 19], [15, 20], [15, 21], [16, 22], [16, 23]], Z);
        g.vline(b.tl + 1, 18, 22, L);
        g.vline(b.al, 19, 22, L);
      },
    },
    {
      id: 'top_robe', cat: 'top', name: 'Мантия мага', style: 'fantasy', rarity: 'legendary', price: 5000,
      draw(g, c) {
        const b = c.b, C = '#4b2a8a', D = '#361d66', T = '#e8c547';
        torso(g, b, C, D);
        sleeves(g, b, C, D, 6);
        g.hline(b.al - 1, b.al + 1, 22, C);
        g.hline(b.al - 1, b.al + 1, 23, D);
        g.hline(b.ar, b.ar + 2, 22, C);
        g.hline(b.ar, b.ar + 2, 23, D);
        g.hline(b.tl, b.tr, 24, C);
        g.hline(10, 21, 25, C);
        g.hline(10, 21, 26, C);
        g.hline(9, 22, 27, C);
        g.hline(9, 22, 28, D);
        g.vline(21, 25, 26, D);
        g.vline(22, 27, 27, D);
        g.rect(15, 17, 2, 11, T);
        g.hline(9, 22, 28, T);
        // светящиеся руны
        const r = g.layer('fx-pulse', true);
        r.pts([[12, 19], [13, 21], [19, 20], [18, 22], [12, 25], [19, 26], [11, 27], [20, 27]], '#7df9ff');
      },
    },

    // ===== штаны =====
    {
      id: 'pants_jeans', cat: 'pants', name: 'Базовые джинсы', style: 'base', rarity: 'base', price: 0,
      draw(g, c) {
        pants(g, c.b, '#3b5b92', '#2c4672', 28);
        g.hline(c.b.tl, c.b.tr, 24, '#2c4672');
      },
    },
    {
      id: 'pants_shorts', cat: 'pants', name: 'Спортивные шорты', style: 'sport', rarity: 'common', price: 120,
      draw(g, c) {
        pants(g, c.b, '#2b2b33', '#1e1e24', 26);
        g.vline(11, 25, 26, '#ffffff');
        g.vline(20, 25, 26, '#ffffff');
      },
    },
    {
      id: 'pants_sweat', cat: 'pants', name: 'Спортивные штаны', style: 'sport', rarity: 'common', price: 220,
      draw(g, c) {
        pants(g, c.b, '#8a8f98', '#6e737c', 28);
        g.vline(11, 25, 27, '#ffffff');
        g.vline(20, 25, 27, '#ffffff');
        g.hline(11, 14, 28, '#6e737c');
        g.hline(17, 20, 28, '#6e737c');
        g.pts([[15, 24], [16, 24]], '#ffffff');
      },
    },
    {
      id: 'pants_skirt', cat: 'pants', name: 'Юбка в клетку', style: 'classic', rarity: 'common', price: 250,
      draw(g, c) {
        const C = '#b23a48', D = '#8e2c39', L = '#d65a68';
        g.hline(c.b.tl, c.b.tr, 24, C);
        g.hline(10, 21, 25, C);
        g.hline(9, 22, 26, C);
        g.vline(13, 24, 26, D);
        g.vline(18, 24, 26, D);
        g.hline(10, 21, 25, C);
        g.pts([[11, 25], [15, 25], [16, 25], [20, 25]], L);
        g.hline(9, 22, 26, D);
      },
    },
    {
      id: 'pants_cargo', cat: 'pants', name: 'Карго', style: 'street', rarity: 'common', price: 300,
      draw(g, c) {
        pants(g, c.b, '#6b7a3a', '#55612d', 28);
        g.rect(11, 26, 2, 2, '#55612d');
        g.rect(19, 26, 2, 2, '#55612d');
      },
    },
    {
      id: 'pants_trousers', cat: 'pants', name: 'Классические брюки', style: 'classic', rarity: 'common', price: 400,
      draw(g, c) {
        pants(g, c.b, '#3a3d46', '#2c2e35', 28);
        g.hline(c.b.tl, c.b.tr, 24, '#1b1b1f');
        g.pts([[15, 24], [16, 24]], '#d4af37');
        g.vline(12, 26, 28, '#50545f');
        g.vline(18, 26, 28, '#50545f');
      },
    },
    {
      id: 'pants_ripped', cat: 'pants', name: 'Рваные джинсы', style: 'street', rarity: 'rare', price: 600,
      draw(g, c) {
        pants(g, c.b, '#6f8fc4', '#55729f', 28);
        g.pts([[12, 26], [13, 26], [18, 27], [19, 27]], c.skin);
        g.pts([[11, 26], [17, 27]], '#e8eef7');
      },
    },
    {
      id: 'pants_ninja', cat: 'pants', name: 'Штаны ниндзя', style: 'fantasy', rarity: 'rare', price: 900,
      draw(g, c) {
        pants(g, c.b, '#1e1e26', '#121218', 28);
        g.hline(c.b.tl, c.b.tr, 24, '#c0392b');
        g.pts([[12, 25], [12, 26]], '#c0392b');
        g.hline(11, 14, 27, '#3b3b48');
        g.hline(17, 20, 27, '#3b3b48');
      },
    },

    // ===== обувь =====
    {
      id: 'shoes_keds', cat: 'shoes', name: 'Кеды', style: 'base', rarity: 'base', price: 0,
      draw(g) {
        feet(g, '#f2f2f2', 29);
        feet(g, '#a3a9b3', 30);
        g.pts([[12, 29], [19, 29]], '#c8ccd3');
      },
    },
    {
      id: 'shoes_sandals', cat: 'shoes', name: 'Сандалии', style: 'sport', rarity: 'common', price: 100,
      draw(g) {
        g.pts([[11, 29], [13, 29], [18, 29], [20, 29]], '#8a5a2b');
        feet(g, '#6e4520', 30);
      },
    },
    {
      id: 'shoes_sneakers', cat: 'shoes', name: 'Кроссовки', style: 'sport', rarity: 'common', price: 250,
      draw(g) {
        feet(g, '#e74c3c', 29);
        feet(g, '#ffffff', 30);
        g.pts([[13, 29], [20, 29]], '#ffffff');
      },
    },
    {
      id: 'shoes_classic', cat: 'shoes', name: 'Туфли', style: 'classic', rarity: 'common', price: 350,
      draw(g) {
        feet(g, '#1d1d22', 29);
        feet(g, '#111114', 30);
        g.pts([[11, 29], [18, 29]], '#5a5a66');
      },
    },
    {
      id: 'shoes_boots', cat: 'shoes', name: 'Ботинки', style: 'street', rarity: 'rare', price: 550,
      draw(g) {
        const C = '#6b4226';
        g.rect(11, 27, 4, 2, C);
        g.rect(17, 27, 4, 2, C);
        feet(g, C, 29);
        feet(g, '#2b1d12', 30);
        g.pts([[12, 27], [12, 28], [18, 27], [18, 28]], '#d9b38c');
        g.pts([[14, 27], [14, 28], [20, 27], [20, 28], [14, 29], [21, 29]], '#4f2f1a');
      },
    },
    {
      id: 'shoes_hightops', cat: 'shoes', name: 'Высокие кеды', style: 'street', rarity: 'rare', price: 750,
      draw(g) {
        const W = '#f4f4f4';
        g.rect(11, 27, 4, 1, W);
        g.rect(17, 27, 4, 1, W);
        g.rect(11, 28, 4, 1, '#e74c3c');
        g.rect(17, 28, 4, 1, '#e74c3c');
        feet(g, W, 29);
        feet(g, '#222228', 30);
        g.pts([[12, 29], [19, 29]], '#e74c3c');
      },
    },
    {
      id: 'shoes_winged', cat: 'shoes', name: 'Крылатые сандалии', style: 'fantasy', rarity: 'legendary', price: 2500,
      draw(g) {
        const G = '#e8c547', D = '#b8962f';
        g.pts([[11, 29], [13, 29], [18, 29], [20, 29], [12, 28], [19, 28]], G);
        feet(g, D, 30);
        // крылья машут: два кадра
        const W = '#dbe8ff', B = '#7fa3e6';
        const up = g.layer('fx-a', true);
        up.pts([[8, 28], [9, 28], [7, 27], [8, 27], [9, 29]], W);
        up.pts([[23, 28], [22, 28], [24, 27], [23, 27], [22, 29]], W);
        up.pts([[7, 26], [24, 26]], B);
        const down = g.layer('fx-b', true);
        down.pts([[8, 29], [9, 29], [7, 30], [8, 30], [9, 28]], W);
        down.pts([[23, 29], [22, 29], [24, 30], [23, 30], [22, 28]], W);
        down.pts([[7, 31], [24, 31]], B);
      },
    },

    // ===== аксессуары =====
    {
      id: 'acc_cap', cat: 'acc', name: 'Кепка', style: 'sport', rarity: 'common', price: 100,
      draw(g) {
        const C = '#e74c3c', D = '#b8392c';
        g.hline(12, 19, 2, C);
        g.hline(11, 20, 3, C);
        g.hline(10, 21, 4, C);
        g.hline(10, 21, 5, C);
        g.hline(9, 22, 6, D);
        g.pts([[15, 2], [16, 2]], '#ffffff');
        g.pts([[14, 4], [15, 4]], '#ffffff');
      },
    },
    {
      id: 'acc_glasses', cat: 'acc', name: 'Очки', style: 'classic', rarity: 'common', price: 150,
      draw(g) {
        const F = '#3a2f46';
        [11, 17].forEach((x0) => {
          g.hline(x0, x0 + 3, 9, F);
          g.hline(x0, x0 + 3, 12, F);
          g.vline(x0, 10, 11, F);
          g.vline(x0 + 3, 10, 11, F);
        });
        g.pts([[15, 10], [16, 10]], F);
      },
    },
    {
      id: 'acc_scarf', cat: 'acc', name: 'Шарф', style: 'classic', rarity: 'common', price: 200,
      draw(g) {
        const C = '#d64545', D = '#a83232', L = '#ee7070';
        g.hline(11, 20, 16, C);
        g.hline(11, 20, 17, D);
        g.rect(18, 18, 2, 4, C);
        g.vline(19, 18, 21, D);
        g.pts([[12, 16], [14, 16], [16, 16], [18, 16], [18, 19], [18, 21]], L);
      },
    },
    {
      id: 'acc_headphones', cat: 'acc', name: 'Наушники', style: 'street', rarity: 'common', price: 350,
      draw(g) {
        const B = '#2b2b33', C = '#21b8b0', D = '#178a84';
        g.hline(12, 19, 2, B);
        g.pts([[10, 3], [11, 3], [20, 3], [21, 3]], B);
        g.vline(9, 4, 8, B);
        g.vline(22, 4, 8, B);
        g.rect(8, 9, 3, 4, C);
        g.rect(21, 9, 3, 4, C);
        g.vline(10, 9, 12, D);
        g.vline(23, 9, 12, D);
      },
    },
    {
      id: 'acc_sunglasses', cat: 'acc', name: 'Солнечные очки', style: 'street', rarity: 'rare', price: 500,
      draw(g) {
        const K = '#15151c';
        g.rect(11, 10, 4, 2, K);
        g.rect(17, 10, 4, 2, K);
        g.pts([[15, 10], [16, 10], [10, 10], [21, 10]], K);
        g.pts([[12, 10], [18, 10]], '#9aa4b8');
      },
    },
    {
      id: 'acc_crown', cat: 'acc', name: 'Корона', style: 'fantasy', rarity: 'rare', price: 1200,
      draw(g) {
        const G = '#f2c230', D = '#c99a1a';
        g.hline(11, 20, 2, G);
        g.hline(11, 20, 3, D);
        g.pts([[11, 1], [13, 1], [15, 1], [16, 1], [18, 1], [20, 1], [15, 0], [16, 0]], G);
        g.pts([[13, 2], [18, 2]], '#e0314b');
        g.pts([[15, 2], [16, 2]], '#3a7bd5');
      },
    },
    {
      id: 'acc_halo', cat: 'acc', name: 'Нимб', style: 'fantasy', rarity: 'legendary', price: 4000,
      draw(g) {
        const h = g.layer('fx-pulse', true);
        h.hline(12, 19, 0, '#fff3a0');
        h.pts([[11, 1], [12, 1], [19, 1], [20, 1]], '#ffe066');
        h.hline(13, 18, 1, '#fff8cc');
      },
    },
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

  // ---------- сборка картинки ----------

  // look: { g, skin, eyes, hc, eq: { hair, top, pants, shoes, acc } }
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
      if (it && it.cat === cat) it.draw(g, c);
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

  // SVG-картинка персонажа. size — сторона в пикселях (лучше кратно 32).
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
    SKINS, EYES, HAIR, EYE_NAMES, HAIR_NAMES,
    ITEMS, byId, CATS, BASE, RARITY, STYLES,
    svg,
    compose,
  };
})(window.PF);
