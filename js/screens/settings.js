// Вкладка «Настройки»: язык, резервная копия, сведения о хранилище.
(function (PF) {
  'use strict';

  const u = PF.u;
  const ui = PF.ui;
  const store = PF.store;
  const t = PF.t;

  let root = null;

  // Короткая техническая справка: где запущено приложение.
  function tgInfo() {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (!tg || !tg.platform || tg.platform === 'unknown') return t('не обнаружен');
    return t('{0}, версия {1}', tg.platform, tg.version) + (tg.initData ? '' : ', ' + t('без данных запуска'));
  }

  function backupFileName() {
    return 'pixel-focus-' + u.dayKey(u.nowSec()) + '.json';
  }

  function backupText() {
    return JSON.stringify(store.exportObj(), null, 1);
  }

  function render(el) {
    root = el;
    const cloud = store.backendName === 'cloud';
    const where = cloud
      ? t('В облаке Telegram. Данные доступны на всех ваших устройствах, где открыт этот бот.')
      : t('В памяти этого браузера. Если очистить данные браузера, записи пропадут — делайте резервные копии.');
    const lang = store.S.prefs.lang;
    const langBtn = (v, label) =>
      '<button class="seg-btn' + (lang === v ? ' on' : '') + '" data-lang="' + v + '">' + label + '</button>';
    root.innerHTML =
      '<header class="top"><h1>' + t('Настройки') + '</h1></header>' +
      premiumCardHtml() +
      (PF.storageWarning ? '<div class="card warn">' + u.esc(t(PF.storageWarning)) + '</div>' : '') +
      (store.storageNearlyFull()
        ? '<div class="card warn"><b>' + t('Облако Telegram почти заполнено: {0} из 1024 ячеек.', store.keyCount()) + '</b><br>' +
          t('Сохраните резервную копию и попросите уплотнить хранение или убрать старые записи в архив. Когда ячейки закончатся, новые записи перестанут сохраняться.') + '</div>'
        : '') +
      '<div class="group-title">Язык · Language</div>' +
      '<div class="seg seg-main lang-seg" data-seg="lang">' +
      langBtn('auto', t('Как в Telegram')) + langBtn('ru', 'Русский') + langBtn('en', 'English') +
      '</div>' +
      appearanceHtml() +
      '<div class="group-title">' + t('Резервная копия') + '</div>' +
      '<div class="card list">' +
      '  <button class="row" data-action="download">' + ui.icon('download') + '<span>' + t('Сохранить в файл') + '</span></button>' +
      '  <button class="row" data-action="copy">' + ui.icon('copy') + '<span>' + t('Скопировать как текст') + '</span></button>' +
      '  <button class="row" data-action="upload">' + ui.icon('upload') + '<span>' + t('Загрузить из файла') + '</span></button>' +
      '  <button class="row" data-action="paste">' + ui.icon('paste') + '<span>' + t('Загрузить из текста') + '</span></button>' +
      '</div>' +
      '<p class="note">' + t('Если в Telegram файл не сохраняется, нажмите «Скопировать как текст» и отправьте текст себе в «Избранное». Загрузка копии заменяет все текущие данные.') + '</p>' +
      '<input type="file" id="fileIn" accept=".json,application/json,text/plain" hidden>' +
      '<div class="group-title">' + t('Хранилище') + '</div>' +
      '<div class="card pad">' +
      '  <div class="kv"><span>' + t('Где хранятся данные') + '</span></div><p class="note tight">' + where + '</p>' +
      '  <div class="kv"><span>' + t('Записей') + '</span><b>' + store.S.records.length + '</b></div>' +
      (cloud ? '<div class="kv"><span>' + t('Занято ячеек облака') + '</span><b>' + t('{0} из 1024', store.keyCount()) + '</b></div>' : '') +
      '  <div class="kv"><span>Telegram</span><b>' + u.esc(tgInfo()) + '</b></div>' +
      '</div>' +
      '<div class="group-title">' + t('Для разработчика') + '</div>' +
      '<div class="card list">' +
      '  <button class="row" data-action="dev">🛠<span>' + t('Режим разработчика') + '</span></button>' +
      '</div>' +
      '<div class="card list danger-zone">' +
      '  <button class="row danger" data-action="wipe">' + ui.icon('trash') + '<span>' + t('Удалить все данные') + '</span></button>' +
      '</div>' +
      '<p class="note center">Pixel Focus · ' + t('версия {0}', window.PF_VERSION || '—') + '</p>';

    root.onclick = onClick;
    root.querySelector('#fileIn').addEventListener('change', onFile);
  }

  const prem = () => PF.premium.isPremium();

  // Карточка Premium вверху настроек.
  function premiumCardHtml() {
    const P = PF.premium;
    let html;
    if (prem()) {
      const st = P.state;
      const when = !P.inTelegram() ? t('тестовый режим') : st.forever ? t('навсегда')
        : t('до {0}', new Date(st.until * 1000).toLocaleDateString(PF.i18n.locale()));
      html = '<button class="card prem-card on" data-action="premium"><span class="pc-star">⭐</span>' +
        '<span><b>' + t('Premium активен') + '</b><small>' + u.esc(when) + ' · ' + t('что входит') + '</small></span></button>';
    } else {
      html = '<button class="card prem-card" data-action="premium"><span class="pc-star">⭐</span>' +
        '<span><b>Pixel Focus Premium</b><small>' + t('Безлимитные задачи, вся статистика, танцы, редкие вещи, +25% монет') + '</small></span>' +
        '<span class="pc-price">' + P.PRICE + ' ⭐</span></button>';
    }
    if (!P.inTelegram()) {
      html += '<div class="card list"><button class="row" data-action="testprem">🧪<span>' + t('Тестовый Premium (только в этом браузере)') + '</span>' +
        '<b class="switch' + (P.testMode() ? ' on' : '') + '"></b></button></div>';
    }
    return html;
  }

  // Оформление: тема, основной цвет, фон главного экрана.
  function appearanceHtml() {
    // Без Premium показываем действующие (бесплатные) варианты.
    const pr = Object.assign({}, store.S.prefs, prem() ? {} : { accent: 'auto', bg: 0, glass: 'liquid' });
    const star = prem() ? '' : ' ⭐';
    const isEn = PF.i18n.lang === 'en';
    const themeBtn = (v, label) =>
      '<button class="seg-btn' + (pr.theme === v ? ' on' : '') + '" data-theme="' + v + '">' + label + '</button>';
    const accents =
      '<button class="accent-sw tg' + (pr.accent === 'auto' ? ' on' : '') + '" data-accent="auto" ' +
      'aria-label="' + u.esc(t('Как в Telegram')) + '" title="' + u.esc(t('Как в Telegram')) + '"></button>' +
      PF.ACCENTS.map((a, i) =>
        '<button class="accent-sw' + (pr.accent === i ? ' on' : '') + '" data-accent="' + i + '" style="--sw:' + a.hex + '" ' +
        'aria-label="' + u.esc(isEn ? a.en : a.ru) + '" title="' + u.esc(isEn ? a.en : a.ru) + '">' + (prem() ? '' : '<i class="mini-lock">⭐</i>') + '</button>').join('');
    const bgs = PF.BACKGROUNDS.map((name, i) =>
      '<button class="bg-tile' + ((pr.bg || 0) === i ? ' on' : '') + '" data-bg="' + i + '" style="--tile:' + (i ? 'var(--bgimg-' + i + ')' : 'none') + '">' +
      '<span>' + t(name) + (i && !prem() ? ' ⭐' : '') + '</span></button>').join('');
    return '<div class="group-title">' + t('Оформление') + '</div>' +
      '<div class="card pad theme-card">' +
      '  <div><div class="set-label">' + t('Тема') + '</div><div class="seg seg-main" data-seg="theme">' +
      themeBtn('auto', t('Как в Telegram')) + themeBtn('light', t('Светлая')) + themeBtn('dark', t('Тёмная')) + '</div></div>' +
      '  <div><div class="set-label">' + t('Стиль интерфейса') + '</div><div class="seg seg-main" data-seg="glass">' +
      ['liquid', 'frosted'].map((g) =>
        '<button class="seg-btn' + ((pr.glass || 'liquid') === g ? ' on' : '') + '" data-glassopt="' + g + '">' +
        (g === 'liquid' ? 'Liquid Glass' : t('Матовое стекло') + star) + '</button>').join('') + '</div></div>' +
      '  <div><div class="set-label">' + t('Основной цвет') + '</div><div class="accents">' + accents + '</div></div>' +
      '  <div><div class="set-label">' + t('Фон приложения') + '</div><div class="bgs">' + bgs + '</div></div>' +
      '</div>';
  }

  async function onClick(e) {
    const th = e.target.closest('[data-theme]');
    if (th && th.classList.contains('seg-btn')) { store.setPref('theme', th.dataset.theme); ui.haptic('light'); return; }
    const needPrem = () => { PF.premium.paywall(t('Цвета, стекло и фоны — в Premium')); };
    const gl = e.target.closest('[data-glassopt]');
    if (gl) {
      if (gl.dataset.glassopt !== 'liquid' && !prem()) { needPrem(); return; }
      store.setPref('glass', gl.dataset.glassopt); ui.haptic('light'); return;
    }
    const ac = e.target.closest('.accent-sw[data-accent]');
    if (ac) {
      if (ac.dataset.accent !== 'auto' && !prem()) { needPrem(); return; }
      store.setPref('accent', ac.dataset.accent === 'auto' ? 'auto' : Number(ac.dataset.accent)); ui.haptic('light'); return;
    }
    const bgb = e.target.closest('.bg-tile[data-bg]');
    if (bgb) {
      if (bgb.dataset.bg !== '0' && !prem()) { needPrem(); return; }
      store.setPref('bg', Number(bgb.dataset.bg)); ui.haptic('light'); return;
    }
    const langBtn = e.target.closest('[data-lang]');
    if (langBtn) {
      store.setPref('lang', langBtn.dataset.lang);
      ui.haptic('light');
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'premium') { PF.premium.paywall(); return; }
    if (action === 'testprem') { PF.premium.setTestMode(!PF.premium.testMode()); return; }
    if (action === 'dev') { openDev(); return; }
    if (action === 'download') {
      await store.flush();
      try {
        const blob = new Blob([backupText()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = backupFileName();
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        ui.toast(t('Файл сохранён (проверьте папку «Загрузки»)'));
      } catch (err) {
        ui.toast(t('Не получилось сохранить файл. Используйте «Скопировать как текст».'), true);
      }
    } else if (action === 'copy') {
      copyText();
    } else if (action === 'upload') {
      root.querySelector('#fileIn').click();
    } else if (action === 'paste') {
      pasteSheet();
    } else if (action === 'wipe') {
      const ok = await ui.confirm(t('Удалить все записи, покупки и текущее занятие? Это нельзя отменить. Сначала лучше сохранить резервную копию.'), t('Удалить всё'), true);
      if (!ok) return;
      await store.wipe();
      ui.toast(t('Все данные удалены'));
      render(root);
    }
  }

  // ---------- режим разработчика ----------
  // Пароль проверяет сервер (он хранится в секретах Cloudflare, в коде его нет).

  function openDev() {
    const P = PF.premium;
    if (!P.inTelegram() || !P.serverReady()) {
      ui.openSheet({ html: '<h3>' + t('Режим разработчика') + '</h3><p class="sheet-text">' +
        t('Режим разработчика работает внутри Telegram после подключения сервера.') + '</p>' +
        '<div class="btn-col"><button class="btn btn-ghost" data-close>' + t('Закрыть') + '</button></div>' });
      return;
    }
    if (P.adminToken()) { devPanel(); return; }
    ui.openSheet({
      html: '<h3>' + t('Режим разработчика') + '</h3>' +
        '<label class="field"><span>' + t('Пароль') + '</span><input type="password" id="devPass" autocomplete="off"></label>' +
        '<div class="form-err" id="devErr"></div>' +
        '<div class="btn-col"><button class="btn btn-primary" id="devGo">' + t('Войти') + '</button>' +
        '<button class="btn btn-ghost" data-close>' + t('Отмена') + '</button></div>',
      onMount(el, api) {
        const inp = el.querySelector('#devPass');
        setTimeout(() => inp.focus(), 250);
        const go = async () => {
          const err = el.querySelector('#devErr');
          err.textContent = '';
          try {
            await P.adminLogin(inp.value);
            api.close();
            devPanel();
          } catch (e) {
            const d = e.data || {};
            err.textContent = d.error === 'locked' ? t('Слишком много попыток. Попробуйте через час.')
              : d.error === 'wrong' ? t('Неверный пароль. Осталось попыток: {0}', d.left)
                : t('Доступ запрещён.');
            ui.haptic('error');
          }
        };
        el.querySelector('#devGo').addEventListener('click', go);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      },
    });
  }

  function devPanel() {
    const P = PF.premium;
    ui.openSheet({
      html: '<h3>🛠 ' + t('Режим разработчика') + '</h3>' +
        '<div class="card list"><button class="row" id="devSelf">⭐<span>' + t('Мой Premium (навсегда)') + '</span>' +
        '<b class="switch' + (P.isPremium() && P.state.source === 'gift' ? ' on' : '') + '"></b></button></div>' +
        '<div class="set-label dev-gap">' + t('Выдать или забрать Premium') + '</div>' +
        '<label class="field"><span>' + t('@username или числовой ID') + '</span><input id="devUser" autocomplete="off" placeholder="@username"></label>' +
        '<div class="seg seg-main" data-seg="dev-days">' +
        [[30, t('30 дней')], [365, t('1 год')], [0, t('Навсегда')]].map(([d, l], i) =>
          '<button class="seg-btn' + (i === 0 ? ' on' : '') + '" data-days="' + d + '">' + l + '</button>').join('') + '</div>' +
        '<div class="form-err" id="devMsg"></div>' +
        '<div class="btn-col"><button class="btn btn-primary" id="devGrant">' + t('Выдать Premium') + '</button>' +
        '<button class="btn btn-danger-ghost" id="devRevoke">' + t('Забрать Premium') + '</button></div>' +
        '<div class="set-label dev-gap">' + t('Выданные Premium') + '</div><div id="devList" class="note">…</div>' +
        '<div class="btn-col"><button class="btn btn-ghost" id="devOut">' + t('Выйти из режима разработчика') + '</button>' +
        '<button class="btn btn-ghost" data-close>' + t('Закрыть') + '</button></div>',
      onMount(el, api) {
        const $ = (q) => el.querySelector(q);
        let days = 30;
        const msg = (text, ok) => { $('#devMsg').textContent = text; $('#devMsg').classList.toggle('ok', !!ok); };
        const fail = (e) => {
          const d = e.data || {};
          msg(d.error === 'nouser' ? t('Пользователь не найден: он должен хотя бы раз открыть приложение.')
            : d.error === 'denied' ? t('Сессия разработчика истекла, войдите снова.') : t('Ошибка сервера.'));
          if (d.error === 'denied') { api.close(); }
        };
        const loadList = async () => {
          try {
            const r = await P.admin('list');
            $('#devList').innerHTML = r.gifts.length ? r.gifts.map((g) =>
              '<div class="kv"><span>' + u.esc(g.username ? '@' + g.username : g.name || String(g.id)) + ' <small>(' + g.id + ')</small></span><b>' +
              (g.until === 0 ? t('навсегда') : new Date(g.until * 1000).toLocaleDateString(PF.i18n.locale())) + '</b></div>').join('')
              : t('Пока никому не выдано.');
          } catch (e) { $('#devList').textContent = t('Не удалось загрузить список.'); }
        };
        el.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => {
          days = Number(b.dataset.days);
          el.querySelectorAll('[data-days]').forEach((x) => x.classList.toggle('on', x === b));
          ui.segs(el);
        }));
        $('#devSelf').addEventListener('click', async () => {
          const on = !$('#devSelf .switch').classList.contains('on');
          try {
            await P.admin('self', { on });
            $('#devSelf .switch').classList.toggle('on', on);
            await P.refresh();
            msg(on ? t('Ваш Premium включён.') : t('Ваш Premium выключен.'), true);
            loadList();
          } catch (e) { fail(e); }
        });
        const act = async (action) => {
          const who = $('#devUser').value.trim();
          if (!who) { msg(t('Укажите @username или ID.')); return; }
          try {
            const r = await P.admin(action, { user: who, days });
            const name = r.user && r.user.username ? '@' + r.user.username : String(r.id);
            msg(action === 'grant' ? t('Premium выдан: {0}', name) : t('Premium забран: {0}', name), true);
            loadList();
          } catch (e) { fail(e); }
        };
        $('#devGrant').addEventListener('click', () => act('grant'));
        $('#devRevoke').addEventListener('click', () => act('revoke'));
        $('#devOut').addEventListener('click', () => { P.adminLogout(); api.close(); ui.toast(t('Вы вышли из режима разработчика')); });
        loadList();
      },
    });
  }

  async function copyText() {
    const text = backupText();
    try {
      await navigator.clipboard.writeText(text);
      ui.toast(t('Скопировано. Вставьте текст в «Избранное» в Telegram или в заметки.'), true);
      return;
    } catch (e) { /* покажем текст вручную */ }
    ui.openSheet({
      html:
        '<h3>' + t('Резервная копия') + '</h3>' +
        '<p class="sheet-text">' + t('Выделите весь текст и скопируйте его, затем сохраните в надёжном месте.') + '</p>' +
        '<textarea class="code" id="bkText" readonly></textarea>' +
        '<div class="btn-col"><button class="btn btn-ghost" data-close>' + t('Готово') + '</button></div>',
      onMount(el) {
        const ta = el.querySelector('#bkText');
        ta.value = text;
        ta.focus();
        ta.select();
      },
    });
  }

  function pasteSheet() {
    ui.openSheet({
      html:
        '<h3>' + t('Загрузить из текста') + '</h3>' +
        '<p class="sheet-text">' + t('Вставьте сюда текст резервной копии.') + '</p>' +
        '<textarea class="code" id="pasteText" placeholder="{&quot;app&quot;:&quot;pixel-focus&quot;, …}"></textarea>' +
        '<div class="form-err" id="pasteErr"></div>' +
        '<div class="btn-col"><button class="btn btn-primary" id="pasteGo">' + t('Загрузить') + '</button>' +
        '<button class="btn btn-ghost" data-close>' + t('Отмена') + '</button></div>',
      onMount(el, api) {
        el.querySelector('#pasteGo').addEventListener('click', async () => {
          const ok = await importText(el.querySelector('#pasteText').value, (msg) => {
            el.querySelector('#pasteErr').textContent = msg;
          });
          if (ok) api.close();
        });
      },
    });
  }

  function onFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importText(String(reader.result), (msg) => ui.toast(msg, true));
    reader.onerror = () => ui.toast(t('Не удалось прочитать файл'), true);
    reader.readAsText(file);
  }

  async function importText(text, showError) {
    let parsed;
    try {
      parsed = store.parseBackup(text.trim());
    } catch (err) {
      showError(err.message);
      return false;
    }
    const when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString(PF.i18n.locale()) : t('неизвестно');
    const ok = await ui.confirm(
      t('Заменить текущие данные копией?') + '<br><br>' +
      t('Сейчас записей: {0}.', '<b>' + store.S.records.length + '</b>') + '<br>' +
      t('В копии записей: {0} (создана {1}).', '<b>' + parsed.records.length + '</b>', u.esc(when)),
      t('Заменить'), true);
    if (!ok) return false;
    try {
      await store.importBackup(parsed);
    } catch (err) {
      showError(t('Не удалось сохранить данные: {0}', err.message));
      return false;
    }
    ui.toast(t('Резервная копия загружена'));
    if (root && root.isConnected) render(root);
    return true;
  }

  PF.screens = PF.screens || {};
  PF.screens.settings = { render };
})(window.PF);
