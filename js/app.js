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
    // Без Premium действуют бесплатные варианты оформления (выбор сохраняется на будущее).
    const prem = PF.premium && PF.premium.isPremium();
    const pr = Object.assign({}, PF.store.S.prefs, prem ? {} : { accent: 'auto', bg: 0, glass: 'liquid' });
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
    root.dataset.glass = pr.glass || 'liquid';
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

  // Нижняя панель. Плашка под активной вкладкой плавно переезжает к новой.
  let tabIndPos = null;
  function renderTabbar() {
    const nav = document.getElementById('tabbar');
    nav.innerHTML = '<span class="tab-ind"></span>' + TABS.map((t) =>
      '<button class="tab' + (t.id === current ? ' on' : '') + '" data-tab="' + t.id + '">' +
      PF.ui.icon(t.icon) + '<span>' + PF.t(t.label) + '</span></button>').join('');
    const ind = nav.querySelector('.tab-ind');
    const on = nav.querySelector('.tab.on');
    if (!on) return;
    const x = on.offsetLeft + 4, w = on.offsetWidth - 8;
    if (tabIndPos) {
      ind.style.transition = 'none';
      ind.style.transform = 'translateX(' + tabIndPos.x + 'px)';
      ind.style.width = tabIndPos.w + 'px';
      void ind.offsetWidth;
      ind.style.transition = '';
    }
    ind.style.transform = 'translateX(' + x + 'px)';
    ind.style.width = w + 'px';
    tabIndPos = { x, w };
  }

  // anim: 'fwd' | 'back' — сдвиг экрана при переходе между вкладками.
  function renderScreen(anim) {
    const el = document.getElementById('screen');
    document.body.dataset.pfTab = current;
    PF.screens[current].render(el);
    if (anim) {
      // Поочерёдно проявить стеклянные элементы и заголовки (вложенные — вместе с родителем).
      // Ряды кнопок (.chart-types, .cat-tabs, .period-nav) появляются целиком, а не по одной кнопке.
      const SEL = '.chart-types, .cat-tabs, .period-nav, .card, .act-btn, .item, .empty, .cat-tab, .ct-btn, .nav-btn, ' +
        '.balance, .quick, .seg, .btn-small, h1, .group-title, .sec-head h2, .day-head, .note, .more';
      let i = 0;
      el.querySelectorAll(SEL).forEach((node) => {
        const outer = node.parentElement && node.parentElement.closest(SEL);
        if (outer && el.contains(outer)) return;
        node.classList.add('rise');
        node.style.animationDelay = Math.min(i++ * 40, 320) + 'ms';
      });
      el.classList.remove('anim-fwd', 'anim-back');
      void el.offsetWidth;
      el.classList.add('anim-' + anim);
      el.addEventListener('animationend', function done(e) {
        if (e.target !== el) return;
        el.classList.remove('anim-fwd', 'anim-back');
        el.removeEventListener('animationend', done);
      });
    }
    PF.ui.segs(el);
  }

  function switchTab(id) {
    if (!PF.screens[id] || id === current) return;
    const from = TABS.findIndex((x) => x.id === current);
    const to = TABS.findIndex((x) => x.id === id);
    current = id;
    if (PF.screens.timer.reset) PF.screens.timer.reset();
    renderTabbar();
    window.scrollTo(0, 0);
    renderScreen(to > from ? 'fwd' : 'back');
    PF.ui.haptic('light');
  }

  // Плавная смена цветов при смене темы / цвета / стиля.
  function animateTheme() {
    const root = document.documentElement;
    root.classList.add('theme-anim');
    clearTimeout(animateTheme.t);
    animateTheme.t = setTimeout(() => root.classList.remove('theme-anim'), 500);
  }

  // Ежедневный бонус подписчика (+30 монет раз в день).
  function dailyBonus() {
    const n = PF.store.claimDailyBonus();
    if (n) setTimeout(() => { PF.ui.floatCoins(n); PF.ui.toast(PF.t('🎁 Ежедневный бонус Premium: +{0} монет', n)); }, 900);
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
    // Любая перерисовка экрана (в том числе изнутри вкладки) — расставить плашки переключателей.
    let segsQueued = false;
    new MutationObserver(() => {
      if (segsQueued) return;
      segsQueued = true;
      requestAnimationFrame(() => { segsQueued = false; PF.ui.segs(document.getElementById('screen')); });
    }).observe(document.getElementById('screen'), { childList: true, subtree: true });

    // Слой с цветными пятнами позади интерфейса (для эффекта стекла).
    if (!document.getElementById('ambient')) {
      const amb = document.createElement('div');
      amb.id = 'ambient';
      document.body.prepend(amb);
    }
    applyTheme();
    renderTabbar();
    renderScreen('fwd');

    document.getElementById('tabbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) switchTab(b.dataset.tab);
    });

    PF.store.on((type, payload) => {
      if (type === 'lang') {
        renderTabbar();
      } else if (type === 'theme') {
        animateTheme();
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
      if (document.visibilityState === 'visible') { renderScreen(); checkAsk(); PF.premium.refresh(); dailyBonus(); }
      else PF.store.flush();
    });
    window.addEventListener('pagehide', () => PF.store.flush());

    // Premium: проверить статус на сервере; при изменении — перерисовать всё.
    PF.premium.on(() => { applyTheme(); renderTabbar(); renderScreen(); dailyBonus(); });
    PF.premium.refresh();
    dailyBonus();

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
