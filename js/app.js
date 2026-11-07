// Запуск приложения: подключение к Telegram, загрузка данных, нижняя панель вкладок.
(function (PF) {
  'use strict';

  const TABS = [
    { id: 'timer', label: 'Таймер', icon: 'timer' }, // подписи переводятся при отрисовке
    { id: 'stats', label: 'Статистика', icon: 'stats' },
    { id: 'char', label: 'Персонаж', icon: 'char' },
    { id: 'tasks', label: 'Задачи', icon: 'tasks' },
    { id: 'settings', label: 'Настройки', icon: 'settings' },
  ];

  let current = 'timer';
  let lastDay = '';

  function setupTelegram() {
    const tg = window.Telegram && window.Telegram.WebApp;
    // Внутри Telegram есть либо данные запуска (initData), либо известная платформа.
    // В обычном браузере библиотека Telegram сообщает платформу 'unknown'.
    const inTelegram = !!tg && (!!tg.initData || (!!tg.platform && tg.platform !== 'unknown'));
    if (!inTelegram) { PF.tg = null; return; }
    PF.tg = tg;
    document.documentElement.classList.add('in-tg');
    try {
      tg.ready();
      tg.expand();
      if (tg.isVersionAtLeast('7.7') && tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      if (tg.isVersionAtLeast('6.1')) {
        tg.BackButton.onClick(() => PF.ui.closeTopSheet());
      }
      document.documentElement.dataset.scheme = tg.colorScheme || 'light';
      tg.onEvent('themeChanged', () => applyTheme());
    } catch (e) {
      console.warn('Telegram setup', e);
    }
  }

  // Применить тему, основной цвет и фон из настроек.
  function applyTheme() {
    const root = document.documentElement;
    const pr = PF.store.S.prefs;
    const tg = PF.tg;
    if (pr.theme === 'auto') {
      delete root.dataset.theme;
      if (tg) root.dataset.scheme = tg.colorScheme || 'light';
      else delete root.dataset.scheme;
    } else {
      root.dataset.theme = pr.theme;
      root.dataset.scheme = pr.theme;
    }
    const acc = pr.accent === 'auto' ? null : PF.ACCENTS[pr.accent];
    if (acc) {
      root.style.setProperty('--primary', acc.hex);
      root.style.setProperty('--primary-text', '#fff');
    } else {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--primary-text');
    }
    document.body.dataset.pfBg = String(pr.bg || 0);
    // Подкрасить шапку и фон Telegram под выбранную тему.
    if (tg && tg.isVersionAtLeast) {
      try {
        const bg = getComputedStyle(document.documentElement).backgroundColor;
        const m = bg.match(/\d+/g);
        const hex = m ? '#' + m.slice(0, 3).map((x) => Number(x).toString(16).padStart(2, '0')).join('') : null;
        if (pr.theme === 'auto') {
          if (tg.isVersionAtLeast('6.1')) { tg.setHeaderColor('secondary_bg_color'); tg.setBackgroundColor('secondary_bg_color'); }
        } else if (hex) {
          if (tg.isVersionAtLeast('6.9')) tg.setHeaderColor(hex);
          if (tg.isVersionAtLeast('6.1')) tg.setBackgroundColor(hex);
          if (tg.isVersionAtLeast('7.10') && tg.setBottomBarColor) tg.setBottomBarColor(hex);
        }
      } catch (e) { /* не важно */ }
    }
  }

  function renderTabbar() {
    const nav = document.getElementById('tabbar');
    nav.innerHTML = TABS.map((t) =>
      '<button class="tab' + (t.id === current ? ' on' : '') + '" data-tab="' + t.id + '">' +
      PF.ui.icon(t.icon) + '<span>' + PF.t(t.label) + '</span></button>').join('');
  }

  function renderScreen() {
    const el = document.getElementById('screen');
    document.body.dataset.pfTab = current;
    PF.screens[current].render(el);
  }

  function switchTab(id) {
    if (!PF.screens[id] || id === current) return;
    current = id;
    if (PF.screens.timer.reset) PF.screens.timer.reset();
    renderTabbar();
    renderScreen();
    window.scrollTo(0, 0);
    PF.ui.haptic('light');
  }

  function checkAsk() {
    if (PF.store.needsAsk()) PF.askStill();
  }

  function tick() {
    const scr = PF.screens[current];
    if (scr.tick) scr.tick();
    checkAsk();
    // Наступили новые сутки — обновить подписи «Сегодня/Вчера».
    const day = PF.u.dayKey(PF.u.nowSec());
    if (day !== lastDay) {
      lastDay = day;
      if (current === 'timer' && !PF.ui.hasOpenSheet()) renderScreen();
    }
  }

  async function start() {
    setupTelegram();
    try {
      await PF.store.init();
    } catch (e) {
      console.error(e);
      document.getElementById('loading').textContent = PF.t('Не удалось загрузить данные: {0}', e.message);
      return;
    }
    document.getElementById('loading').remove();
    document.getElementById('app').hidden = false;

    lastDay = PF.u.dayKey(PF.u.nowSec());
    applyTheme();
    renderTabbar();
    renderScreen();

    document.getElementById('tabbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) switchTab(b.dataset.tab);
    });

    PF.store.on((type, payload) => {
      if (type === 'lang') {
        renderTabbar();
      } else if (type === 'theme') {
        applyTheme();
      } else if (type === 'change') {
        // Перерисовываем текущую вкладку (формы во всплывающих окнах не трогаются).
        renderScreen();
      } else if (type === 'saveError') {
        if (payload && payload.code === 'LIMIT') {
          PF.ui.toast(PF.t('Облачное хранилище Telegram заполнено. Сохраните резервную копию.'), true);
        } else {
          PF.ui.toast(PF.t('Не удалось сохранить данные. Проверьте интернет.'), true);
        }
      }
    });

    // Когда приложение снова показывают — проверить «ты всё ещё…», при скрытии — сохранить.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { renderScreen(); checkAsk(); }
      else PF.store.flush();
    });
    window.addEventListener('pagehide', () => PF.store.flush());

    setInterval(tick, 1000);
    if (PF.migratedNotice) PF.ui.toast(PF.t(PF.migratedNotice), true);
    else if (PF.store.storageNearlyFull()) {
      PF.ui.toast(PF.t('Облако Telegram почти заполнено ({0} из 1024). Подробности в Настройках.', PF.store.keyCount()), true);
    }
    checkAsk();
  }

  PF.app = { switchTab };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window.PF);
