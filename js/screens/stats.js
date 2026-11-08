// Вкладка «Статистика»: график времени по занятиям за день / месяц / год и итоги за период.
//
// Записи, которые переходят через границу (например, через полночь), делятся между
// столбцами и периодами по времени. Идущее сейчас занятие учитывается до текущего момента.
(function (PF) {
  'use strict';

  const u = PF.u;
  const ui = PF.ui;
  const store = PF.store;
  const ACTS = PF.ACTS;
  // Занятия на графике: основные всегда, свои — если ещё не удалены или есть время за период.
  let ORDER = PF.BASE_ACTS.slice();
  const actName = (k) => esc(PF.actName(k));
  const t = PF.t;
  const esc = u.esc;

  const RU_MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const RU_M1 = ['Я', 'Ф', 'М', 'А', 'М', 'И', 'И', 'А', 'С', 'О', 'Н', 'Д'];
  const EN_M1 = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const en = () => PF.i18n.lang === 'en';
  const monthName = (m) => (en() ? EN_MONTHS : RU_MONTHS)[m];
  const sec = (d) => Math.floor(d.getTime() / 1000);

  let root = null;
  let mode = 'day'; // day | month | year
  let anchor = null; // Date внутри выбранного периода
  let model = null;

  // ---------- расчёт ----------

  // Период и его столбцы: [{ s, e, label, tip }]
  function buildPeriod() {
    const a = anchor;
    const y = a.getFullYear(), m = a.getMonth(), d = a.getDate();
    const cols = [];
    let s, e, title;
    if (mode === 'day') {
      s = sec(new Date(y, m, d));
      e = sec(new Date(y, m, d + 1));
      for (let h = 0; h < 24; h++) {
        cols.push({
          s: sec(new Date(y, m, d, h)), e: sec(new Date(y, m, d, h + 1)),
          label: h % 6 === 0 ? String(h) : '',
          tip: u.clock(h, 0) + '–' + u.clock((h + 1) % 24, 0),
        });
      }
      title = u.dayTitle(u.dayKey(s));
    } else if (mode === 'month') {
      const n = new Date(y, m + 1, 0).getDate();
      s = sec(new Date(y, m, 1));
      e = sec(new Date(y, m + 1, 1));
      for (let i = 1; i <= n; i++) {
        cols.push({
          s: sec(new Date(y, m, i)), e: sec(new Date(y, m, i + 1)),
          label: (i === 1 || i % 5 === 0) && i <= 30 ? String(i) : '',
          tip: u.dayTitle(u.dayKey(sec(new Date(y, m, i)))),
        });
      }
      title = monthName(m) + ' ' + y;
    } else {
      s = sec(new Date(y, 0, 1));
      e = sec(new Date(y + 1, 0, 1));
      for (let i = 0; i < 12; i++) {
        cols.push({
          s: sec(new Date(y, i, 1)), e: sec(new Date(y, i + 1, 1)),
          label: (en() ? EN_M1 : RU_M1)[i],
          tip: monthName(i) + ' ' + y,
        });
      }
      title = String(y);
    }
    return { s, e, cols, title };
  }

  function compute() {
    const p = buildPeriod();
    const now = u.nowSec();
    const recs = store.S.records.filter((r) => r.e > p.s && r.s < p.e);
    const a = store.S.active;
    if (a && a.s < p.e && now > p.s) recs.push({ a: a.a, s: a.s, e: now });
    const all = store.allActs();
    const zero = () => { const o = {}; all.forEach((k) => { o[k] = 0; }); return o; };
    const totals = zero();
    const coins = zero();
    p.cols.forEach((c) => { c.v = zero(); });
    if (a && a.s < p.e && now > p.s) recs[recs.length - 1].k = store.rateOf(a);
    recs.forEach((r) => {
      if (!(r.a in totals)) return;
      const inP = Math.max(0, Math.min(r.e, p.e) - Math.max(r.s, p.s));
      totals[r.a] += inP;
      coins[r.a] += store.rateOf(r) * inP / 60;
      p.cols.forEach((c) => {
        const ov = Math.min(r.e, c.e) - Math.max(r.s, c.s);
        if (ov > 0) c.v[r.a] += ov;
      });
    });
    const spent = store.S.char.buy.reduce((sum, b) => sum + (b[2] >= p.s && b[2] < p.e ? b[1] : 0), 0);
    p.totals = totals;
    p.coins = coins;
    p.spent = spent;
    ORDER = all.filter((k) => !PF.ACTS[k].custom || !PF.ACTS[k].hidden || totals[k] > 0);
    p.isCurrent = p.s <= now && now < p.e;
    p.isFuture = p.s > now;
    return p;
  }

  // «Красивый» верх шкалы и шаг: 0 / шаг / 2·шаг / … (до 4 делений).
  function niceScale(maxSec) {
    if (mode === 'day') return { max: 3600, step: 1800 };
    const h = maxSec / 3600;
    const steps = [0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500];
    let step = steps.find((st) => st * 4 >= h) || Math.ceil(h / 4 / 100) * 100;
    if (h === 0) step = mode === 'month' ? 2 : 10;
    const max = Math.max(step, Math.ceil(h / step) * step);
    return { max: max * 3600, step: step * 3600 };
  }

  function tickLabel(v) {
    if (mode === 'day') return Math.round(v / 60) + (en() ? ' min' : ' мин');
    const h = v / 3600;
    return (Number.isInteger(h) ? h : h.toFixed(1)) + (en() ? ' h' : ' ч');
  }

  // ---------- отрисовка ----------

  function render(el) {
    root = el;
    if (!anchor) anchor = new Date();
    model = compute();
    const p = model;
    const total = ORDER.reduce((sum, k) => sum + p.totals[k], 0);
    root.innerHTML =
      '<header class="top"><h1>' + t('Статистика') + '</h1></header>' +
      chartTypesHtml() +
      '<div class="seg seg-main" data-seg="stats-mode">' +
      ['day', 'month', 'year'].map((m) =>
        '<button class="seg-btn' + (mode === m ? ' on' : '') + '" data-mode="' + m + '">' +
        t({ day: 'День', month: 'Месяц', year: 'Год' }[m]) + '</button>').join('') +
      '</div>' +
      '<div class="period-nav">' +
      '  <button class="nav-btn" data-nav="-1" aria-label="' + esc(t('Назад')) + '">‹</button>' +
      '  <span class="period-title">' + esc(p.title) + '</span>' +
      '  <button class="nav-btn" data-nav="1"' + (p.isCurrent || p.isFuture ? ' disabled' : '') + ' aria-label="' + esc(t('Вперёд')) + '">›</button>' +
      '</div>' +
      '<div class="card chart-card">' +
      '  <div class="legend">' + ORDER.map((k) =>
        '<span class="lg"><i style="background:' + ACTS[k].color + '"></i>' + actName(k) + '</span>').join('') + '</div>' +
      '  <div class="chart" id="chart"></div>' +
      '</div>' +
      '<div class="group-title">' + t('Итоги за период') + '</div>' +
      totalsHtml(p, total);
    root.onclick = onClick;
    drawChart();
  }

  function totalsHtml(p, total) {
    if (!total) {
      return '<div class="empty">' + t('За этот период записей нет.') + '</div>' + spentHtml(p);
    }
    let earned = 0, lost = 0;
    const rows = ORDER.map((k) => {
      const coins = p.coins[k];
      if (coins > 0) earned += coins; else lost += coins;
      const share = total ? Math.round(p.totals[k] / total * 100) : 0;
      return '<div class="tot-row"><span class="tot-name"><i style="background:' + ACTS[k].color + '"></i>' + actName(k) + '</span>' +
        '<span class="tot-time">' + (p.totals[k] ? u.durShort(p.totals[k]) : '—') + '</span>' +
        '<span class="tot-share">' + share + '%</span>' +
        '<span class="tot-coins' + (Math.round(coins) < 0 ? ' neg' : '') + '">' + u.coins(coins, true) + '</span></div>';
    }).join('');
    const net = earned + lost;
    return '<div class="card list totals">' + rows +
      '<div class="tot-row tot-sum"><span class="tot-name">' + t('Всего') + '</span><span class="tot-time">' + u.durShort(total) + '</span>' +
      '<span class="tot-share"></span><span class="tot-coins"></span></div></div>' +
      '<div class="card pad coins-sum">' +
      '  <div class="kv"><span>' + t('Заработано') + '</span><b class="pos">' + u.coins(earned, true) + '</b></div>' +
      '  <div class="kv"><span>' + t(ORDER.some((k) => PF.ACTS[k].custom && (p.coins[k] < 0 || PF.ACTS[k].rate < 0)) ? 'Потеряно' : 'Потеряно на отдыхе') + '</span><b class="' + (Math.round(lost) < 0 ? 'neg' : '') + '">' + u.coins(lost, true) + '</b></div>' +
      '  <div class="kv kv-total"><span>' + t('Итого за период') + '</span><b class="' + (Math.round(net) < 0 ? 'neg' : '') + '">' +
      ui.coin() + u.coins(net, true) + '</b></div>' +
      '</div>' + spentHtml(p);
  }

  function spentHtml(p) {
    return p.spent ? '<p class="note">' + t('Потрачено в магазине за период: {0} мон.', u.num(p.spent)) + '</p>' : '';
  }

  // ---------- графики ----------

  const CHART_TYPES = [
    { id: 'bars', name: 'Столбцы', icon: 'stats' },
    { id: 'percent', name: 'Проценты', icon: 'percent' },
    { id: 'pie', name: 'Круговая', icon: 'pie' },
    { id: 'lines', name: 'Линии', icon: 'lines' },
    { id: 'cumulative', name: 'Накопление', icon: 'area' },
  ];

  const colTotal = (c) => ORDER.reduce((s2, k) => s2 + c.v[k], 0);

  // Прямоугольник со скруглёнными верхними углами (основание — прямое).
  function topRounded(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
      'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }

  // Плавная линия без «выбросов» за пределы данных (монотонная кубическая кривая).
  function smoothPath(pts) {
    const n = pts.length;
    if (!n) return '';
    if (n === 1) return 'M' + pts[0].x + ',' + pts[0].y;
    const d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) d.push((pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x));
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s2 = a * a + b * b;
      if (s2 > 9) { const tau = 3 / Math.sqrt(s2); m[i] = tau * a * d[i]; m[i + 1] = tau * b * d[i]; }
    }
    let path = 'M' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1], dx = (p1.x - p0.x) / 3;
      path += 'C' + (p0.x + dx).toFixed(1) + ',' + (p0.y + m[i] * dx).toFixed(1) + ' ' +
        (p1.x - dx).toFixed(1) + ',' + (p1.y - m[i + 1] * dx).toFixed(1) + ' ' + p1.x.toFixed(1) + ',' + p1.y.toFixed(1);
    }
    return path;
  }

  function chartTypesHtml() {
    const cur = store.S.prefs.chart;
    return '<div class="chart-types" role="tablist">' + CHART_TYPES.map((c) =>
      '<button class="ct-btn' + (cur === c.id ? ' on' : '') + '" data-chart="' + c.id + '">' + ui.icon(c.icon) + t(c.name) + '</button>').join('') + '</div>';
  }

  let lastChartKey = '';
  function drawChart() {
    const type = store.S.prefs.chart;
    if (type === 'pie') drawPie();
    else if (type === 'lines' || type === 'cumulative') drawLines(type === 'cumulative');
    else drawBars(type === 'percent');
    // Анимация появления — только при смене вида, режима или периода.
    const key = type + '|' + mode + '|' + model.s;
    if (key !== lastChartKey) {
      root.querySelector('#chart').classList.add('chart-anim');
      lastChartKey = key;
    }
  }

  // Общая разметка осей: сетка, подписи шкалы и подписи столбцов.
  function frame(W, H) {
    return { W, H, padL: 50, padR: 8, padT: 10, padB: 22, get iw() { return this.W - this.padL - this.padR; }, get ih() { return this.H - this.padT - this.padB; } };
  }

  function gridHtml(f, sc, fmt) {
    let g = '';
    for (let v = 0; v <= sc.max + 1e-6; v += sc.step) {
      const y = Math.round(f.padT + f.ih - (v / sc.max) * f.ih) + 0.5;
      g += '<line class="grid" x1="' + f.padL + '" x2="' + (f.W - f.padR) + '" y1="' + y + '" y2="' + y + '"/>' +
        '<text class="tick" x="' + (f.padL - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + fmt(v) + '</text>';
    }
    return g;
  }

  function xLabels(f, slot) {
    return model.cols.map((c, i) => (c.label
      ? '<text class="tick" x="' + (f.padL + i * slot + slot / 2) + '" y="' + (f.H - 6) + '" text-anchor="middle">' + c.label + '</text>'
      : '')).join('');
  }

  // Подсказка при наведении/нажатии на столбец (для столбцов и линий).
  function attachHover(box, f, slot, rowsFor, onIndex) {
    const svg = box.querySelector('svg');
    const tip = box.querySelector('#tip');
    const hl = box.querySelector('#hl');
    const n = model.cols.length;
    const hide = () => { tip.hidden = true; if (hl) hl.setAttribute('visibility', 'hidden'); if (onIndex) onIndex(-1); };
    const show = (ev) => {
      const rect = svg.getBoundingClientRect();
      const i = Math.floor((ev.clientX - rect.left - f.padL) / slot);
      if (i < 0 || i >= n) { hide(); return; }
      const c = model.cols[i];
      if (hl) { hl.setAttribute('x', f.padL + i * slot); hl.setAttribute('visibility', 'visible'); }
      if (onIndex) onIndex(i);
      const rows = rowsFor(c, i);
      tip.innerHTML = '<b>' + esc(c.tip) + '</b>' + (rows || '<div class="tip-row muted">' + t('Нет записей') + '</div>');
      tip.hidden = false;
      const tw = tip.offsetWidth;
      const cx = f.padL + i * slot + slot / 2;
      tip.style.left = Math.max(0, Math.min(f.W - tw, cx - tw / 2)) + 'px';
    };
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') hide(); });
  }

  const tipRow = (k, value) =>
    '<div class="tip-row"><i style="background:' + ACTS[k].color + '"></i>' + actName(k) + '<span>' + value + '</span></div>';

  // Заливка градиентом цвета занятия: светлее сверху, насыщеннее снизу.
  let gradN = 0;
  let gid = 'sg0';
  function gradDefs() {
    gid = 'sg' + (++gradN);
    return '<defs>' + ORDER.map((k) => {
      const c = ACTS[k].color;
      return '<linearGradient id="' + gid + k + '" x1="0" y1="0" x2="0.25" y2="1">' +
        '<stop offset="0" style="stop-color:color-mix(in srgb, ' + c + ' 62%, #fff)"/>' +
        '<stop offset="0.55" style="stop-color:' + c + '"/>' +
        '<stop offset="1" style="stop-color:color-mix(in srgb, ' + c + ' 82%, #000)"/>' +
        '</linearGradient>';
    }).join('') + '</defs>';
  }
  const shim = (k) => 'url(#' + gid + k + ')';

  function mount(box, f, inner) {
    box.innerHTML = '<svg width="' + f.W + '" height="' + f.H + '" viewBox="0 0 ' + f.W + ' ' + f.H + '" role="img" aria-label="' +
      esc(t('График времени по занятиям')) + '">' + inner + '</svg><div class="tip" id="tip" hidden></div>';
  }

  // Столбцы (обычные или «проценты» — каждый столбец = 100%).
  function drawBars(percent) {
    const box = root.querySelector('#chart');
    const p = model;
    const f = frame(Math.max(260, box.clientWidth || 320), 190);
    const n = p.cols.length;
    const slot = f.iw / n;
    const bw = Math.min(24, Math.max(3, slot - (slot > 10 ? 4 : 2)));
    const sc = percent ? { max: 1, step: 0.5 } : niceScale(Math.max(0, ...p.cols.map(colTotal)));
    const fmt = percent ? (v) => Math.round(v * 100) + '%' : tickLabel;
    let g = gradDefs() + gridHtml(f, sc, fmt);
    p.cols.forEach((c, i) => {
      const x = f.padL + i * slot + (slot - bw) / 2;
      const tot = colTotal(c);
      let base = f.padT + f.ih;
      const segs = ORDER.filter((k) => c.v[k] > 0);
      segs.forEach((k, j) => {
        const val = percent ? c.v[k] / tot : c.v[k];
        const gap = j > 0 ? 2 : 0;
        const h = Math.max(0, (val / sc.max) * f.ih - gap);
        if (h < 0.5) { base -= gap; return; }
        const y = base - gap - h;
        const st = ' class="bar" style="animation-delay:' + Math.round(i * (300 / n)) + 'ms"';
        g += j === segs.length - 1
          ? '<path' + st + ' d="' + topRounded(x, y, bw, h, 3) + '" fill="' + shim(k) + '"/>'
          : '<rect' + st + ' x="' + x + '" y="' + y + '" width="' + bw + '" height="' + h + '" fill="' + shim(k) + '"/>';
        base = y;
      });
    });
    g += xLabels(f, slot);
    g += '<rect id="hl" class="hl" x="0" y="' + f.padT + '" width="' + slot + '" height="' + f.ih + '" visibility="hidden"/>';
    mount(box, f, g);
    // подсветка — под столбцами
    const svg = box.querySelector('svg');
    svg.insertBefore(box.querySelector('#hl'), svg.firstChild);
    attachHover(box, f, slot, (c) => {
      const tot = colTotal(c);
      return ORDER.filter((k) => c.v[k] > 0).map((k) =>
        tipRow(k, percent ? Math.round(c.v[k] / tot * 100) + '% · ' + u.durShort(c.v[k]) : u.durShort(c.v[k]))).join('');
    });
  }

  // Линии (время по каждому занятию) или накопление (нарастающий итог за период).
  function drawLines(cumulative) {
    const box = root.querySelector('#chart');
    const p = model;
    const f = frame(Math.max(260, box.clientWidth || 320), 200);
    const n = p.cols.length;
    const slot = f.iw / n;
    const now = u.nowSec();
    // До какого столбца рисовать: будущее не показываем.
    let last = n - 1;
    while (last > 0 && p.cols[last].s > now) last--;
    const series = {};
    ORDER.forEach((k) => {
      let acc = 0;
      series[k] = p.cols.slice(0, last + 1).map((c) => (cumulative ? (acc += c.v[k]) : c.v[k]));
    });
    let maxV = 0;
    ORDER.forEach((k) => series[k].forEach((v) => { if (v > maxV) maxV = v; }));
    const sc = cumulative && mode === 'day' ? niceScaleHours(maxV) : (cumulative ? niceScale(maxV) : niceScale(maxV));
    const yOf = (v) => f.padT + f.ih - (v / sc.max) * f.ih;
    const xOf = (i) => f.padL + i * slot + slot / 2;
    let g = gradDefs() + gridHtml(f, sc, cumulative && mode === 'day' ? hoursLabel : tickLabel);
    g += '<rect id="hl" class="hl" x="0" y="' + f.padT + '" width="' + slot + '" height="' + f.ih + '" visibility="hidden"/>';
    const base = f.padT + f.ih;
    ORDER.forEach((k) => {
      const pts = series[k].map((v, i) => ({ x: xOf(i), y: yOf(v) }));
      if (!pts.length) return;
      const line = smoothPath(pts);
      g += '<path d="' + line + 'L' + pts[pts.length - 1].x.toFixed(1) + ',' + base + 'L' + pts[0].x.toFixed(1) + ',' + base + 'Z" ' +
        'class="area" fill="' + ACTS[k].color + '" fill-opacity="0.10"/>';
      // у линии сплошной цвет: градиент по рамке исчезает на горизонтальной линии
      g += '<path class="line" d="' + line + '" stroke="' + ACTS[k].color + '"/>';
      // точка на конце линии
      const e = pts[pts.length - 1];
      g += '<circle class="dot" cx="' + e.x.toFixed(1) + '" cy="' + e.y.toFixed(1) + '" r="4" fill="' + ACTS[k].color + '"/>';
    });
    g += xLabels(f, slot);
    g += '<g id="marks"></g>';
    mount(box, f, g);
    const marks = box.querySelector('#marks');
    attachHover(box, f, slot, (c, i) => {
      if (i > last) return '';
      const rows = ORDER.filter((k) => series[k][i] > 0).map((k) => tipRow(k, u.durShort(series[k][i]))).join('');
      return rows;
    }, (i) => {
      if (i < 0 || i > last) { marks.innerHTML = ''; return; }
      marks.innerHTML = ORDER.map((k) =>
        '<circle class="dot" cx="' + xOf(i).toFixed(1) + '" cy="' + yOf(series[k][i]).toFixed(1) + '" r="5" fill="' + ACTS[k].color + '"/>').join('');
    });
  }

  // Шкала в часах (для накопления за день).
  function niceScaleHours(maxSec) {
    const h = maxSec / 3600;
    const steps = [0.5, 1, 2, 3, 4, 5, 6];
    const step = steps.find((st) => st * 4 >= h) || 6;
    return { max: Math.max(step, Math.ceil(h / step) * step) * 3600, step: step * 3600 };
  }
  function hoursLabel(v) {
    const h = v / 3600;
    return (Number.isInteger(h) ? h : h.toFixed(1)) + (en() ? ' h' : ' ч');
  }

  // Круговая диаграмма (кольцо) с процентами за весь период.
  function drawPie() {
    const box = root.querySelector('#chart');
    const p = model;
    const W = Math.max(260, box.clientWidth || 320);
    const H = 220;
    const total = ORDER.reduce((s2, k) => s2 + p.totals[k], 0);
    const cx = W / 2, cy = H / 2, R = 82, r = 52;
    let g = '';
    if (!total) {
      g = '<circle cx="' + cx + '" cy="' + cy + '" r="' + ((R + r) / 2) + '" fill="none" stroke="var(--line)" stroke-width="' + (R - r) + '"/>' +
        '<text class="pie-sub" x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle">' + t('Нет записей') + '</text>';
      box.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' + g + '</svg>';
      return;
    }
    g += gradDefs();
    const pt = (rad, a) => [cx + rad * Math.sin(a), cy - rad * Math.cos(a)];
    let a0 = 0;
    const slices = [];
    ORDER.forEach((k) => {
      const share = p.totals[k] / total;
      if (share <= 0) return;
      const a1 = a0 + share * Math.PI * 2;
      const big = a1 - a0 > Math.PI ? 1 : 0;
      let d;
      if (share >= 0.9999) {
        // полный круг
        d = 'M' + cx + ',' + (cy - R) + 'A' + R + ',' + R + ' 0 1 1 ' + (cx - 0.01) + ',' + (cy - R) + 'Z' +
          'M' + cx + ',' + (cy - r) + 'A' + r + ',' + r + ' 0 1 0 ' + (cx + 0.01) + ',' + (cy - r) + 'Z';
      } else {
        const [x1, y1] = pt(R, a0), [x2, y2] = pt(R, a1), [x3, y3] = pt(r, a1), [x4, y4] = pt(r, a0);
        d = 'M' + x1 + ',' + y1 + 'A' + R + ',' + R + ' 0 ' + big + ' 1 ' + x2 + ',' + y2 +
          'L' + x3 + ',' + y3 + 'A' + r + ',' + r + ' 0 ' + big + ' 0 ' + x4 + ',' + y4 + 'Z';
      }
      g += '<path class="slice" data-k="' + k + '" d="' + d + '" fill="' + shim(k) + '" fill-rule="evenodd" ' +
        'style="transform-box:view-box;transform-origin:' + cx + 'px ' + cy + 'px;animation-delay:' + (slices.length * 90) + 'ms"/>';
      slices.push({ k, share, mid: (a0 + a1) / 2 });
      a0 = a1;
    });
    // проценты снаружи кольца (для заметных долей)
    slices.forEach((s) => {
      if (s.share < 0.04) return;
      const [lx, ly] = pt(R + 16, s.mid);
      const anchor = Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end';
      g += '<text class="pie-label" x="' + lx.toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '" text-anchor="' + anchor + '">' +
        Math.round(s.share * 100) + '%</text>';
    });
    g += '<text class="pie-center" x="' + cx + '" y="' + (cy + 2) + '" text-anchor="middle">' + esc(u.durShort(total)) + '</text>' +
      '<text class="pie-sub" x="' + cx + '" y="' + (cy + 20) + '" text-anchor="middle">' + t('всего') + '</text>';
    box.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
      esc(t('График времени по занятиям')) + '">' + g + '</svg><div class="tip" id="tip" hidden></div>';
    const tip = box.querySelector('#tip');
    box.querySelectorAll('.slice').forEach((el) => {
      const showTip = () => {
        const k = el.dataset.k;
        tip.innerHTML = tipRow(k, Math.round(p.totals[k] / total * 100) + '% · ' + u.durShort(p.totals[k]));
        tip.hidden = false;
        tip.style.left = Math.max(0, (W - tip.offsetWidth) / 2) + 'px';
      };
      el.addEventListener('pointerenter', showTip);
      el.addEventListener('pointerdown', showTip);
    });
    box.querySelector('svg').addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') tip.hidden = true; });
  }

  // ---------- нажатия ----------

  function onClick(e) {
    const ct = e.target.closest('[data-chart]');
    if (ct) { store.setPref('chart', ct.dataset.chart); return; }
    const m = e.target.closest('[data-mode]');
    if (m) { mode = m.dataset.mode; anchor = new Date(); render(root); return; }
    const nav = e.target.closest('[data-nav]');
    if (nav && !nav.disabled) {
      const d = Number(nav.dataset.nav);
      const a = anchor;
      if (mode === 'day') anchor = new Date(a.getFullYear(), a.getMonth(), a.getDate() + d);
      else if (mode === 'month') anchor = new Date(a.getFullYear(), a.getMonth() + d, 1);
      else anchor = new Date(a.getFullYear() + d, 0, 1);
      render(root);
    }
  }

  // Раз в минуту обновляем, если смотрим текущий период и идёт занятие.
  let lastMin = 0;
  function tick() {
    const mnt = Math.floor(Date.now() / 60000);
    if (mnt !== lastMin) {
      lastMin = mnt;
      if (root && model && model.isCurrent && store.S.active && !ui.hasOpenSheet()) render(root);
    }
  }

  PF.screens = PF.screens || {};
  PF.screens.stats = {
    render,
    tick,
    reset() { anchor = new Date(); },
  };
})(window.PF);
