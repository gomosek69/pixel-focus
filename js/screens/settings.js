// Вкладка «Настройки». На этапе 1 — только резервная копия и сведения о хранилище.
(function (PF) {
  'use strict';

  const u = PF.u;
  const ui = PF.ui;
  const store = PF.store;

  let root = null;

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
      ? 'В облаке Telegram. Данные доступны на всех ваших устройствах, где открыт этот бот.'
      : 'В памяти этого браузера. Если очистить данные браузера, записи пропадут — делайте резервные копии.';
    root.innerHTML =
      '<header class="top"><h1>Настройки</h1></header>' +
      (PF.storageWarning ? '<div class="card warn">' + u.esc(PF.storageWarning) + '</div>' : '') +
      '<div class="group-title">Резервная копия</div>' +
      '<div class="card list">' +
      '  <button class="row" data-action="download">' + ui.icon('download') + '<span>Сохранить в файл</span></button>' +
      '  <button class="row" data-action="copy">' + ui.icon('copy') + '<span>Скопировать как текст</span></button>' +
      '  <button class="row" data-action="upload">' + ui.icon('upload') + '<span>Загрузить из файла</span></button>' +
      '  <button class="row" data-action="paste">' + ui.icon('paste') + '<span>Загрузить из текста</span></button>' +
      '</div>' +
      '<p class="note">Если в Telegram файл не сохраняется, нажмите «Скопировать как текст» и отправьте текст себе в «Избранное». ' +
      'Загрузка копии заменяет все текущие данные.</p>' +
      '<input type="file" id="fileIn" accept=".json,application/json,text/plain" hidden>' +
      '<div class="group-title">Хранилище</div>' +
      '<div class="card pad">' +
      '  <div class="kv"><span>Где хранятся данные</span></div><p class="note tight">' + where + '</p>' +
      '  <div class="kv"><span>Записей</span><b>' + store.S.records.length + '</b></div>' +
      (cloud ? '<div class="kv"><span>Занято ячеек облака</span><b>' + store.keyCount() + ' из 1024</b></div>' : '') +
      '</div>' +
      '<div class="card list danger-zone">' +
      '  <button class="row danger" data-action="wipe">' + ui.icon('trash') + '<span>Удалить все данные</span></button>' +
      '</div>' +
      '<p class="note center">Pixel Focus · этап 1</p>';

    root.onclick = onClick;
    root.querySelector('#fileIn').addEventListener('change', onFile);
  }

  async function onClick(e) {
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
        ui.toast('Файл сохранён (проверьте папку «Загрузки»)');
      } catch (err) {
        ui.toast('Не получилось сохранить файл. Используйте «Скопировать как текст».', true);
      }
    } else if (action === 'copy') {
      copyText();
    } else if (action === 'upload') {
      root.querySelector('#fileIn').click();
    } else if (action === 'paste') {
      pasteSheet();
    } else if (action === 'wipe') {
      const ok = await ui.confirm('Удалить все записи и текущее занятие? Это нельзя отменить. Сначала лучше сохранить резервную копию.', 'Удалить всё', true);
      if (!ok) return;
      await store.wipe();
      ui.toast('Все данные удалены');
      render(root);
    }
  }

  async function copyText() {
    const text = backupText();
    try {
      await navigator.clipboard.writeText(text);
      ui.toast('Скопировано. Вставьте текст в «Избранное» в Telegram или в заметки.', true);
      return;
    } catch (e) { /* покажем текст вручную */ }
    ui.openSheet({
      html:
        '<h3>Резервная копия</h3>' +
        '<p class="sheet-text">Выделите весь текст и скопируйте его, затем сохраните в надёжном месте.</p>' +
        '<textarea class="code" id="bkText" readonly></textarea>' +
        '<div class="btn-col"><button class="btn btn-ghost" data-close>Готово</button></div>',
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
        '<h3>Загрузить из текста</h3>' +
        '<p class="sheet-text">Вставьте сюда текст резервной копии.</p>' +
        '<textarea class="code" id="pasteText" placeholder="{&quot;app&quot;:&quot;pixel-focus&quot;, …}"></textarea>' +
        '<div class="form-err" id="pasteErr"></div>' +
        '<div class="btn-col"><button class="btn btn-primary" id="pasteGo">Загрузить</button>' +
        '<button class="btn btn-ghost" data-close>Отмена</button></div>',
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
    reader.onerror = () => ui.toast('Не удалось прочитать файл', true);
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
    const when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString('ru-RU') : 'неизвестно';
    const ok = await ui.confirm(
      'Заменить текущие данные копией?<br><br>Сейчас записей: <b>' + store.S.records.length + '</b>.<br>' +
      'В копии записей: <b>' + parsed.records.length + '</b> (создана ' + u.esc(when) + ').',
      'Заменить', true);
    if (!ok) return false;
    try {
      await store.importBackup(parsed);
    } catch (err) {
      showError('Не удалось сохранить данные: ' + err.message);
      return false;
    }
    ui.toast('Резервная копия загружена');
    if (root && root.isConnected) render(root);
    return true;
  }

  PF.screens = PF.screens || {};
  PF.screens.settings = { title: 'Настройки', render };
})(window.PF);
