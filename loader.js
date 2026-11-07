// Загрузчик приложения.
//
// index.html при каждом запуске подгружает этот файл со свежей меткой времени (?t=...),
// поэтому Telegram и браузер не могут взять его старую сохранённую копию.
// Здесь указаны номер версии и список файлов приложения. Файлы грузятся с ?v=ВЕРСИЯ:
// пока версия та же, они берутся из кэша (быстро), после обновления — скачиваются заново.
//
// ПРИ КАЖДОЙ ПУБЛИКАЦИИ УВЕЛИЧИВАЙТЕ VERSION.
(function () {
  'use strict';

  var VERSION = '11';

  var CSS = ['css/style.css'];
  var JS = [
    'js/util.js',
    'js/i18n.js',
    'js/i18n-en.js',
    'js/storage.js',
    'js/char.js',
    'js/store.js',
    'js/ui.js',
    'js/screens/timer.js',
    'js/screens/char.js',
    'js/screens/tasks.js',
    'js/screens/stats.js',
    'js/screens/settings.js',
    'js/app.js',
  ];

  window.PF_VERSION = VERSION;

  CSS.forEach(function (href) {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href + '?v=' + VERSION;
    document.head.appendChild(l);
  });

  // async = false: скрипты выполняются строго по порядку списка.
  JS.forEach(function (src) {
    var s = document.createElement('script');
    s.src = src + '?v=' + VERSION;
    s.async = false;
    s.onerror = function () {
      var el = document.getElementById('loading');
      if (el) el.textContent = 'Не удалось загрузить приложение. Проверьте интернет и откройте его снова. / Failed to load. Check your connection and reopen.';
    };
    document.body.appendChild(s);
  });
})();
