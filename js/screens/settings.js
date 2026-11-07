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
      '<div class="card list danger-zone">' +
      '  <button class="row danger" data-action="wipe">' + ui.icon('trash') + '<span>' + t('Удалить все данные') + '</span></button>' +
      '</div>' +
      '<p class="note center">Pixel Focus · ' + t('версия {0}', window.PF_VERSION || '—') + '</p>';

    root.onclick = onClick;
    root.querySelector('#fileIn').addEventListener('change', onFile);
  }

  // Оформление: тема, основной цвет, фон главного экрана.
  function appearanceHtml() {
    const pr = store.S.prefs;
    const isEn = PF.i18n.lang === 'en';
    const themeBtn = (v, label) =>
      '<button class="seg-btn' + (pr.theme === v ? ' on' : '') + '" data-theme="' + v + '">' + label + '</button>';
    const accents =
      '<button class="accent-sw tg' + (pr.accent === 'auto' ? ' on' : '') + '" data-accent="auto" ' +
      'aria-label="' + u.esc(t('Как в Telegram')) + '" title="' + u.esc(t('Как в Telegram')) + '"></button>' +
      PF.ACCENTS.map((a, i) =>
        '<button class="accent-sw' + (pr.accent === i ? ' on' : '') + '" data-accent="' + i + '" style="--sw:' + a.hex + '" ' +
        'aria-label="' + u.esc(isEn ? a.en : a.ru) + '" title="' + u.esc(isEn ? a.en : a.ru) + '"></button>').join('');
    const bgs = PF.BACKGROUNDS.map((name, i) =>
      '<button class="bg-tile' + ((pr.bg || 0) === i ? ' on' : '') + '" data-bg="' + i + '" style="--tile:' + (i ? 'var(--bgimg-' + i + ')' : 'none') + '">' +
      '<span>' + t(name) + '</span></button>').join('');
    return '<div class="group-title">' + t('Оформление') + '</div>' +
      '<div class="card pad theme-card">' +
      '  <div><div class="set-label">' + t('Тема') + '</div><div class="seg seg-main" data-seg="theme">' +
      themeBtn('auto', t('Как в Telegram')) + themeBtn('light', t('Светлая')) + themeBtn('dark', t('Тёмная')) + '</div></div>' +
      '  <div><div class="set-label">' + t('Стиль интерфейса') + '</div><div class="seg seg-main" data-seg="glass">' +
      ['liquid', 'frosted'].map((g) =>
        '<button class="seg-btn' + ((pr.glass || 'liquid') === g ? ' on' : '') + '" data-glassopt="' + g + '">' +
        (g === 'liquid' ? 'Liquid Glass' : t('Матовое стекло')) + '</button>').join('') + '</div></div>' +
      '  <div><div class="set-label">' + t('Основной цвет') + '</div><div class="accents">' + accents + '</div></div>' +
      '  <div><div class="set-label">' + t('Фон главного экрана') + '</div><div class="bgs">' + bgs + '</div></div>' +
      '</div>';
  }

  async function onClick(e) {
    const th = e.target.closest('[data-theme]');
    if (th && th.classList.contains('seg-btn')) { store.setPref('theme', th.dataset.theme); ui.haptic('light'); return; }
    const gl = e.target.closest('[data-glassopt]');
    if (gl) { store.setPref('glass', gl.dataset.glassopt); ui.haptic('light'); return; }
    const ac = e.target.closest('.accent-sw[data-accent]');
    if (ac) { store.setPref('accent', ac.dataset.accent === 'auto' ? 'auto' : Number(ac.dataset.accent)); ui.haptic('light'); return; }
    const bgb = e.target.closest('.bg-tile[data-bg]');
    if (bgb) { store.setPref('bg', Number(bgb.dataset.bg)); ui.haptic('light'); return; }
    const langBtn = e.target.closest('[data-lang]');
    if (langBtn) {
      store.setPref('lang', langBtn.dataset.lang);
      ui.haptic('light');
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

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
