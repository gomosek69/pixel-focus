// Перевод интерфейса: русский / английский.
//
// Ключ — русский текст. PF.t('Русский текст', a, b) возвращает перевод для текущего языка
// и подставляет значения на места {0}, {1}…
// Английские переводы лежат в словаре EN внизу файла (js/i18n-en.js).
(function (PF) {
  'use strict';

  let lang = 'ru';

  // Язык «как в Telegram»: русский, если Telegram (или браузер) на русском, иначе английский.
  function detect() {
    let code = '';
    try {
      const tg = window.Telegram && window.Telegram.WebApp;
      code = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.language_code) || '';
    } catch (e) { /* нет данных */ }
    if (!code) code = (navigator.languages && navigator.languages[0]) || navigator.language || 'ru';
    return String(code).toLowerCase().startsWith('ru') ? 'ru' : 'en';
  }

  function fill(s, args) {
    return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (args[i] !== undefined ? args[i] : m)) : s;
  }

  function t(ru, ...args) {
    if (lang === 'en') {
      const en = PF.EN && PF.EN[ru];
      if (en === undefined && PF.debugI18n) console.warn('Нет перевода:', ru);
      return fill(en !== undefined ? en : ru, args);
    }
    return fill(ru, args);
  }

  // pref: 'auto' | 'ru' | 'en'
  function setLang(pref) {
    lang = pref === 'ru' || pref === 'en' ? pref : detect();
    document.documentElement.lang = lang;
  }

  PF.t = t;
  PF.i18n = {
    t,
    setLang,
    detect,
    get lang() { return lang; },
    locale: () => (lang === 'en' ? 'en-US' : 'ru-RU'),
  };

  setLang('auto');
})(window.PF);
