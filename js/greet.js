// Приветствие: заставка при запуске с разными фразами, вопрос об имени, строка на главном экране.
//
// Имя хранится в настройках (prefs.name) и синхронизируется через облако Telegram.
// Фраза зависит от времени суток и выбирается случайно (не повторяя прошлую).
(function (PF) {
  'use strict';

  const t = (...a) => PF.t(...a);
  const esc = (s) => PF.u.esc(s);

  // {0} — имя. Если имени нет, «, {0}» убирается из фразы.
  const PHRASES = {
    morning: ['Доброе утро, {0}!', 'С добрым утром, {0}!', 'Утро — лучшее время для дел, {0}', 'Новый день — новые победы, {0}!'],
    day: ['Добрый день, {0}!', 'Хорошего дня, {0}!', 'Отличный день для фокуса, {0}', 'Продолжаем, {0}?'],
    evening: ['Добрый вечер, {0}!', 'Как прошёл день, {0}?', 'Уютного вечера, {0}', 'Вечер — время подвести итоги, {0}'],
    night: ['Доброй ночи, {0}!', 'Не спится, {0}?', 'Поздний фокус, {0}?', 'Ночь — время отдыха, {0}'],
    any: ['Добро пожаловать, {0}!', 'С возвращением, {0}!', 'Рады тебя видеть, {0}!', 'Привет, {0}! Время сосредоточиться'],
  };
  // Короткая строка для главного экрана.
  const SHORT = { morning: 'Доброе утро, {0}', day: 'Добрый день, {0}', evening: 'Добрый вечер, {0}', night: 'Доброй ночи, {0}' };
  const EMOJI = { morning: '🌅', day: '☀️', evening: '🌆', night: '🌙' };

  function partOfDay(d) {
    const h = (d || new Date()).getHours();
    if (h >= 5 && h < 12) return 'morning';
    if (h >= 12 && h < 17) return 'day';
    if (h >= 17 && h < 23) return 'evening';
    return 'night';
  }

  // Имя: заданное пользователем или (если не задано) имя из Telegram.
  function name() {
    const own = (PF.store.S.prefs.name || '').trim();
    if (own) return own;
    const u = PF.tg && PF.tg.initDataUnsafe && PF.tg.initDataUnsafe.user;
    return u && u.first_name ? String(u.first_name).slice(0, 30) : '';
  }

  function fill(ph, nm) {
    const s = t(ph);
    return nm ? s.replace('{0}', nm) : s.replace(/,?\s*\{0\}/, '');
  }

  // Случайная фраза для заставки (2 из 3 раз — по времени суток, иначе общая; без повтора прошлой).
  function phrase() {
    const pod = partOfDay();
    const pool = Math.random() < 0.67 ? PHRASES[pod] : PHRASES.any;
    let last = '';
    try { last = localStorage.getItem('pfx_greet') || ''; } catch (e) { /* нет */ }
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick === last && pool.length > 1) pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    try { localStorage.setItem('pfx_greet', pick); } catch (e) { /* нет */ }
    return fill(pick, name());
  }

  // Строка над заголовком главного экрана.
  function short() {
    const pod = partOfDay();
    return EMOJI[pod] + ' ' + fill(SHORT[pod], name());
  }

  // ---------- заставка при запуске ----------

  function splash(done) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = document.createElement('div');
    el.className = 'splash';
    el.innerHTML =
      '<div class="splash-char">' + PF.char.svg(PF.store.look(), 192) + '</div>' +
      '<div class="splash-text">' + esc(phrase()) + '</div>' +
      '<div class="splash-bar"><i></i></div>' +
      '<div class="splash-brand">Pixel Focus</div>';
    document.body.appendChild(el);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      el.classList.add('out');
      setTimeout(() => { el.remove(); if (done) done(); }, reduce ? 0 : 450);
    };
    el.addEventListener('click', close);
    setTimeout(close, reduce ? 600 : 1700);
  }

  // ---------- вопрос об имени ----------

  function askName(firstTime) {
    const current = (PF.store.S.prefs.name || '').trim() || name();
    PF.ui.openSheet({
      dismissible: !firstTime,
      html:
        '<div class="name-hero">' + PF.char.svg(PF.store.look(), 128) + '</div>' +
        '<h3 class="center">' + t(firstTime ? 'Давай знакомиться!' : 'Как к вам обращаться?') + '</h3>' +
        '<p class="sheet-text center">' + t('Как к тебе обращаться? Это имя будет в приветствиях.') + '</p>' +
        '<label class="field"><span>' + t('Имя') + '</span><input id="nmIn" maxlength="30" autocomplete="given-name" value="' + esc(current) + '"></label>' +
        '<div class="btn-col"><button class="btn btn-primary" id="nmSave">' + t('Сохранить') + '</button>' +
        (firstTime ? '<button class="btn btn-ghost" id="nmSkip">' + t('Пропустить') + '</button>'
          : '<button class="btn btn-ghost" data-close>' + t('Отмена') + '</button>') + '</div>',
      onMount(el, api) {
        const inp = el.querySelector('#nmIn');
        setTimeout(() => { inp.focus(); inp.select(); }, 300);
        const save = () => {
          const v = inp.value.trim().replace(/\s+/g, ' ').slice(0, 30);
          PF.store.setPref('name', v);
          PF.store.setPref('asked', true);
          api.close();
          PF.ui.haptic('success');
          PF.ui.toast(v ? t('Приятно познакомиться, {0}!', v) : t('Хорошо, без имени'));
        };
        el.querySelector('#nmSave').addEventListener('click', save);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
        const skip = el.querySelector('#nmSkip');
        if (skip) skip.addEventListener('click', () => { PF.store.setPref('asked', true); api.close(); });
      },
    });
  }

  // При запуске: заставка, а при первом заходе — вопрос об имени.
  function onStart() {
    // Флаг только для автоматических тестов: без заставки и вопроса.
    try { if (localStorage.getItem('pfx_nosplash') === '1') return; } catch (e) { /* нет */ }
    splash(() => {
      if (!PF.store.S.prefs.asked) askName(true);
    });
  }

  PF.greet = { phrase, short, name, partOfDay, splash, askName, onStart };
})(window.PF);
