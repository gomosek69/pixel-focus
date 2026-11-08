// Вкладка «Таймер»: текущее занятие, кнопки старта, история, ручные записи.
(function (PF) {
  'use strict';

  const u = PF.u;
  const ui = PF.ui;
  const store = PF.store;
  const ACTS = PF.ACTS;
  const esc = u.esc;
  const t = PF.t;
  const actName = (k) => esc(PF.actName(k)); // для HTML
  const actText = (k) => PF.actName(k);      // для подсказок (обычный текст)

  const PAGE_DAYS = 14;
  let daysShown = PAGE_DAYS;
  let root = null;
  let lastBalance = null;
  let lastActiveKey = null; // чтобы анимировать карточку только при смене занятия

  // ---------- отрисовка ----------

  function render(el) {
    root = el;
    root.innerHTML =
      '<div class="greet-line">' + esc(PF.greet.short()) + '</div>' +
      '<header class="top top-row"><h1>' + t('Таймер') + '</h1>' +
      '  <button class="balance" id="balance" data-action="rates"></button></header>' +
      '<section id="current"></section>' +
      '<div class="sec-head acts-head"><h2>' + t('Занятия') + '</h2>' +
      '  <button class="btn-small" data-action="acts">' + ui.icon('gear') + t('Настроить') + '</button></div>' +
      '<section class="acts" id="acts"></section>' +
      '<section class="hist">' +
      '  <div class="sec-head"><h2>' + t('История') + '</h2>' +
      '    <button class="btn-small" data-action="add">' + ui.icon('plus') + t('Запись') + '</button></div>' +
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
    return t(store.rateOf(a) >= 0 ? 'Заработано: {0} мон.' : 'Потрачено: {0} мон.', u.coins(Math.abs(c)));
  }

  function sinceText(s) {
    return u.hm(s) + (u.dayKey(s) !== u.dayKey(u.nowSec()) ? ', ' + u.shortDate(s) : '');
  }

  function renderCurrent() {
    const box = root.querySelector('#current');
    const a = store.S.active;
    const key = a ? a.a + a.s : 'none';
    const changedActive = lastActiveKey !== null && key !== lastActiveKey;
    lastActiveKey = key;
    const enter = changedActive ? (a ? ' enter-start' : ' enter-stop') : '';
    if (!a) {
      box.innerHTML =
        '<div class="card current idle' + enter + '"><div class="cur-body">' +
        '<div class="cur-idle">' + t('Сейчас ничего не идёт') + '</div>' +
        '<div class="hint">' + t('Нажмите на занятие, чтобы начать') + '</div></div>' + charHtml() + '</div>';
      return;
    }
    const act = ACTS[a.a];
    box.innerHTML =
      '<div class="card current' + enter + '" style="--c:' + act.color + '">' +
      '<div class="cur-row"><div class="cur-body">' +
      '  <div class="cur-top"><span class="dot"></span><span class="cur-name">' + actName(a.a) + '</span>' +
      '    <span class="cur-since">' + t('с {0}', sinceText(a.s)) + '</span></div>' +
      (a.t ? '<div class="cur-task">' + esc(a.t) + '</div>' : '') +
      '  <div class="cur-time" id="curTime">' + u.durClock(u.nowSec() - a.s) + '</div>' +
      '  <div class="cur-coins" id="curCoins">' + ui.coin() + '<span>' + sessionCoinsText() + '</span></div>' +
      '</div>' + charHtml() + '</div>' +
      '  <button class="btn btn-stop" data-action="stop">' + ui.icon('stop') + t('Завершить') + '</button>' +
      '</div>';
  }

  // Маленький персонаж на главном экране (нажатие открывает вкладку «Персонаж»).
  function charHtml() {
    return '<button class="cur-char" data-action="char" aria-label="' + t('Персонаж') + '">' +
      PF.char.svg(store.look(), 128) + '</button>';
  }

  function renderActs() {
    const box = root.querySelector('#acts');
    const active = store.S.active;
    const btn = (k, small) => {
      const act = ACTS[k];
      const on = active && active.a === k;
      return '<button class="act-btn' + (small ? ' small' : '') + (on ? ' on' : '') + '" style="--c:' + act.color + '" data-action="start" data-a="' + k + '">' +
        '<span class="act-ic">' + ui.icon(act.icon) + '</span>' +
        '<span class="act-name">' + actName(k) + '</span>' +
        '<span class="act-sub">' + (small ? (on ? t('идёт') : u.rate(act.rate)) : t(on ? 'идёт' : 'начать')) + '</span></button>';
    };
    const custom = PF.ACT_ORDER.filter((k) => ACTS[k].custom);
    const canAdd = custom.length < PF.CUSTOM_MAX;
    box.innerHTML = PF.BASE_ACTS.map((k) => btn(k, false)).join('') +
      '<div class="acts-custom">' + custom.map((k) => btn(k, true)).join('') +
      (canAdd ? '<button class="act-add" data-action="newact" aria-label="' + esc(t('Новое занятие')) + '">' +
        ui.icon('plus') + '<span>' + t('Своё занятие') + '</span></button>' : '') +
      '</div>';
  }

  function renderHistory() {
    const box = root.querySelector('#days');
    const all = store.days();
    if (!all.length) {
      box.innerHTML = '<div class="empty">' + t('Записей пока нет. Начните занятие или добавьте запись вручную.') + '</div>';
      return;
    }
    const list = all.slice(0, daysShown);
    let html = list.map((d) => {
      const chips = store.allActs().filter((k) => d.totals[k] > 0).map((k) =>
        '<span class="chip"><i style="background:' + ACTS[k].color + '"></i>' + u.durShort(d.totals[k]) + '</span>').join('');
      const rows = d.recs.map(recRow).join('');
      const dayCoins = d.recs.reduce((sum, r) => sum + store.recCoins(r), 0);
      const coinsChip = '<span class="chip coins-chip' + (Math.round(dayCoins) < 0 ? ' neg' : '') + '">' +
        ui.coin() + u.coins(dayCoins, true) + '</span>';
      return '<div class="day"><div class="day-head"><span class="day-title">' + u.dayTitle(d.key) + '</span>' +
        '<span class="chips">' + chips + coinsChip + '</span></div><div class="card list">' + rows + '</div></div>';
    }).join('');
    if (all.length > daysShown) {
      html += '<button class="btn btn-ghost more" data-action="more">' + t('Показать ещё') + '</button>';
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
      '<span class="rec-main"><span class="rec-name">' + actName(r.a) +
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
      const be = root.querySelector('#balance');
      be.classList.remove('bump'); void be.offsetWidth; be.classList.add('bump');
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
      // Запомнить, где нажали, чтобы волна пошла от пальца.
      const br = btn.getBoundingClientRect();
      const px = (e.clientX || br.left + br.width / 2) - br.left;
      const py = (e.clientY || br.top + br.height / 2) - br.top;
      const res = store.start(k); // экран перерисуется
      startEffects(k, px, py, br);
      ui.haptic('medium');
      if (res.short) ui.toast(t('Предыдущее занятие было короче минуты и не сохранено'));
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
    } else if (action === 'acts') {
      openActs();
    } else if (action === 'newact') {
      openActForm(null);
    } else if (action === 'more') {
      daysShown += PAGE_DAYS;
      renderHistory();
    }
  }

  // Волна цвета по кнопке, прыжок иконки, заливка карточки из точки нажатия.
  function startEffects(k, px, py, oldRect) {
    const b = root.querySelector('.act-btn[data-a="' + k + '"]');
    if (b) {
      const size = Math.max(b.offsetWidth, b.offsetHeight) * 2.6;
      const rp = document.createElement('span');
      rp.className = 'ripple';
      rp.style.width = rp.style.height = size + 'px';
      rp.style.left = (px - size / 2) + 'px';
      rp.style.top = (py - size / 2) + 'px';
      b.prepend(rp);
      b.classList.add('started');
      setTimeout(() => rp.remove(), 1200);
    }
    const card = root.querySelector('.current');
    if (card) {
      const cr = card.getBoundingClientRect();
      const x = ((oldRect.left + px) - cr.left) / cr.width * 100;
      const y = ((oldRect.top + py) - cr.top) / cr.height * 100;
      card.style.setProperty('--rx', Math.round(x) + '%');
      card.style.setProperty('--ry', Math.round(y) + '%');
    }
  }

  function doStop() {
    const res = store.stop();
    if (res.rec) ui.floatCoins(store.recCoins(res.rec));
    ui.haptic('light');
    if (res.short) ui.toast(t('Занятие было короче минуты и не сохранено'));
    else if (res.rec) ui.toast(recordedText(res.rec));
  }

  function recordedText(r) {
    return t('Записано: {0}, {1} ({2} мон.)', actText(r.a), u.durShort(r.e - r.s), u.coins(store.recCoins(r), true));
  }

  // ---------- как начисляются монеты ----------

  function openRates() {
    const rate = (k) => u.rate(ACTS[k].rate);
    const rows = PF.ACT_ORDER.map((k) =>
      '<div class="rate-row"><span class="rate-ic" style="--c:' + ACTS[k].color + '">' + ui.icon(ACTS[k].icon) + '</span>' +
      '<span class="rate-name">' + actName(k) + '</span>' +
      '<b class="' + (ACTS[k].rate < 0 ? 'neg' : 'pos') + '">' + t('{0} в минуту', rate(k)) + '</b></div>').join('');
    const b = store.balance();
    ui.openSheet({
      html:
        '<h3>' + t('Монеты') + '</h3>' +
        '<div class="rate-balance' + (Math.round(b) < 0 ? ' neg' : '') + '">' + ui.coin('big') + u.coins(b) + '</div>' +
        '<div class="card list rates">' + rows + '</div>' +
        '<p class="note">' + t('Монеты считаются от времени начала занятия, поэтому начисляются и при закрытом Telegram. Изменение и удаление записей сразу пересчитывает баланс. Баланс может уйти в минус — тогда в магазине ничего не купить.') + '</p>' +
        '<div class="btn-col"><button class="btn btn-primary" id="rtActs">' + ui.icon('gear') + t('Мои занятия и цены') + '</button>' +
        '<button class="btn btn-ghost" data-close>' + t('Понятно') + '</button></div>',
      onMount(el, api) {
        el.querySelector('#rtActs').addEventListener('click', () => { api.close(); openActs(); });
      },
    });
  }

  // ---------- мои занятия: список, цены, создание ----------

  function openActs() {
    ui.openSheet({
      html: '<h3>' + t('Мои занятия') + '</h3><div id="actsBody"></div>',
      onMount(el, api) {
        const body = el.querySelector('#actsBody');
        const draw = () => {
          const custom = store.visibleCustom();
          const row = (k) => {
            const act = ACTS[k];
            const locked = !act.custom;
            return '<div class="rate-row act-row' + (locked ? ' locked' : '') + '" data-k="' + k + '">' +
              '<button class="act-row-main" data-edit="' + k + '"><span class="rate-ic" style="--c:' + act.color + '">' + ui.icon(act.icon) + '</span>' +
              '<span class="rate-name">' + actName(k) + '</span></button>' +
              (locked
                ? '<span class="lock-rate"><b class="' + (act.rate < 0 ? 'neg' : 'pos') + '">' + u.rate(act.rate) + '</b>' + ui.icon('lock') + '</span>'
                : '<span class="stepper"><button class="step" data-step="-1" data-k="' + k + '" aria-label="−0,1"' + (act.rate <= PF.RATE_MIN ? ' disabled' : '') + '>' + ui.icon('minus') + '</button>' +
                  '<b class="' + (act.rate < 0 ? 'neg' : act.rate > 0 ? 'pos' : '') + '">' + u.rate(act.rate) + '</b>' +
                  '<button class="step" data-step="1" data-k="' + k + '" aria-label="+0,1"' + (act.rate >= PF.RATE_MAX ? ' disabled' : '') + '>' + ui.icon('plus') + '</button></span>') +
              '</div>';
          };
          body.innerHTML =
            '<p class="sheet-text">' + t('Цена — сколько монет в минуту даёт (+) или забирает (−) занятие. Цены основных занятий менять нельзя.') + '</p>' +
            '<div class="card list rates">' + PF.ACT_ORDER.map(row).join('') + '</div>' +
            (custom.length ? '<p class="note">' + t('Новая цена действует для новых записей. Уже записанное время не пересчитывается.') + '</p>' : '') +
            '<div class="btn-col">' +
            (custom.length < PF.CUSTOM_MAX
              ? '<button class="btn btn-primary" id="actNew">' + ui.icon('plus') + t('Новое занятие') + '</button>'
              : '<p class="note center">' + t('Создано максимум своих занятий ({0}).', PF.CUSTOM_MAX) + '</p>') +
            '<button class="btn btn-ghost" data-close>' + t('Готово') + '</button></div>';
        };
        draw();
        body.addEventListener('click', (e) => {
          const step = e.target.closest('[data-step]');
          if (step) {
            const x = ACTS[step.dataset.k];
            if (!x || !x.custom) return;
            const err = store.updateAct(step.dataset.k, { rate: x.rate + Number(step.dataset.step) * 0.1 });
            if (err) ui.toast(err);
            ui.haptic('light');
            draw();
            return;
          }
          const ed = e.target.closest('[data-edit]');
          if (ed) {
            const k = ed.dataset.edit;
            if (!ACTS[k].custom) { ui.toast(t('Цены основных занятий менять нельзя')); ui.haptic('warning'); return; }
            openActForm(k, draw);
            return;
          }
          if (e.target.closest('#actNew')) openActForm(null, draw);
        });
        void api;
      },
    });
  }

  // Создание и изменение своего занятия: название, цена, цвет, значок.
  function openActForm(id, after) {
    const x = id ? store.visibleCustom().find((a) => a.id === id) : null;
    if (id && !x) return;
    if (!x && store.visibleCustom().length >= PF.CUSTOM_MAX) {
      ui.toast(t('Можно создать не больше {0} своих занятий.', PF.CUSTOM_MAX));
      return;
    }
    let color = x ? x.color : store.nextColor();
    let icon = x ? x.icon : 'star';
    let rate = x ? x.rate : 0.5;
    ui.openSheet({
      html:
        '<h3>' + t(x ? 'Изменить занятие' : 'Новое занятие') + '</h3>' +
        '<div class="act-preview" id="afPrev"></div>' +
        '<label class="field"><span>' + t('Название') + '</span><input id="afName" maxlength="24" value="' + esc(x ? x.name : '') + '" placeholder="' + esc(t('Например, Спорт')) + '"></label>' +
        '<div class="field"><span>' + t('Цена в минуту') + '</span>' +
        '  <div class="rate-pick"><button type="button" class="step" data-rs="-1">' + ui.icon('minus') + '</button>' +
        '  <input type="range" id="afRate" min="' + PF.RATE_MIN + '" max="' + PF.RATE_MAX + '" step="0.1" value="' + rate + '">' +
        '  <button type="button" class="step" data-rs="1">' + ui.icon('plus') + '</button></div>' +
        '  <div class="rate-hint" id="afRateHint"></div></div>' +
        '<div class="field"><span>' + t('Цвет') + '</span><div class="swatches" id="afColors">' +
        PF.ACT_COLORS.map((c) => '<button type="button" class="swatch" style="--sw:' + c + '" data-color="' + c + '" aria-label="' + c + '"></button>').join('') +
        '</div></div>' +
        '<div class="field"><span>' + t('Значок') + '</span><div class="icon-pick" id="afIcons">' +
        PF.ACT_ICONS.map((ic) => '<button type="button" class="icon-opt" data-icon="' + ic + '">' + ui.icon(ic) + '</button>').join('') +
        '</div></div>' +
        (x ? '<p class="note">' + t('Новая цена действует для новых записей. Уже записанное время не пересчитывается.') + '</p>' : '') +
        '<div class="form-err" id="afErr"></div>' +
        '<div class="btn-col"><button class="btn btn-primary" id="afSave">' + t(x ? 'Сохранить' : 'Создать') + '</button>' +
        (x ? '<button class="btn btn-danger-ghost" id="afDel">' + ui.icon('trash') + t('Удалить занятие') + '</button>' : '') +
        '<button class="btn btn-ghost" data-close>' + t('Отмена') + '</button></div>',
      onMount(el, api) {
        const $ = (s) => el.querySelector(s);
        const sync = () => {
          rate = Math.round(Number($('#afRate').value) * 10) / 10;
          const name = $('#afName').value.trim() || t('Своё занятие');
          $('#afPrev').innerHTML = '<span class="act-btn small on" style="--c:' + color + '"><span class="act-ic">' + ui.icon(icon) + '</span>' +
            '<span class="act-name">' + esc(name) + '</span><span class="act-sub">' + u.rate(rate) + '</span></span>';
          const hint = $('#afRateHint');
          hint.className = 'rate-hint ' + (rate > 0 ? 'pos' : rate < 0 ? 'neg' : '');
          hint.textContent = rate > 0 ? t('+{0} мон. за час', u.coins(rate * 60)) : rate < 0 ? t('−{0} мон. за час', u.coins(-rate * 60)) : t('Без монет');
          el.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', b.dataset.color === color));
          el.querySelectorAll('[data-icon]').forEach((b) => b.classList.toggle('on', b.dataset.icon === icon));
        };
        $('#afRate').addEventListener('input', sync);
        $('#afName').addEventListener('input', sync);
        el.addEventListener('click', (e) => {
          const c = e.target.closest('[data-color]');
          if (c) { color = c.dataset.color; sync(); return; }
          const ic = e.target.closest('[data-icon]');
          if (ic) { icon = ic.dataset.icon; sync(); return; }
          const rs = e.target.closest('[data-rs]');
          if (rs) {
            const v = Math.max(PF.RATE_MIN, Math.min(PF.RATE_MAX, rate + Number(rs.dataset.rs) * 0.1));
            $('#afRate').value = Math.round(v * 10) / 10;
            sync();
          }
        });
        sync();
        if (!x) setTimeout(() => $('#afName').focus(), 300);
        $('#afSave').addEventListener('click', () => {
          const f = { name: $('#afName').value, rate, color, icon };
          let err;
          if (x) err = store.updateAct(x.id, f);
          else err = store.addAct(f).err;
          if (err) { $('#afErr').textContent = err; ui.haptic('error'); return; }
          ui.haptic('success');
          api.close();
          ui.toast(t(x ? 'Занятие изменено' : 'Занятие создано'));
          if (after) after();
        });
        const del = $('#afDel');
        if (del) del.addEventListener('click', async () => {
          const used = store.S.records.some((r) => r.a === x.id);
          const ok = await ui.confirm(esc(used
            ? t('Удалить занятие «{0}»? Его записи останутся в истории и статистике, монеты за них сохранятся.', x.name)
            : t('Удалить занятие «{0}»?', x.name)), t('Удалить'), true);
          if (!ok) return;
          const err = store.removeAct(x.id);
          if (err) { $('#afErr').textContent = err; ui.haptic('error'); return; }
          api.close();
          ui.toast(t('Занятие удалено'));
          if (after) after();
        });
      },
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

    // Занятия на выбор: все, что можно запускать, плюс занятие самой записи (если оно удалено).
    const keys = PF.ACT_ORDER.slice();
    if (!keys.includes(a)) keys.push(a);
    const many = keys.length > 3;
    const seg = keys.map((k) =>
      '<button type="button" class="seg-btn' + (k === a ? ' on' : '') + '" style="--c:' + ACTS[k].color + '" data-a="' + k + '">' +
      actName(k) + '</button>').join('');

    ui.openSheet({
      html:
        '<h3>' + t(isEdit ? 'Изменить запись' : 'Новая запись') + '</h3>' +
        (isEdit && rec.t ? '<div class="form-task">' + t('Задача: {0}', esc(rec.t)) + '</div>' : '') +
        (many ? '<div class="act-chips">' + seg + '</div>' : '<div class="seg" data-seg="form-act">' + seg + '</div>') +
        '<label class="field"><span>' + t('Дата') + '</span><input type="date" id="fDate" value="' + date + '" max="' + u.dayKey(now) + '"></label>' +
        '<div class="field-row">' +
        '  <label class="field"><span>' + t('Начало') + '</span><input type="time" id="fStart" value="' + ts + '"></label>' +
        '  <label class="field"><span>' + t('Конец') + '</span><input type="time" id="fEnd" value="' + te + '"></label>' +
        '</div>' +
        '<div class="form-info" id="fInfo"></div>' +
        '<div class="form-err" id="fErr"></div>' +
        (tooLong ? '<div class="form-err">' + t('Эта запись длиннее суток, её нельзя изменить в форме — только удалить.') + '</div>' : '') +
        '<div class="btn-col">' +
        (tooLong ? '' : '<button class="btn btn-primary" id="fSave">' + t('Сохранить') + '</button>') +
        (isEdit ? '<button class="btn btn-danger-ghost" id="fDel">' + ui.icon('trash') + t('Удалить запись') + '</button>' : '') +
        '<button class="btn btn-ghost" data-close>' + t('Отмена') + '</button></div>',
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
          let txt = t('Длительность: {0} · {1} мон.', u.durShort(r.e - r.s), u.coins(store.recCoins(r), true));
          if (u.dayKey(r.e) !== u.dayKey(r.s)) txt += ' · ' + t('закончится на следующий день');
          $('#fInfo').textContent = txt;
        }

        el.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
          cur = b.dataset.a;
          el.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('on', x === b));
          ui.segs(el);
          info();
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
          ui.toast(t(isEdit ? 'Запись изменена' : 'Запись добавлена'));
        });

        const del = $('#fDel');
        if (del) del.addEventListener('click', async () => {
          const ok = await ui.confirm(t('Удалить эту запись?'), t('Удалить'), true);
          if (!ok) return;
          store.remove(rec.id);
          api.close();
          ui.toast(t('Запись удалена'));
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
    const who = '<b style="color:' + act.color + '">' + actName(a.a) + '</b>' + (a.t ? ' — ' + esc(a.t) : '');
    ui.openSheet({
      dismissible: false,
      html:
        '<h3>' + t('Ты всё ещё занимаешься этим?') + '</h3>' +
        '<p class="sheet-text">' + t('{0} идёт уже {1} (с {2}).', who, u.durShort(now - a.s), sinceText(a.s)) + '</p>' +
        '<div class="btn-col" id="askBtns">' +
        '  <button class="btn btn-primary" id="askYes">' + t('Да, продолжаю') + '</button>' +
        '  <button class="btn btn-ghost" id="askNo">' + t('Нет, я уже закончил') + '</button></div>' +
        '<div id="askEnd" hidden>' +
        '  <label class="field"><span>' + t('Когда закончил?') + '</span>' +
        '    <input type="datetime-local" id="askTime" min="' + u.dateTimeInput(a.s) + '" max="' + u.dateTimeInput(now) + '" ' +
        '      value="' + u.dateTimeInput(Math.min(now, a.s + store.ASK_FIRST)) + '"></label>' +
        '  <div class="form-err" id="askErr"></div>' +
        '  <div class="btn-col"><button class="btn btn-primary" id="askSave">' + t('Сохранить') + '</button>' +
        '  <button class="btn btn-ghost" id="askBack">' + t('Назад') + '</button></div>' +
        '</div>',
      onClose() { askOpen = false; },
      onMount(el, api) {
        const $ = (s) => el.querySelector(s);
        $('#askYes').addEventListener('click', () => {
          store.confirmStill();
          api.close();
          ui.toast(t('Хорошо, спрошу снова через 2 часа'));
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
          if (!v) { $('#askErr').textContent = t('Укажите время окончания.'); return; }
          const [d, tm] = v.split('T');
          const end = u.fromInputs(d, tm);
          const cur = store.S.active;
          if (!cur) { api.close(); return; }
          if (!Number.isFinite(end) || end <= cur.s) { $('#askErr').textContent = t('Время окончания должно быть позже начала.'); return; }
          if (end > u.nowSec()) { $('#askErr').textContent = t('Время окончания не может быть в будущем.'); return; }
          const res = store.stop(end);
          api.close();
          if (res.rec) ui.floatCoins(store.recCoins(res.rec));
          if (res.short) ui.toast(t('Занятие было короче минуты и не сохранено'));
          else if (res.rec) ui.toast(recordedText(res.rec));
        });
      },
    });
  }

  PF.screens = PF.screens || {};
  PF.screens.timer = {
    render,
    tick,
    reset() { daysShown = PAGE_DAYS; },
  };
  PF.askStill = askStill;
  PF.openRates = openRates;
})(window.PF);
