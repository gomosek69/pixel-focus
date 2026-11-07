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
  const ORDER = PF.ACT_ORDER;
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
          tip: u.pad(h) + ':00–' + u.pad((h + 1) % 24) + ':00',
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
    const totals = { work: 0, study: 0, rest: 0 };
    p.cols.forEach((c) => { c.v = { work: 0, study: 0, rest: 0 }; });
    recs.forEach((r) => {
      totals[r.a] += Math.max(0, Math.min(r.e, p.e) - Math.max(r.s, p.s));
      p.cols.forEach((c) => {
        const ov = Math.min(r.e, c.e) - Math.max(r.s, c.s);
        if (ov > 0) c.v[r.a] += ov;
      });
    });
    const spent = store.S.char.buy.reduce((sum, b) => sum + (b[2] >= p.s && b[2] < p.e ? b[1] : 0), 0);
    p.totals = totals;
    p.spent = spent;
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
      '<div class="seg seg-main">' +
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
        '<span class="lg"><i style="background:' + ACTS[k].color + '"></i>' + t(ACTS[k].name) + '</span>').join('') + '</div>' +
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
      const coins = ACTS[k].rate * p.totals[k] / 60;
      if (coins > 0) earned += coins; else lost += coins;
      const share = total ? Math.round(p.totals[k] / total * 100) : 0;
      return '<div class="tot-row"><span class="tot-name"><i style="background:' + ACTS[k].color + '"></i>' + t(ACTS[k].name) + '</span>' +
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
      '  <div class="kv"><span>' + t('Потеряно на отдыхе') + '</span><b class="' + (Math.round(lost) < 0 ? 'neg' : '') + '">' + u.coins(lost, true) + '</b></div>' +
      '  <div class="kv kv-total"><span>' + t('Итого за период') + '</span><b class="' + (Math.round(net) < 0 ? 'neg' : '') + '">' +
      ui.coin() + u.coins(net, true) + '</b></div>' +
      '</div>' + spentHtml(p);
  }

  function spentHtml(p) {
    return p.spent ? '<p class="note">' + t('Потрачено в магазине за период: {0} мон.', u.num(p.spent)) + '</p>' : '';
  }

  // Прямоугольник со скруглёнными верхними углами (основание — прямое).
  function topRounded(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
      'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  }

  function drawChart() {
    const box = root.querySelector('#chart');
    const p = model;
    const W = Math.max(260, box.clientWidth || 320);
    const H = 190;
    const padL = 50, padR = 6, padT = 10, padB = 22;
    const iw = W - padL - padR, ih = H - padT - padB;
    const maxCol = Math.max(0, ...p.cols.map((c) => ORDER.reduce((s2, k) => s2 + c.v[k], 0)));
    const sc = niceScale(maxCol);
    const n = p.cols.length;
    const slot = iw / n;
    const bw = Math.min(24, Math.max(3, slot - (slot > 10 ? 4 : 2)));
    const yOf = (v) => padT + ih - (v / sc.max) * ih;
    let g = '';
    // сетка и подписи шкалы
    for (let v = 0; v <= sc.max + 1; v += sc.step) {
      const y = Math.round(yOf(v)) + 0.5;
      g += '<line class="grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y + '" y2="' + y + '"/>' +
        '<text class="tick" x="' + (padL - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + tickLabel(v) + '</text>';
    }
    // столбцы: сегменты снизу вверх, между ними зазор 2px, верхний — со скруглением
    p.cols.forEach((c, i) => {
      const x = padL + i * slot + (slot - bw) / 2;
      let base = padT + ih;
      const segs = ORDER.filter((k) => c.v[k] > 0);
      segs.forEach((k, j) => {
        let h = (c.v[k] / sc.max) * ih;
        const isTop = j === segs.length - 1;
        const gap = j > 0 ? 2 : 0;
        h = Math.max(0, h - gap);
        if (h < 0.5) { base -= gap; return; }
        const y = base - gap - h;
        g += isTop
          ? '<path d="' + topRounded(x, y, bw, h, 3) + '" fill="' + ACTS[k].color + '"/>'
          : '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + h + '" fill="' + ACTS[k].color + '"/>';
        base = y;
      });
      if (c.label) {
        g += '<text class="tick" x="' + (padL + i * slot + slot / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + c.label + '</text>';
      }
    });
    // подсветка выбранного столбца
    g += '<rect id="hl" class="hl" x="0" y="' + padT + '" width="' + slot + '" height="' + ih + '" visibility="hidden"/>';
    box.innerHTML =
      '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
      esc(t('График времени по занятиям')) + '">' + g + '</svg><div class="tip" id="tip" hidden></div>';

    const svg = box.querySelector('svg');
    const tip = box.querySelector('#tip');
    const hl = box.querySelector('#hl');
    const show = (ev) => {
      const rect = svg.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const i = Math.floor((x - padL) / slot);
      if (i < 0 || i >= n) { hide(); return; }
      const c = p.cols[i];
      const tot = ORDER.reduce((s2, k) => s2 + c.v[k], 0);
      hl.setAttribute('x', padL + i * slot);
      hl.setAttribute('visibility', 'visible');
      tip.innerHTML = '<b>' + esc(c.tip) + '</b>' + (tot
        ? ORDER.filter((k) => c.v[k] > 0).map((k) =>
          '<div class="tip-row"><i style="background:' + ACTS[k].color + '"></i>' + t(ACTS[k].name) +
          '<span>' + u.durShort(c.v[k]) + '</span></div>').join('')
        : '<div class="tip-row muted">' + t('Нет записей') + '</div>');
      tip.hidden = false;
      const tw = tip.offsetWidth;
      const cx = padL + i * slot + slot / 2;
      tip.style.left = Math.max(0, Math.min(W - tw, cx - tw / 2)) + 'px';
    };
    const hide = () => { tip.hidden = true; hl.setAttribute('visibility', 'hidden'); };
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') hide(); });
  }

  // ---------- нажатия ----------

  function onClick(e) {
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
