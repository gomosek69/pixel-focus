// Вкладка «Я»: трекеры здоровья и привычек (вес, давление, пульс, сон, вода, настроение, шаги).
//
// Главный экран вкладки — карточки трекеров с последним значением и мини-графиком за 7 дней.
// Нажатие на карточку открывает трекер: график за неделю / месяц / год, итоги и список записей.
// Записей в день может быть сколько угодно: для графика они сводятся в одно значение за день
// (среднее — у веса, давления, пульса, настроения; сумма — у сна, воды, шагов).
(function (PF) {
  'use strict';

  const u = PF.u;
  const ui = PF.ui;
  const store = PF.store;
  const t = PF.t;
  const esc = u.esc;
  const TR = PF.TRACKERS;
  const IDS = PF.TRACKER_IDS;
  const DAY = 86400;
  const MOOD_NAMES = ['Ужасно', 'Плохо', 'Нормально', 'Хорошо', 'Отлично'];
  // Минималистичные лица: круг, глаза-точки, рот от грустного к радостному.
  const MOOD_COLORS = ['#7c8aa5', '#8fa3bf', '#b0a68c', '#e2a400', '#ef8a1f'];
  const MOUTHS = ['M8 17.2q4-4 8 0', 'M8.5 16.2q3.5-2 7 0', 'M8.5 15.5h7', 'M8.5 14.4q3.5 2.6 7 0', 'M7.8 13.8q4.2 5 8.4 0'];
  function faceInner(v) {
    const i = Math.max(0, Math.min(4, Math.round(v) - 1));
    const eyes = i === 0
      ? '<path d="M8 9.5l2 1M16 9.5l-2 1"/>'
      : '<circle cx="9.2" cy="10" r="0.6" fill="currentColor"/><circle cx="14.8" cy="10" r="0.6" fill="currentColor"/>';
    return '<circle cx="12" cy="12" r="9.5"/>' + eyes + '<path d="' + MOUTHS[i] + '"/>';
  }
  function moodFace(v, cls) {
    const i = Math.max(0, Math.min(4, Math.round(v) - 1));
    return '<svg class="mood-face ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" style="color:' + MOOD_COLORS[i] + '">' + faceInner(v) + '</svg>';
  }
  // Отметки чувств к записи настроения (хранятся битами).
  const FEELINGS = ['Радость', 'Спокойствие', 'Благодарность', 'Вдохновение', 'Энергия', 'Любовь',
    'Грусть', 'Тревога', 'Стресс', 'Усталость', 'Раздражение', 'Одиночество', 'Скука', 'Страх'];
  const feelList = (f) => FEELINGS.filter((x, i) => f & (1 << i));
  const feelChips = (f) => feelList(f).map((x) => '<span class="feel-chip' + (FEELINGS.indexOf(x) >= 6 ? ' sad' : '') + '">' + t(x) + '</span>').join('');

  let root = null;
  let open = null;      // открытый трекер (или null — список)
  let mode = 'week';    // week | month | year
  let anchor = null;    // Date внутри выбранного периода
  let shown = 20;       // сколько записей показано в списке
  let animKey = '';     // чтобы анимировать график только при смене трекера / периода

  const en = () => PF.i18n.lang === 'en';
  const sec = (d) => Math.floor(d.getTime() / 1000);
  const lb = () => store.S.prefs.wunit === 'lb';
  const fmtNum = (v, d) => {
    const s = Number(v).toLocaleString(en() ? 'en-US' : 'ru-RU', { maximumFractionDigits: d, minimumFractionDigits: 0 });
    return s;
  };

  // ---------- значения ----------

  // Вес для показа: в кг или фунтах.
  const wShow = (kg) => (lb() ? kg / PF.LB : kg);
  const wUnit = () => t(lb() ? 'фунт.' : 'кг');

  // Значение для показа (без единиц). e — запись или сводное значение { v, v2 }.
  function valText(id, e) {
    if (id === 'weight') return fmtNum(wShow(e.v), 1);
    if (id === 'pressure') return Math.round(e.v) + '/' + Math.round(e.v2);
    if (id === 'sleep') return sleepText(e.v);
    if (id === 'mood') return moodFace(e.v);
    if (id === 'water') return fmtNum(e.v, 1);
    return fmtNum(Math.round(e.v), 0);
  }
  function unitText(id, v) {
    if (id === 'weight') return wUnit();
    if (id === 'pressure') return t('мм рт. ст.');
    if (id === 'pulse') return t('уд/мин');
    if (id === 'water') return t(Math.round(v) === 1 ? 'стакан' : 'стак.');
    if (id === 'steps') return t('шагов');
    return '';
  }
  function sleepText(h) {
    const m = Math.round(h * 60);
    const H = Math.floor(m / 60), M = m % 60;
    return H + (en() ? ' h' : ' ч') + (M ? ' ' + u.pad(M) + (en() ? ' min' : ' мин') : '');
  }
  const full = (id, e) => valText(id, e) + (unitText(id, e.v) ? ' ' + unitText(id, e.v) : '');

  // Числа для графика: вес — в выбранных единицах.
  const chartV = (id, v) => (id === 'weight' ? wShow(v) : v);

  // Сводка за день: среднее или сумма. Возвращает Map дня → { v, v2, n }.
  function dailyMap(id) {
    const map = new Map();
    store.S.me[id].forEach((e) => {
      const k = u.dayKey(e.t);
      let d = map.get(k);
      if (!d) { d = { v: 0, v2: 0, n: 0 }; map.set(k, d); }
      d.v += e.v; d.v2 += e.v2 || 0; d.n++;
    });
    if (TR[id].agg === 'avg') map.forEach((d) => { d.v /= d.n; d.v2 /= d.n; });
    return map;
  }

  // Период и его точки: [{ s, e, label, tip, v?, v2? }]
  function buildPeriod(id) {
    const a = anchor;
    const y = a.getFullYear(), m = a.getMonth();
    const pts = [];
    let s, e, title;
    const days = dailyMap(id);
    const dayPt = (dt, label) => {
      const k = u.dayKey(sec(dt));
      const d = days.get(k);
      const p = { s: sec(dt), label, tip: u.dayTitle(k) };
      if (d) { p.v = d.v; p.v2 = d.v2; }
      return p;
    };
    if (mode === 'week') {
      const wd = (a.getDay() + 6) % 7; // понедельник — начало недели
      const d0 = new Date(y, m, a.getDate() - wd);
      for (let i = 0; i < 7; i++) {
        const dt = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i);
        pts.push(dayPt(dt, u.weekdayShort ? u.weekdayShort(dt) : String(dt.getDate())));
      }
      s = pts[0].s; e = s + 7 * DAY + 3600;
      const last = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 6);
      title = u.shortDate(s) + ' – ' + u.shortDate(sec(last));
    } else if (mode === 'month') {
      const n = new Date(y, m + 1, 0).getDate();
      for (let i = 1; i <= n; i++) pts.push(dayPt(new Date(y, m, i), (i === 1 || i % 5 === 0) && i <= 30 ? String(i) : ''));
      s = pts[0].s; e = sec(new Date(y, m + 1, 1));
      title = monthName(m) + ' ' + y;
    } else {
      // год: по месяцам — среднее значение за день (по дням с записями)
      for (let i = 0; i < 12; i++) {
        const ms = sec(new Date(y, i, 1)), me = sec(new Date(y, i + 1, 1));
        let sum = 0, sum2 = 0, n = 0;
        days.forEach((d, k) => {
          const ds = u.fromInputs(k, '12:00');
          if (ds >= ms && ds < me) { sum += d.v; sum2 += d.v2; n++; }
        });
        const p = { s: ms, label: (en() ? 'JFMAMJJASOND' : 'ЯФМАМИИАСОНД')[i], tip: monthName(i) + ' ' + y };
        if (n) { p.v = sum / n; p.v2 = sum2 / n; }
        pts.push(p);
      }
      s = sec(new Date(y, 0, 1)); e = sec(new Date(y + 1, 0, 1));
      title = String(y);
    }
    const now = u.nowSec();
    return { s, e, pts, title, isCurrent: s <= now && now < e, isFuture: s > now };
  }

  const RU_MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = (m) => (en() ? EN_MONTHS : RU_MONTHS)[m];

  // ---------- отрисовка ----------

  function render(el) {
    root = el;
    if (!anchor) anchor = new Date();
    if (open) renderTracker(); else renderList();
    root.onclick = onClick;
    ui.syncBackButton();
  }

  function last(id) {
    const l = store.S.me[id];
    return l.length ? l[l.length - 1] : null;
  }

  function whenText(tm) {
    const k = u.dayKey(tm), today = u.dayKey(u.nowSec());
    if (k === today) return t('сегодня, {0}', u.hm(tm));
    if (k === u.addDays(today, -1)) return t('вчера, {0}', u.hm(tm));
    return u.shortDate(tm);
  }

  function renderList() {
    const name = PF.greet ? PF.greet.name() : '';
    root.innerHTML =
      '<header class="top"><h1>' + t('Я') + '</h1></header>' +
      '<div class="card me-hero"><div class="me-hero-char">' + PF.char.svg(store.look(), 128) + '</div>' +
      '<div><div class="me-hero-name">' + esc(name || t('Мой профиль')) + '</div>' +
      '<div class="hint">' + t('Записывайте показатели регулярно — графики покажут, как они меняются.') + '</div></div></div>' +
      '<div class="me-grid">' + IDS.map(cardHtml).join('') + '</div>';
  }

  function cardHtml(id) {
    const tr = TR[id];
    const e = id === 'water' ? todayWater() : last(id);
    let val, sub;
    if (id === 'water') {
      val = '<b>' + fmtNum(e, 0) + '</b> <span>' + unitText(id, e) + '</span>';
      sub = t('сегодня') + ' · ' + fmtNum(e * 0.25, 2) + ' ' + t('л');
    } else if (e) {
      val = '<b>' + valText(id, e) + '</b>' + (unitText(id, e.v) ? ' <span>' + unitText(id, e.v) + '</span>' : '');
      sub = whenText(e.t);
    } else {
      val = '<b class="me-empty">—</b>';
      sub = t('нет записей');
    }
    return '<div class="card me-card" style="--c:' + tr.color + '" data-open="' + id + '" role="button" tabindex="0">' +
      '<div class="me-card-top"><span class="me-ic">' + ui.icon(tr.icon) + '</span><span class="me-name">' + t(tr.name) + '</span>' +
      (id === 'water' ? '<button class="me-plus" data-water="1" aria-label="' + esc(t('+1 стакан')) + '">' + ui.icon('plus') + '</button>' : '') +
      '</div>' +
      '<div class="me-val">' + val + '</div>' +
      '<div class="me-sub">' + sub + '</div>' +
      spark(id) + '</div>';
  }

  function todayWater() {
    const today = u.dayKey(u.nowSec());
    return store.S.me.water.filter((x) => u.dayKey(x.t) === today).reduce((s, x) => s + x.v, 0);
  }

  // Мини-график за последние 7 дней.
  function spark(id) {
    const days = dailyMap(id);
    const today = u.dayKey(u.nowSec());
    const vals = [];
    for (let i = 6; i >= 0; i--) { const d = days.get(u.addDays(today, -i)); vals.push(d ? d.v : null); }
    const have = vals.filter((v) => v !== null);
    if (!have.length) return '<svg class="me-spark" viewBox="0 0 100 24"></svg>';
    const W = 100, H = 24;
    if (TR[id].agg === 'sum') {
      const max = Math.max(...have, 1e-9);
      return '<svg class="me-spark" viewBox="0 0 100 24" preserveAspectRatio="none">' + vals.map((v, i) => {
        const h = v === null ? 0 : Math.max(2, v / max * (H - 2));
        return '<rect x="' + (i * 14.6 + 1) + '" y="' + (H - h) + '" width="10" height="' + h + '" rx="2" fill="var(--c)" opacity="' + (i === 6 ? 1 : 0.45) + '"/>';
      }).join('') + '</svg>';
    }
    let mn = Math.min(...have), mx = Math.max(...have);
    if (mx - mn < 1e-9) { mn -= 1; mx += 1; }
    const pts = [];
    vals.forEach((v, i) => { if (v !== null) pts.push([i / 6 * (W - 6) + 3, H - 3 - (v - mn) / (mx - mn) * (H - 6)]); });
    return '<svg class="me-spark" viewBox="0 0 100 24" preserveAspectRatio="none">' +
      (pts.length > 1 ? '<polyline points="' + pts.map((p) => p.join(',')).join(' ') + '" fill="none" stroke="var(--c)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' : '') +
      '</svg>';
  }

  // ---------- трекер ----------

  function renderTracker() {
    const id = open, tr = TR[id];
    const p = buildPeriod(id);
    const e = id === 'water' ? null : last(id);
    let head;
    if (id === 'water') {
      const w = todayWater();
      head = '<div class="tr-big"><b>' + fmtNum(w, 0) + '</b> <span>' + unitText(id, w) + ' · ' + fmtNum(w * 0.25, 2) + ' ' + t('л') + '</span></div>' +
        '<div class="hint">' + t('Сегодня') + '</div>' +
        '<div class="water-btns"><button class="btn btn-ghost" data-water="-1"' + (w ? '' : ' disabled') + '>' + ui.icon('minus') + '</button>' +
        '<button class="btn btn-primary tr-color" data-water="1">' + ui.icon('plus') + t('+1 стакан') + '</button></div>';
    } else if (e) {
      head = '<div class="tr-big"><b>' + valText(id, e) + '</b>' + (unitText(id, e.v) ? ' <span>' + unitText(id, e.v) + '</span>' : '') +
        (id === 'mood' ? ' <span>' + t(MOOD_NAMES[e.v - 1]) + '</span>' : '') + '</div>' +
        '<div class="hint">' + t('Последняя запись: {0}', whenText(e.t)) + '</div>';
    } else {
      head = '<div class="tr-big"><b class="me-empty">—</b></div><div class="hint">' + t('Записей пока нет') + '</div>';
    }
    const key = id + mode + p.s;
    const anim = key !== animKey;
    animKey = key;
    root.innerHTML =
      '<header class="top top-row tr-head"><button class="icon-btn" data-action="back" aria-label="' + esc(t('Назад')) + '">' + ui.icon('back') + '</button>' +
      '<h1>' + t(tr.name) + '</h1><span class="me-ic big" style="--c:' + tr.color + '">' + ui.icon(tr.icon) + '</span></header>' +
      '<div class="card pad tr-top" style="--c:' + tr.color + '">' + head +
      (id !== 'water' ? '<button class="btn btn-primary tr-color" data-action="add">' + ui.icon('plus') + t('Добавить запись') + '</button>' : '') +
      '</div>' +
      (id === 'weight' ? weightSettings() : '') +
      '<div class="seg seg-main" data-seg="me-mode">' +
      ['week', 'month', 'year'].map((m) => '<button class="seg-btn' + (mode === m ? ' on' : '') + '" data-mode="' + m + '">' +
        t({ week: 'Неделя', month: 'Месяц', year: 'Год' }[m]) + '</button>').join('') + '</div>' +
      '<div class="period-nav">' +
      '  <button class="nav-btn" data-nav="-1" aria-label="' + esc(t('Назад')) + '">‹</button>' +
      '  <span class="period-title">' + esc(p.title) + '</span>' +
      '  <button class="nav-btn" data-nav="1"' + (p.isCurrent || p.isFuture ? ' disabled' : '') + ' aria-label="' + esc(t('Вперёд')) + '">›</button>' +
      '</div>' +
      '<div class="card chart-card" style="--c:' + tr.color + '">' + chartHtml(id, p, anim) + '</div>' +
      summaryHtml(id, p) +
      '<div class="group-title">' + t('Записи') + '</div>' + entriesHtml(id);
  }

  function weightSettings() {
    const pr = store.S.prefs;
    const goal = pr.wgoal;
    const e = last('weight');
    let goalTxt = t('Цель не задана');
    if (goal) {
      goalTxt = t('Цель: {0}', fmtNum(wShow(goal), 1) + ' ' + wUnit());
      if (e) {
        const diff = wShow(e.v) - wShow(goal);
        goalTxt += ' · ' + (Math.abs(diff) < 0.05 ? t('цель достигнута!') : t(diff > 0 ? 'осталось сбросить {0}' : 'осталось набрать {0}', fmtNum(Math.abs(diff), 1) + ' ' + wUnit()));
      }
    }
    return '<div class="card list w-set">' +
      '<button class="w-row" data-action="goal"><span>' + goalTxt + '</span><span class="w-edit">' + t(goal ? 'Изменить' : 'Задать') + '</span></button>' +
      '<div class="w-row"><span>' + t('Единицы') + '</span><div class="seg seg-small" data-seg="wunit">' +
      ['kg', 'lb'].map((un) => '<button class="seg-btn' + (pr.wunit === un ? ' on' : '') + '" data-unit="' + un + '">' + t(un === 'kg' ? 'кг' : 'фунты') + '</button>').join('') +
      '</div></div></div>';
  }

  // «Красивая» шкала: от/до и шаг.
  function scale(mn, mx, sum) {
    if (sum) mn = 0;
    if (mx - mn < 1e-9) { mx += sum ? 1 : 1; mn -= sum ? 0 : 1; }
    const raw = (mx - mn) / 3;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((st) => st >= raw) || raw;
    const lo = Math.floor(mn / step) * step, hi = Math.ceil(mx / step) * step;
    return { lo, hi: hi === lo ? lo + step : hi, step };
  }

  function chartHtml(id, p, anim) {
    const tr = TR[id];
    const W = 340, H = 190, L = 34, R = 8, T = 10, B = 22;
    const pw = W - L - R, ph = H - T - B;
    const n = p.pts.length;
    const sum = tr.agg === 'sum';
    const vals = [];
    p.pts.forEach((pt) => { if (pt.v !== undefined) { vals.push(chartV(id, pt.v)); if (id === 'pressure') vals.push(pt.v2); } });
    const goal = id === 'weight' && store.S.prefs.wgoal ? wShow(store.S.prefs.wgoal) : null;
    if (goal !== null && vals.length) vals.push(goal);
    if (!vals.length) {
      return '<div class="empty tr-empty">' + t('За этот период записей нет.') + '</div>';
    }
    let mn = Math.min(...vals), mx = Math.max(...vals);
    if (id === 'mood') { mn = 1; mx = 5; }
    const sc = id === 'mood' ? { lo: 1, hi: 5, step: 1 } : scale(mn, mx, sum);
    const xOf = (i) => L + (n === 1 ? pw / 2 : (sum ? (i + 0.5) * pw / n : i * pw / (n - 1)));
    const yOf = (v) => T + ph - (v - sc.lo) / (sc.hi - sc.lo) * ph;
    let g = '';
    for (let v = sc.lo; v <= sc.hi + 1e-9; v += sc.step) {
      const y = yOf(v).toFixed(1);
      g += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/>' +
        '<text class="axis" x="' + (L - 6) + '" y="' + (Number(y) + 4) + '" text-anchor="end">' +
        (id === 'mood' ? '' : axisLabel(id, v)) + '</text>' +
        (id === 'mood' ? '<svg x="' + (L - 18) + '" y="' + (Number(y) - 6) + '" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="' + MOOD_COLORS[Math.round(v) - 1] + '" stroke-width="2" stroke-linecap="round">' + faceInner(v).replace(/currentColor/g, MOOD_COLORS[Math.round(v) - 1]) + '</svg>' : '');
    }
    p.pts.forEach((pt, i) => {
      if (pt.label) g += '<text class="axis" x="' + xOf(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + pt.label + '</text>';
    });
    if (goal !== null) {
      const y = yOf(goal).toFixed(1);
      g += '<line class="goal" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/>' +
        '<text class="goal-t" x="' + (W - R) + '" y="' + (Number(y) - 4) + '" text-anchor="end">' + t('цель') + '</text>';
    }
    if (sum) {
      const bw = Math.max(3, Math.min(26, pw / n * 0.62));
      p.pts.forEach((pt, i) => {
        if (pt.v === undefined) return;
        const y = yOf(pt.v), h = Math.max(1.5, T + ph - y);
        g += '<rect class="bar' + (anim ? ' grow' : '') + '" x="' + (xOf(i) - bw / 2).toFixed(1) + '" y="' + (T + ph - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="' + Math.min(4, bw / 3).toFixed(1) + '" fill="var(--c)" style="animation-delay:' + Math.min(i * 15, 300) + 'ms"/>';
      });
    } else {
      const series = id === 'pressure' ? [['v', 1], ['v2', 0.55]] : [['v', 1]];
      series.forEach(([key, op]) => {
        const pts = [];
        p.pts.forEach((pt, i) => { if (pt.v !== undefined) pts.push([xOf(i), yOf(key === 'v' ? chartV(id, pt.v) : pt.v2)]); });
        if (pts.length > 1) {
          const d = 'M' + pts.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L');
          g += '<path class="tr-line' + (anim ? ' draw' : '') + '" d="' + d + '" stroke="var(--c)" stroke-opacity="' + op + '" pathLength="1"/>';
          if (key === 'v' && id !== 'pressure') {
            g += '<path class="tr-area" d="' + d + 'L' + pts[pts.length - 1][0].toFixed(1) + ',' + (T + ph) + 'L' + pts[0][0].toFixed(1) + ',' + (T + ph) + 'Z" fill="var(--c)"/>';
          }
        }
        const r = n > 31 ? 2.5 : 3.5;
        pts.forEach((q) => { g += '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="' + r + '" fill="var(--c)" fill-opacity="' + op + '"/>'; });
      });
    }
    // невидимые зоны для подсказки по нажатию
    p.pts.forEach((pt, i) => {
      if (pt.v === undefined) return;
      const w = pw / n;
      g += '<rect class="hit" data-pt="' + i + '" x="' + (xOf(i) - w / 2).toFixed(1) + '" y="' + T + '" width="' + w.toFixed(1) + '" height="' + ph + '" fill="transparent"/>';
    });
    return (id === 'pressure' ? '<div class="legend"><span class="lg"><i style="background:var(--c)"></i>' + t('Верхнее') + '</span>' +
      '<span class="lg"><i style="background:var(--c);opacity:.55"></i>' + t('Нижнее') + '</span></div>' : '') +
      '<svg class="tr-chart" viewBox="0 0 ' + W + ' ' + H + '">' + g + '</svg><div class="tr-tip" id="trTip"></div>';
  }

  function axisLabel(id, v) {
    if (id === 'steps' && v >= 1000) return fmtNum(v / 1000, 1) + (en() ? 'k' : 'к');
    if (id === 'sleep') return fmtNum(v, 1) + (en() ? 'h' : 'ч');
    return fmtNum(v, 1);
  }

  // Итоги за период.
  function summaryHtml(id, p) {
    const pts = p.pts.filter((x) => x.v !== undefined);
    if (!pts.length) return '';
    const vs = pts.map((x) => x.v);
    const kv = (k, v) => '<div class="kv"><span>' + k + '</span><b>' + v + '</b></div>';
    let rows = '';
    if (TR[id].agg === 'sum') {
      const avg = vs.reduce((a, b) => a + b, 0) / vs.length;
      if (mode !== 'year') rows += kv(t('Всего за период'), full(id, { v: vs.reduce((a, b) => a + b, 0) }));
      rows += kv(t('В среднем за день'), full(id, { v: id === 'water' ? Math.round(avg * 10) / 10 : avg }));
      rows += kv(t('Лучший день'), full(id, { v: Math.max(...vs) }));
    } else if (id === 'pressure') {
      const a1 = vs.reduce((a, b) => a + b, 0) / vs.length, a2 = pts.reduce((a, b) => a + b.v2, 0) / pts.length;
      rows += kv(t('Среднее'), Math.round(a1) + '/' + Math.round(a2) + ' ' + t('мм рт. ст.'));
      const hi = pts.reduce((a, b) => (b.v > a.v ? b : a));
      const lo = pts.reduce((a, b) => (b.v < a.v ? b : a));
      rows += kv(t('Самое высокое'), Math.round(hi.v) + '/' + Math.round(hi.v2));
      rows += kv(t('Самое низкое'), Math.round(lo.v) + '/' + Math.round(lo.v2));
    } else {
      const avg = vs.reduce((a, b) => a + b, 0) / vs.length;
      if (id === 'mood') {
        rows += kv(t('Среднее'), moodFace(avg, 'inline') + ' ' + t(MOOD_NAMES[Math.round(avg) - 1]));
        // какие чувства отмечались чаще всего за период
        const cnt = FEELINGS.map(() => 0);
        store.S.me.mood.forEach((x) => { if (x.t >= p.s && x.t < p.e && x.v2) FEELINGS.forEach((f, i) => { if (x.v2 & (1 << i)) cnt[i]++; }); });
        const top = cnt.map((n, i) => [n, i]).filter((q) => q[0]).sort((a, b) => b[0] - a[0]).slice(0, 4);
        if (top.length) rows += '<div class="kv kv-feel"><span>' + t('Чаще всего') + '</span><span class="feel-top">' +
          top.map(([n, i]) => '<span class="feel-chip' + (i >= 6 ? ' sad' : '') + '">' + t(FEELINGS[i]) + ' ×' + n + '</span>').join('') + '</span></div>';
      } else {
        rows += kv(t('Среднее'), full(id, { v: avg }));
        rows += kv(t('Минимум'), full(id, { v: Math.min(...vs) }));
        rows += kv(t('Максимум'), full(id, { v: Math.max(...vs) }));
      }
      if (id === 'weight' && pts.length > 1) {
        const d = wShow(pts[pts.length - 1].v) - wShow(pts[0].v);
        rows += kv(t('Изменение'), (d > 0 ? '+' : d < 0 ? '−' : '') + fmtNum(Math.abs(d), 1) + ' ' + wUnit());
      }
    }
    return '<div class="card pad coins-sum">' + rows + '</div>';
  }

  function entriesHtml(id) {
    const list = store.S.me[id];
    if (!list.length) return '<div class="empty">' + t('Записей пока нет') + '</div>';
    const items = list.slice(-shown).reverse();
    let html = '', day = '';
    items.forEach((e) => {
      const k = u.dayKey(e.t);
      if (k !== day) {
        if (day) html += '</div>';
        day = k;
        html += '<div class="day-head"><span class="day-title">' + u.dayTitle(k) + '</span></div><div class="card list">';
      }
      html += '<button class="rec" data-entry="' + e.t + '"><span class="bar" style="background:' + TR[id].color + '"></span>' +
        '<span class="rec-main"><span class="rec-name">' + full(id, e) + (id === 'mood' ? ' ' + t(MOOD_NAMES[e.v - 1]) : '') + '</span>' +
        (id === 'mood' && e.v2 ? '<span class="feel-row">' + feelChips(e.v2) + '</span>' : '') +
        '<span class="rec-time">' + u.hm(e.t) + '</span></span></button>';
    });
    html += '</div>';
    if (list.length > shown) html += '<button class="btn btn-ghost more" data-action="more">' + t('Показать ещё') + '</button>';
    return html;
  }

  // ---------- нажатия ----------

  function onClick(e) {
    const w = e.target.closest('[data-water]');
    if (w) {
      e.stopPropagation();
      const total = store.addWater(Number(w.dataset.water));
      ui.haptic('light');
      if (Number(w.dataset.water) > 0) ui.toast(t('Вода: {0} за сегодня', fmtNum(total, 0) + ' ' + unitText('water', total)));
      return;
    }
    const o = e.target.closest('[data-open]');
    if (o) { openTracker(o.dataset.open); return; }
    const md = e.target.closest('[data-mode]');
    if (md) { mode = md.dataset.mode; anchor = new Date(); render(root); return; }
    const nav = e.target.closest('[data-nav]');
    if (nav && !nav.disabled) { shift(Number(nav.dataset.nav)); return; }
    const un = e.target.closest('[data-unit]');
    if (un) { store.setPref('wunit', un.dataset.unit); return; }
    const en1 = e.target.closest('[data-entry]');
    if (en1) { openForm(open, store.S.me[open].find((x) => x.t === Number(en1.dataset.entry))); return; }
    const hit = e.target.closest('[data-pt]');
    if (hit) { showTip(Number(hit.dataset.pt)); return; }
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const act = a.dataset.action;
    if (act === 'back') back();
    else if (act === 'add') openForm(open, null);
    else if (act === 'goal') openGoal();
    else if (act === 'more') { shown += 20; render(root); }
  }

  function showTip(i) {
    const p = buildPeriod(open);
    const pt = p.pts[i];
    const tip = root.querySelector('#trTip');
    if (!pt || !tip || pt.v === undefined) return;
    const v = open === 'pressure' ? Math.round(pt.v) + '/' + Math.round(pt.v2) + ' ' + t('мм рт. ст.') : full(open, { v: open === 'mood' ? Math.round(pt.v) : pt.v });
    tip.innerHTML = '<b>' + esc(pt.tip) + '</b> · ' + v + (mode === 'year' ? ' <span class="hint">(' + t('в среднем за день') + ')</span>' : '');
    tip.classList.add('show');
  }

  function shift(dir) {
    const a = anchor;
    if (mode === 'week') anchor = new Date(a.getFullYear(), a.getMonth(), a.getDate() + dir * 7);
    else if (mode === 'month') anchor = new Date(a.getFullYear(), a.getMonth() + dir, 1);
    else anchor = new Date(a.getFullYear() + dir, 0, 1);
    if (anchor > new Date()) anchor = new Date();
    render(root);
  }

  function openTracker(id) {
    if (!TR[id]) return;
    open = id; mode = 'week'; anchor = new Date(); shown = 20;
    window.scrollTo(0, 0);
    render(root);
    ui.haptic('light');
  }

  function back() {
    if (!open) return false;
    open = null;
    window.scrollTo(0, 0);
    render(root);
    return true;
  }

  // ---------- формы ----------

  function openGoal() {
    const pr = store.S.prefs;
    ui.openSheet({
      html:
        '<h3>' + t('Цель по весу') + '</h3>' +
        '<label class="field"><span>' + t('Желаемый вес, {0}', wUnit()) + '</span>' +
        '<input id="gIn" type="text" autocomplete="off" inputmode="decimal" value="' + (pr.wgoal ? Number(wShow(pr.wgoal).toFixed(1)) : '') + '"></label>' +
        '<div class="form-err" id="gErr"></div>' +
        '<div class="btn-col"><button class="btn btn-primary" id="gSave">' + t('Сохранить') + '</button>' +
        (pr.wgoal ? '<button class="btn btn-danger-ghost" id="gDel">' + t('Убрать цель') + '</button>' : '') +
        '<button class="btn btn-ghost" data-close>' + t('Отмена') + '</button></div>',
      onMount(el, api) {
        const inp = el.querySelector('#gIn');
        setTimeout(() => inp.focus(), 300);
        el.querySelector('#gSave').addEventListener('click', () => {
          const v = parseNum(inp.value);
          const kg = lb() ? v * PF.LB : v;
          if (!Number.isFinite(kg) || kg < 20 || kg > 400) { el.querySelector('#gErr').textContent = t('Значение вне допустимого диапазона.'); return; }
          store.setPref('wgoal', Math.round(kg * 100) / 100);
          api.close();
          ui.haptic('success');
        });
        const del = el.querySelector('#gDel');
        if (del) del.addEventListener('click', () => { store.setPref('wgoal', 0); api.close(); });
      },
    });
  }

  const parseNum = (s) => (String(s).trim() === '' ? NaN : Number(String(s).replace(',', '.').replace(/\s/g, '')));

  // Поля ввода для трекера.
  function fieldsHtml(id, e) {
    const num = (fid, label, val, step, mode2) => '<label class="field"><span>' + label + '</span><input id="' + fid + '" type="text" autocomplete="off" inputmode="' + (mode2 || 'decimal') + '" data-step="' + step + '" value="' + (val === undefined || val === null ? '' : val) + '"></label>';
    if (id === 'weight') return num('vIn', t('Вес, {0}', wUnit()), e ? Number(wShow(e.v).toFixed(1)) : (last('weight') ? Number(wShow(last('weight').v).toFixed(1)) : ''), 0.1);
    if (id === 'pressure') {
      return '<div class="field-row">' + num('vIn', t('Верхнее'), e ? e.v : '', 1, 'numeric') + num('v2In', t('Нижнее'), e ? e.v2 : '', 1, 'numeric') + '</div>' +
        '<p class="note">' + t('мм рт. ст., например 120/80') + '</p>';
    }
    if (id === 'pulse') return num('vIn', t('Пульс, уд/мин'), e ? e.v : '', 1, 'numeric');
    if (id === 'sleep') {
      const m = e ? Math.round(e.v * 60) : 8 * 60;
      return '<div class="field-row">' + num('hIn', t('Часы'), Math.floor(m / 60), 1, 'numeric') + num('mIn', t('Минуты'), m % 60, 5, 'numeric') + '</div>';
    }
    if (id === 'water') return num('vIn', t('Стаканы (по 250 мл)'), e ? e.v : 1, 1, 'numeric');
    if (id === 'steps') return num('vIn', t('Шаги'), e ? e.v : '', 1, 'numeric');
    if (id === 'mood') {
      return '<div class="mood-pick">' + MOOD_NAMES.map((m, i) => '<button type="button" class="mood-opt' + (e && e.v === i + 1 ? ' on' : '') + '" data-mood="' + (i + 1) + '">' +
        moodFace(i + 1, 'big') + '<span>' + t(m) + '</span></button>').join('') + '</div>' +
        '<div class="field"><span>' + t('Что ты чувствуешь? (можно несколько)') + '</span><div class="feel-pick">' +
        FEELINGS.map((f, i) => '<button type="button" class="feel-chip pick' + (i >= 6 ? ' sad' : '') + (e && e.v2 & (1 << i) ? ' on' : '') + '" data-feel="' + i + '">' + t(f) + '</button>').join('') +
        '</div></div>';
    }
    return '';
  }

  function openForm(id, e) {
    const isEdit = !!e;
    const tm = e ? e.t : u.nowSec();
    const now = u.nowSec();
    ui.openSheet({
      html:
        '<h3>' + t(TR[id].name) + ' · ' + t(isEdit ? 'Изменить запись' : 'Новая запись') + '</h3>' +
        fieldsHtml(id, e) +
        '<div class="field-row">' +
        '<label class="field"><span>' + t('Дата') + '</span><input type="date" id="fDate" value="' + u.dayKey(tm) + '" max="' + u.dayKey(now) + '"></label>' +
        '<label class="field"><span>' + t('Время') + '</span><input type="time" id="fTime" value="' + u.hm(tm) + '"></label></div>' +
        '<div class="form-err" id="fErr"></div>' +
        '<div class="btn-col"><button class="btn btn-primary" id="fSave">' + t('Сохранить') + '</button>' +
        (isEdit ? '<button class="btn btn-danger-ghost" id="fDel">' + ui.icon('trash') + t('Удалить запись') + '</button>' : '') +
        '<button class="btn btn-ghost" data-close>' + t('Отмена') + '</button></div>',
      onMount(el, api) {
        const $ = (s) => el.querySelector(s);
        let mood = e && id === 'mood' ? e.v : null;
        let feel = e && id === 'mood' ? (e.v2 || 0) : 0;
        el.querySelectorAll('[data-feel]').forEach((b) => b.addEventListener('click', () => {
          feel ^= 1 << Number(b.dataset.feel);
          b.classList.toggle('on', !!(feel & (1 << Number(b.dataset.feel))));
        }));
        el.querySelectorAll('[data-mood]').forEach((b) => b.addEventListener('click', () => {
          mood = Number(b.dataset.mood);
          el.querySelectorAll('[data-mood]').forEach((x) => x.classList.toggle('on', x === b));
        }));
        const first = $('#vIn') || $('#hIn');
        if (first && !isEdit) setTimeout(() => { first.focus(); first.select(); }, 300);
        $('#fSave').addEventListener('click', () => {
          const entry = { t: u.fromInputs($('#fDate').value, $('#fTime').value) };
          if (id === 'mood') {
            if (!mood) { $('#fErr').textContent = t('Выберите настроение.'); return; }
            entry.v = mood;
            if (feel) entry.v2 = feel;
          } else if (id === 'sleep') {
            const h = parseNum($('#hIn').value), m = parseNum($('#mIn').value || '0');
            entry.v = Number.isFinite(h) && Number.isFinite(m) && m >= 0 && m < 60 ? h + m / 60 : NaN;
          } else {
            const v = parseNum($('#vIn').value);
            entry.v = id === 'weight' && lb() ? v * PF.LB : v;
            if (id === 'pressure') entry.v2 = parseNum($('#v2In').value);
          }
          if (Number.isFinite(entry.t) && entry.t > now + 60) entry.t = now;
          const err = isEdit ? store.updateMe(id, e.t, entry) : store.addMe(id, entry);
          if (err) { $('#fErr').textContent = err; ui.haptic('error'); return; }
          ui.haptic('success');
          api.close();
          ui.toast(t(isEdit ? 'Запись изменена' : 'Запись добавлена'));
        });
        const del = $('#fDel');
        if (del) del.addEventListener('click', async () => {
          const ok = await ui.confirm(t('Удалить эту запись?'), t('Удалить'), true);
          if (!ok) return;
          store.removeMe(id, e.t);
          api.close();
          ui.toast(t('Запись удалена'));
        });
      },
    });
  }

  PF.screens = PF.screens || {};
  PF.screens.me = {
    render,
    back,
    canBack: () => !!open,
    reset() { open = null; },
  };
})(window.PF);
