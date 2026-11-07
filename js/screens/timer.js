// Вкладка «Таймер»: текущее занятие, кнопки старта, история, ручные записи.
(function (PF) {
  'use strict';

  const u = PF.u;
  const ui = PF.ui;
  const store = PF.store;
  const ACTS = PF.ACTS;
  const esc = u.esc;

  const PAGE_DAYS = 14;
  let daysShown = PAGE_DAYS;
  let root = null;
  let lastBalance = null;

  // ---------- отрисовка ----------

  function render(el) {
    root = el;
    root.innerHTML =
      '<header class="top top-row"><h1>Таймер</h1>' +
      '  <button class="balance" id="balance" data-action="rates"></button></header>' +
      '<section id="current"></section>' +
      '<section class="acts" id="acts"></section>' +
      '<section class="hist">' +
      '  <div class="sec-head"><h2>История</h2>' +
      '    <button class="btn-small" data-action="add">' + ui.icon('plus') + 'Запись</button></div>' +
      '  <div id="days"></div>' +
      '</section>';
    root.onclick = onClick;
    renderBalance();
    renderCurrent();
    renderActs();
    renderHistory();
  }

  function renderBalance() {
    const el = root.querySelector('#balance');
    const b = store.balance();
    lastBalance = Math.round(b);
    el.innerHTML = ui.coin() + '<span>' + u.coins(b) + '</span>';
    el.classList.toggle('neg', Math.round(b) < 0);
  }

  function sessionCoinsText() {
    const a = store.S.active;
    const c = store.activeCoins();
    return (ACTS[a.a].rate > 0 ? 'Заработано: ' : 'Потрачено: ') + u.coins(Math.abs(c)) + ' мон.';
  }

  function renderCurrent() {
    const box = root.querySelector('#current');
    const a = store.S.active;
    if (!a) {
      box.innerHTML =
        '<div class="card current idle"><div class="cur-body">' +
        '<div class="cur-idle">Сейчас ничего не идёт</div>' +
        '<div class="hint">Нажмите на занятие, чтобы начать</div></div>' + charHtml() + '</div>';
      return;
    }
    const act = ACTS[a.a];
    box.innerHTML =
      '<div class="card current" style="--c:' + act.color + '">' +
      '<div class="cur-row"><div class="cur-body">' +
      '  <div class="cur-top"><span class="dot"></span><span class="cur-name">' + act.name + '</span>' +
      '    <span class="cur-since">с ' + u.hm(a.s) +
      (u.dayKey(a.s) !== u.dayKey(u.nowSec()) ? ', ' + u.shortDate(a.s) : '') + '</span></div>' +
      (a.t ? '<div class="cur-task">' + esc(a.t) + '</div>' : '') +
      '  <div class="cur-time" id="curTime">' + u.durClock(u.nowSec() - a.s) + '</div>' +
      '  <div class="cur-coins" id="curCoins">' + ui.coin() + '<span>' + sessionCoinsText() + '</span></div>' +
      '</div>' + charHtml() + '</div>' +
      '  <button class="btn btn-stop" data-action="stop">' + ui.icon('stop') + 'Завершить</button>' +
      '</div>';
  }

  // Маленький персонаж на главном экране (нажатие открывает вкладку «Персонаж»).
  function charHtml() {
    return '<button class="cur-char" data-action="char" aria-label="Персонаж">' + PF.char.svg(store.look(), 96) + '</button>';
  }

  function renderActs() {
    const box = root.querySelector('#acts');
    const active = store.S.active;
    box.innerHTML = PF.ACT_ORDER.map((k) => {
      const act = ACTS[k];
      const on = active && active.a === k;
      return '<button class="act-btn' + (on ? ' on' : '') + '" style="--c:' + act.color + '" data-action="start" data-a="' + k + '">' +
        '<span class="act-ic">' + ui.icon(act.icon) + '</span>' +
        '<span class="act-name">' + act.name + '</span>' +
        '<span class="act-sub">' + (on ? 'идёт' : 'начать') + '</span></button>';
    }).join('');
  }

  function renderHistory() {
    const box = root.querySelector('#days');
    const all = store.days();
    if (!all.length) {
      box.innerHTML = '<div class="empty">Записей пока нет. Начните занятие или добавьте запись вручную.</div>';
      return;
    }
    const list = all.slice(0, daysShown);
    let html = list.map((d) => {
      const chips = PF.ACT_ORDER.filter((k) => d.totals[k] > 0).map((k) =>
        '<span class="chip"><i style="background:' + ACTS[k].color + '"></i>' + u.durShort(d.totals[k]) + '</span>').join('');
      const rows = d.recs.map(recRow).join('');
      const dayCoins = d.recs.reduce((sum, r) => sum + store.recCoins(r), 0);
      const coinsChip = '<span class="chip coins-chip' + (Math.round(dayCoins) < 0 ? ' neg' : '') + '">' +
        ui.coin() + u.coins(dayCoins, true) + '</span>';
      return '<div class="day"><div class="day-head"><span class="day-title">' + u.dayTitle(d.key) + '</span>' +
        '<span class="chips">' + chips + coinsChip + '</span></div><div class="card list">' + rows + '</div></div>';
    }).join('');
    if (all.length > daysShown) {
      html += '<button class="btn btn-ghost more" data-action="more">Показать ещё</button>';
    }
    box.innerHTML = html;
  }

  function recRow(r) {
    const act = ACTS[r.a];
    const c = store.recCoins(r);
    let range = u.hm(r.s) + ' – ' + u.hm(r.e);
    if (u.dayKey(r.e) !== u.dayKey(r.s)) range += ', ' + u.shortDate(r.e);
    return '<button class="rec" data-action="edit" data-id="' + esc(r.id) + '">' +
      '<span class="bar" style="background:' + act.color + '"></span>' +
      '<span class="rec-main"><span class="rec-name">' + act.name +
      (r.t ? '<span class="rec-task"> — ' + esc(r.t) + '</span>' : '') + '</span>' +
      '<span class="rec-time">' + range + '</span></span>' +
      '<span class="rec-right"><span class="rec-dur">' + u.durShort(r.e - r.s) + '</span>' +
      '<span class="rec-coins' + (Math.round(c) < 0 ? ' neg' : '') + '">' + u.coins(c, true) + '</span></span></button>';
  }

  // Вызывается каждую секунду, пока открыта вкладка.
  function tick() {
    if (!root) return;
    const el = root.querySelector('#curTime');
    const a = store.S.active;
    if (el && a) el.textContent = u.durClock(u.nowSec() - a.s);
    // Монеты за текущее занятие и баланс меняются раз в минуту.
    const bal = Math.round(store.balance());
    if (bal !== lastBalance) {
      lastBalance = bal;
      renderBalance();
      const cc = root.querySelector('#curCoins span');
      if (cc && a) cc.textContent = sessionCoinsText();
    }
  }

  // ---------- нажатия ----------

  function onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'start') {
      const k = btn.dataset.a;
      if (store.S.active && store.S.active.a === k) { doStop(); return; }
      const res = store.start(k);
      ui.haptic('medium');
      if (res.short) ui.toast('Предыдущее занятие было короче минуты и не сохранено');
    } else if (action === 'stop') {
      doStop();
    } else if (action === 'add') {
      openForm(null);
    } else if (action === 'edit') {
      const r = store.S.records.find((x) => x.id === btn.dataset.id);
      if (r) openForm(r);
    } else if (action === 'char') {
      if (PF.app) PF.app.switchTab('char');
    } else if (action === 'rates') {
      openRates();
    } else if (action === 'more') {
      daysShown += PAGE_DAYS;
      renderHistory();
    }
  }

  function doStop() {
    const res = store.stop();
    ui.haptic('light');
    if (res.short) ui.toast('Занятие было короче минуты и не сохранено');
    else if (res.rec) ui.toast(recordedText(res.rec));
  }

  function recordedText(r) {
    return 'Записано: ' + ACTS[r.a].name + ', ' + u.durShort(r.e - r.s) + ' (' + u.coins(store.recCoins(r), true) + ' мон.)';
  }

  // ---------- как начисляются монеты ----------

  function openRates() {
    const rate = (k) => {
      const r = ACTS[k].rate;
      return (r > 0 ? '+' : '−') + String(Math.abs(r)).replace('.', ',');
    };
    const rows = PF.ACT_ORDER.map((k) =>
      '<div class="rate-row"><span class="rate-ic" style="--c:' + ACTS[k].color + '">' + ui.icon(ACTS[k].icon) + '</span>' +
      '<span class="rate-name">' + ACTS[k].name + '</span>' +
      '<b class="' + (ACTS[k].rate < 0 ? 'neg' : 'pos') + '">' + rate(k) + ' в минуту</b></div>').join('');
    const b = store.balance();
    ui.openSheet({
      html:
        '<h3>Монеты</h3>' +
        '<div class="rate-balance' + (Math.round(b) < 0 ? ' neg' : '') + '">' + ui.coin('big') + u.coins(b) + '</div>' +
        '<div class="card list rates">' + rows + '</div>' +
        '<p class="note">Монеты считаются от времени начала занятия, поэтому начисляются и при закрытом Telegram. ' +
        'Изменение и удаление записей сразу пересчитывает баланс. Баланс может уйти в минус — тогда в магазине ничего не купить.</p>' +
        '<div class="btn-col"><button class="btn btn-ghost" data-close>Понятно</button></div>',
    });
  }

  // ---------- форма записи ----------

  function openForm(rec) {
    const isEdit = !!rec;
    const now = u.nowSec();
    let a, date, ts, te;
    if (isEdit) {
      a = rec.a;
      date = u.dayKey(rec.s);
      ts = u.hm(rec.s);
      te = u.hm(rec.e);
    } else {
      // По умолчанию: последний час до сейчас (или до начала текущего занятия).
      const end = store.S.active ? store.S.active.s : now;
      const endMin = end - (end % 60);
      a = 'work';
      date = u.dayKey(endMin - 3600);
      ts = u.hm(endMin - 3600);
      te = u.hm(endMin);
    }
    const tooLong = isEdit && rec.e - rec.s > 24 * 3600;

    const seg = PF.ACT_ORDER.map((k) =>
      '<button type="button" class="seg-btn' + (k === a ? ' on' : '') + '" style="--c:' + ACTS[k].color + '" data-a="' + k + '">' +
      ACTS[k].name + '</button>').join('');

    ui.openSheet({
      html:
        '<h3>' + (isEdit ? 'Изменить запись' : 'Новая запись') + '</h3>' +
        (isEdit && rec.t ? '<div class="form-task">Задача: ' + esc(rec.t) + '</div>' : '') +
        '<div class="seg">' + seg + '</div>' +
        '<label class="field"><span>Дата</span><input type="date" id="fDate" value="' + date + '" max="' + u.dayKey(now) + '"></label>' +
        '<div class="field-row">' +
        '  <label class="field"><span>Начало</span><input type="time" id="fStart" value="' + ts + '"></label>' +
        '  <label class="field"><span>Конец</span><input type="time" id="fEnd" value="' + te + '"></label>' +
        '</div>' +
        '<div class="form-info" id="fInfo"></div>' +
        '<div class="form-err" id="fErr"></div>' +
        (tooLong ? '<div class="form-err">Эта запись длиннее суток, её нельзя изменить в форме — только удалить.</div>' : '') +
        '<div class="btn-col">' +
        (tooLong ? '' : '<button class="btn btn-primary" id="fSave">Сохранить</button>') +
        (isEdit ? '<button class="btn btn-danger-ghost" id="fDel">' + ui.icon('trash') + 'Удалить запись</button>' : '') +
        '<button class="btn btn-ghost" data-close>Отмена</button></div>',
      onMount(el, api) {
        let cur = a;
        const $ = (s) => el.querySelector(s);

        function read() {
          const s = u.fromInputs($('#fDate').value, $('#fStart').value);
          let e = u.fromInputs($('#fDate').value, $('#fEnd').value);
          // Конец раньше начала — значит, занятие закончилось на следующий день.
          if (Number.isFinite(s) && Number.isFinite(e) && e <= s) {
            e = u.fromInputs(u.addDays($('#fDate').value, 1), $('#fEnd').value);
          }
          return { a: cur, s, e };
        }

        function info() {
          const r = read();
          $('#fErr').textContent = '';
          if (!Number.isFinite(r.s) || !Number.isFinite(r.e)) { $('#fInfo').textContent = ''; return; }
          let t = 'Длительность: ' + u.durShort(r.e - r.s) + ' · ' +
            u.coins(store.recCoins(r), true) + ' мон.';
          if (u.dayKey(r.e) !== u.dayKey(r.s)) t += ' · закончится на следующий день';
          $('#fInfo').textContent = t;
        }

        el.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
          cur = b.dataset.a;
          el.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('on', x === b));
        }));
        ['#fDate', '#fStart', '#fEnd'].forEach((s) => $(s).addEventListener('input', info));
        info();

        const save = $('#fSave');
        if (save) save.addEventListener('click', () => {
          const r = read();
          const err = isEdit ? store.update(rec.id, r) : store.add(r);
          if (err) { $('#fErr').textContent = err; ui.haptic('error'); return; }
          ui.haptic('success');
          api.close();
          ui.toast(isEdit ? 'Запись изменена' : 'Запись добавлена');
        });

        const del = $('#fDel');
        if (del) del.addEventListener('click', async () => {
          const ok = await ui.confirm('Удалить эту запись?', 'Удалить', true);
          if (!ok) return;
          store.remove(rec.id);
          api.close();
          ui.toast('Запись удалена');
        });
      },
    });
  }

  // ---------- «Ты всё ещё занимаешься этим?» ----------

  let askOpen = false;

  function askStill() {
    const a = store.S.active;
    if (!a || askOpen) return;
    askOpen = true;
    const act = ACTS[a.a];
    const now = u.nowSec();
    ui.haptic('warning');
    ui.openSheet({
      dismissible: false,
      html:
        '<h3>Ты всё ещё занимаешься этим?</h3>' +
        '<p class="sheet-text"><b style="color:' + act.color + '">' + act.name + '</b>' +
        (a.t ? ' — ' + esc(a.t) : '') + ' идёт уже ' + u.durShort(now - a.s) +
        ' (с ' + u.hm(a.s) + (u.dayKey(a.s) !== u.dayKey(now) ? ', ' + u.shortDate(a.s) : '') + ').</p>' +
        '<div class="btn-col" id="askBtns">' +
        '  <button class="btn btn-primary" id="askYes">Да, продолжаю</button>' +
        '  <button class="btn btn-ghost" id="askNo">Нет, я уже закончил</button></div>' +
        '<div id="askEnd" hidden>' +
        '  <label class="field"><span>Когда закончил?</span>' +
        '    <input type="datetime-local" id="askTime" min="' + u.dateTimeInput(a.s) + '" max="' + u.dateTimeInput(now) + '" ' +
        '      value="' + u.dateTimeInput(Math.min(now, a.s + store.ASK_FIRST)) + '"></label>' +
        '  <div class="form-err" id="askErr"></div>' +
        '  <div class="btn-col"><button class="btn btn-primary" id="askSave">Сохранить</button>' +
        '  <button class="btn btn-ghost" id="askBack">Назад</button></div>' +
        '</div>',
      onClose() { askOpen = false; },
      onMount(el, api) {
        const $ = (s) => el.querySelector(s);
        $('#askYes').addEventListener('click', () => {
          store.confirmStill();
          api.close();
          ui.toast('Хорошо, спрошу снова через 2 часа');
        });
        $('#askNo').addEventListener('click', () => {
          $('#askBtns').hidden = true;
          $('#askEnd').hidden = false;
        });
        $('#askBack').addEventListener('click', () => {
          $('#askBtns').hidden = false;
          $('#askEnd').hidden = true;
        });
        $('#askSave').addEventListener('click', () => {
          const v = $('#askTime').value;
          if (!v) { $('#askErr').textContent = 'Укажите время окончания.'; return; }
          const [d, t] = v.split('T');
          const end = u.fromInputs(d, t);
          const cur = store.S.active;
          if (!cur) { api.close(); return; }
          if (!Number.isFinite(end) || end <= cur.s) { $('#askErr').textContent = 'Время окончания должно быть позже начала.'; return; }
          if (end > u.nowSec()) { $('#askErr').textContent = 'Время окончания не может быть в будущем.'; return; }
          const res = store.stop(end);
          api.close();
          if (res.short) ui.toast('Занятие было короче минуты и не сохранено');
          else if (res.rec) ui.toast(recordedText(res.rec));
        });
      },
    });
  }

  PF.screens = PF.screens || {};
  PF.screens.timer = {
    title: 'Таймер',
    render,
    tick,
    reset() { daysShown = PAGE_DAYS; },
  };
  PF.askStill = askStill;
  PF.openRates = openRates;
})(window.PF);
