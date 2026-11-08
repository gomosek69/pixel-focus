// Вкладка «Задачи»: список задач по группам, добавление, выполнение, запуск занятия из задачи.
(function (PF) {
  'use strict';

  const u = PF.u;
  const ui = PF.ui;
  const store = PF.store;
  const ACTS = PF.ACTS;
  const esc = u.esc;
  const t = PF.t;

  let root = null;
  let justToggled = null; // задача, которую только что отметили (для анимации галочки)

  // Ключ для сортировки: дата + время (без времени — в конце дня).
  const sortKey = (k) => (k.date || '9999-99-99') + ' ' + (k.time || '99:99');

  function groups() {
    const today = u.dayKey(u.nowSec());
    const g = { today: [], other: [], nodate: [] };
    store.S.tasks.forEach((k) => {
      if (!k.date) g.nodate.push(k);
      else if (k.date === today) g.today.push(k);
      else g.other.push(k);
    });
    // Невыполненные сверху, выполненные внизу группы.
    const byDate = (a, b) => (a.done - b.done) || sortKey(a).localeCompare(sortKey(b)) || a.c - b.c;
    g.today.sort(byDate);
    g.other.sort(byDate);
    g.nodate.sort((a, b) => (a.done - b.done) || a.c - b.c);
    return g;
  }

  function render(el) {
    root = el;
    const g = groups();
    const doneCount = store.S.tasks.filter((k) => k.done).length;
    const section = (title, list, empty) =>
      '<div class="group-title">' + title + (list.length ? ' · ' + list.filter((k) => !k.done).length : '') + '</div>' +
      (list.length ? '<div class="card list">' + list.map(row).join('') + '</div>'
        : '<div class="empty small">' + empty + '</div>');
    root.innerHTML =
      '<header class="top top-row"><h1>' + t('Задачи') + '</h1>' +
      '  <button class="btn-small" data-action="add">' + ui.icon('plus') + t('Задача') + '</button></header>' +
      '<form class="quick card" id="quick" autocomplete="off">' +
      '  <input id="quickTitle" maxlength="200" placeholder="' + esc(t('Новая задача без даты…')) + '">' +
      '  <button class="quick-add" type="submit" aria-label="' + esc(t('Добавить')) + '">' + ui.icon('plus') + '</button>' +
      '</form>' +
      section(t('Сегодня'), g.today, t('На сегодня задач нет.')) +
      section(t('Другие дни'), g.other, t('Задач на другие дни нет.')) +
      section(t('Без даты'), g.nodate, t('Задач без даты нет.')) +
      (doneCount ? '<button class="btn btn-ghost more" data-action="clear">' + ui.icon('trash') +
        t('Удалить выполненные ({0})', doneCount) + '</button>' : '');
    root.onclick = onClick;
    root.querySelector('#quick').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = root.querySelector('#quickTitle');
      const title = inp.value;
      if (!title.trim()) { inp.focus(); return; }
      const err = store.addTask({ title });
      if (err) { ui.toast(err); return; }
      ui.haptic('light');
      // После перерисовки вернуть фокус, чтобы удобно добавлять несколько задач подряд.
      const again = root.querySelector('#quickTitle');
      if (again) again.focus();
    });
  }

  function whenText(k) {
    const today = u.dayKey(u.nowSec());
    let s = '';
    if (k.date && k.date !== today) s = u.dayTitle(k.date);
    if (k.time) s += (s ? ', ' : '') + u.clockStr(k.time);
    return s;
  }

  function row(k) {
    const a = store.S.active;
    const running = a && a.taskId === k.id;
    const overdue = !k.done && k.date && k.date < u.dayKey(u.nowSec());
    const when = whenText(k);
    let actions = '';
    if (!k.done) {
      if (running) {
        actions = '<button class="task-act stop" style="--c:' + ACTS[a.a].color + '" data-action="stop" data-id="' + esc(k.id) + '" ' +
          'aria-label="' + esc(t('Завершить')) + '">' + ui.icon('stop') + '</button>';
      } else {
        actions = ['work', 'study'].map((act) =>
          '<button class="task-act" style="--c:' + ACTS[act].color + '" data-action="start" data-a="' + act + '" data-id="' + esc(k.id) + '" ' +
          'aria-label="' + esc(t('Начать: {0}', t(ACTS[act].name))) + '">' + ui.icon(ACTS[act].icon) + '</button>').join('');
      }
    }
    return '<div class="task' + (k.done ? ' done' : '') + (running ? ' running' : '') + (k.id === justToggled && k.done ? ' just' : '') + '">' +
      '<button class="check" data-action="toggle" data-id="' + esc(k.id) + '" aria-label="' + esc(t('Выполнено')) + '">' +
      (k.done ? '<svg viewBox="0 0 24 24" class="ic"><path d="M5 12l5 5 9-10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '') +
      '</button>' +
      '<button class="task-main" data-action="edit" data-id="' + esc(k.id) + '">' +
      '<span class="task-title">' + esc(k.title) + '</span>' +
      (running
        ? '<span class="task-meta run" style="color:' + ACTS[a.a].color + '">' + t('{0} идёт', esc(PF.actName(a.a))) +
          ' · <span class="task-dur" data-start="' + a.s + '">' + u.durClock(u.nowSec() - a.s) + '</span></span>'
        : (when ? '<span class="task-meta' + (overdue ? ' overdue' : '') + '">' + (overdue ? t('просрочено') + ' · ' : '') + esc(when) + '</span>' : '')) +
      '</button>' +
      '<span class="task-acts">' + actions + '</span></div>';
  }

  // Каждую секунду обновляем длительность идущего занятия у задачи.
  function tick() {
    if (!root) return;
    root.querySelectorAll('.task-dur').forEach((el) => {
      el.textContent = u.durClock(u.nowSec() - Number(el.dataset.start));
    });
  }

  function onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const k = id && store.S.tasks.find((x) => x.id === id);
    const action = btn.dataset.action;
    if (action === 'add') {
      openForm(null);
    } else if (action === 'edit' && k) {
      openForm(k);
    } else if (action === 'toggle' && k) {
      justToggled = id;
      setTimeout(() => { if (justToggled === id) justToggled = null; }, 800);
      const res = store.toggleTask(id);
      if (res.rec) ui.floatCoins(store.recCoins(res.rec));
      ui.haptic(k.done ? 'success' : 'light');
      if (res.rec) ui.toast(t('Задача выполнена. Записано: {0}, {1}', PF.actName(res.rec.a), u.durShort(res.rec.e - res.rec.s)));
      else if (res.short) ui.toast(t('Занятие было короче минуты и не сохранено'));
    } else if (action === 'start' && k) {
      const res = store.start(btn.dataset.a, { t: k.title, taskId: k.id });
      ui.haptic('medium');
      ui.toast(t('Начато: {0} — {1}', PF.actName(btn.dataset.a), k.title));
      if (res.short) setTimeout(() => ui.toast(t('Предыдущее занятие было короче минуты и не сохранено')), 2600);
    } else if (action === 'stop') {
      const res = store.stop();
      if (res.rec) ui.floatCoins(store.recCoins(res.rec));
      ui.haptic('light');
      if (res.short) ui.toast(t('Занятие было короче минуты и не сохранено'));
      else if (res.rec) ui.toast(t('Записано: {0}, {1} ({2} мон.)', PF.actName(res.rec.a), u.durShort(res.rec.e - res.rec.s), u.coins(store.recCoins(res.rec), true)));
    } else if (action === 'clear') {
      clearDone();
    }
  }

  async function clearDone() {
    const n = store.S.tasks.filter((k) => k.done).length;
    const ok = await ui.confirm(t('Удалить выполненные задачи ({0})?', n), t('Удалить'), true);
    if (!ok) return;
    store.clearDoneTasks();
    ui.toast(t('Выполненные задачи удалены'));
  }

  // ---------- форма задачи ----------

  function openForm(k) {
    const isEdit = !!k;
    ui.openSheet({
      html:
        '<h3>' + t(isEdit ? 'Изменить задачу' : 'Новая задача') + '</h3>' +
        '<label class="field"><span>' + t('Название') + '</span><input id="tTitle" maxlength="200" value="' + (isEdit ? esc(k.title) : '') + '"></label>' +
        '<div class="field-row">' +
        '  <label class="field"><span>' + t('Дата (необязательно)') + '</span><input type="date" id="tDate" value="' + (isEdit ? k.date : '') + '"></label>' +
        '  <label class="field"><span>' + t('Время (необязательно)') + '</span><input type="time" id="tTime" value="' + (isEdit ? k.time : '') + '"></label>' +
        '</div>' +
        '<div class="quick-dates">' +
        '  <button type="button" class="chip-btn" data-d="0">' + t('Сегодня') + '</button>' +
        '  <button type="button" class="chip-btn" data-d="1">' + t('Завтра') + '</button>' +
        '  <button type="button" class="chip-btn" data-d="none">' + t('Без даты') + '</button>' +
        '</div>' +
        '<div class="form-err" id="tErr"></div>' +
        '<div class="btn-col"><button class="btn btn-primary" id="tSave">' + t('Сохранить') + '</button>' +
        (isEdit ? '<button class="btn btn-danger-ghost" id="tDel">' + ui.icon('trash') + t('Удалить задачу') + '</button>' : '') +
        '<button class="btn btn-ghost" data-close>' + t('Отмена') + '</button></div>',
      onMount(el, api) {
        const $ = (s) => el.querySelector(s);
        if (!isEdit) setTimeout(() => $('#tTitle').focus(), 250);
        el.querySelectorAll('.chip-btn').forEach((b) => b.addEventListener('click', () => {
          if (b.dataset.d === 'none') { $('#tDate').value = ''; $('#tTime').value = ''; return; }
          $('#tDate').value = u.addDays(u.dayKey(u.nowSec()), Number(b.dataset.d));
        }));
        const save = () => {
          const f = { title: $('#tTitle').value, date: $('#tDate').value, time: $('#tTime').value };
          const err = isEdit ? store.updateTask(k.id, f) : store.addTask(f);
          if (err) { $('#tErr').textContent = err; ui.haptic('error'); return; }
          ui.haptic('success');
          api.close();
          ui.toast(t(isEdit ? 'Задача изменена' : 'Задача добавлена'));
        };
        $('#tSave').addEventListener('click', save);
        $('#tTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
        const del = $('#tDel');
        if (del) del.addEventListener('click', async () => {
          const ok = await ui.confirm(t('Удалить эту задачу?'), t('Удалить'), true);
          if (!ok) return;
          store.removeTask(k.id);
          api.close();
          ui.toast(t('Задача удалена'));
        });
      },
    });
  }

  PF.screens = PF.screens || {};
  PF.screens.tasks = { render, tick };
})(window.PF);
