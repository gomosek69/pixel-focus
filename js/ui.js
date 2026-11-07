// Общие элементы интерфейса: иконки, всплывающие окна снизу, подсказки, подтверждения.
(function (PF) {
  'use strict';

  const ICONS = {
    work: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    study: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    rest: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><path d="M6 1v3M10 1v3M14 1v3"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
    stats: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
    char: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    tasks: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    paste: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
    trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  };

  function icon(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || '') + '</svg>';
  }

  // ---------- нижние всплывающие окна (sheet) ----------

  const stack = [];

  function syncBackButton() {
    const tg = PF.tg;
    if (!tg || !tg.BackButton || !tg.isVersionAtLeast || !tg.isVersionAtLeast('6.1')) return;
    const top = stack[stack.length - 1];
    if (top && top.dismissible) tg.BackButton.show();
    else tg.BackButton.hide();
  }

  function openSheet(opts) {
    const back = document.createElement('div');
    back.className = 'sheet-back';
    back.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + opts.html + '</div>';
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('open'));

    const api = {
      el: back.querySelector('.sheet'),
      dismissible: opts.dismissible !== false,
      close() {
        const i = stack.indexOf(api);
        if (i < 0) return;
        stack.splice(i, 1);
        back.classList.remove('open');
        setTimeout(() => back.remove(), 220);
        syncBackButton();
        if (opts.onClose) opts.onClose();
      },
    };
    if (api.dismissible) {
      back.addEventListener('click', (e) => { if (e.target === back) api.close(); });
    }
    api.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) api.close();
    });
    stack.push(api);
    syncBackButton();
    if (opts.onMount) opts.onMount(api.el, api);
    return api;
  }

  function closeTopSheet() {
    const top = stack[stack.length - 1];
    if (top && top.dismissible) { top.close(); return true; }
    return false;
  }

  const hasOpenSheet = () => stack.length > 0;

  // ---------- подтверждение ----------

  function confirm(text, okLabel, danger) {
    return new Promise((resolve) => {
      let answered = false;
      openSheet({
        html:
          '<p class="sheet-text">' + text + '</p>' +
          '<div class="btn-col">' +
          '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-ok>' + PF.u.esc(okLabel || 'Да') + '</button>' +
          '<button class="btn btn-ghost" data-close>Отмена</button></div>',
        onMount(el, api) {
          el.querySelector('[data-ok]').addEventListener('click', () => {
            answered = true;
            api.close();
            resolve(true);
          });
        },
        onClose() { if (!answered) resolve(false); },
      });
    });
  }

  // ---------- всплывающая подсказка ----------

  let toastTimer = null;
  function toast(msg, long) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), long ? 5000 : 2500);
  }

  // Лёгкая вибрация в Telegram (в браузере ничего не делает)
  function haptic(kind) {
    const tg = PF.tg;
    try {
      if (!tg || !tg.HapticFeedback || !tg.isVersionAtLeast('6.1')) return;
      if (kind === 'success' || kind === 'error' || kind === 'warning') tg.HapticFeedback.notificationOccurred(kind);
      else tg.HapticFeedback.impactOccurred(kind || 'light');
    } catch (e) { /* не важно */ }
  }

  PF.ui = { icon, openSheet, closeTopSheet, hasOpenSheet, confirm, toast, haptic };
})(window.PF);
