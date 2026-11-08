// Общие элементы интерфейса: иконки, всплывающие окна снизу, подсказки, подтверждения.
(function (PF) {
  'use strict';

  const ICONS = {
    work: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    study: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    rest: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><path d="M6 1v3M10 1v3M14 1v3"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
    stats: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
    percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    pie: '<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M15 3.6A9 9 0 0 1 20.4 9H15z"/>',
    lines: '<path d="M3 17c3-5 5-8 8-5s5 2 10-7"/>',
    area: '<path d="M3 20l6-7 4 3 8-10v14z"/>',
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
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    minus: '<path d="M5 12h14"/>',
    star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    sport: '<path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12"/>',
    game: '<rect x="2" y="7" width="20" height="11" rx="4"/><path d="M7 10.5v4M5 12.5h4M15 11.5h.01M18 13.5h.01"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    code: '<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>',
    art: '<path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2.5a2 2 0 0 0-1.5 3.3A1.7 1.7 0 0 1 12 22z"/><circle cx="7.5" cy="11" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16.5" cy="11" r="1"/>',
    home: '<path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
    food: '<path d="M3 2v7a3 3 0 0 0 6 0V2M6 2v20M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3zM21 15v7"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
    cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  };

  function icon(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || '') + '</svg>';
  }

  // ---------- пиксельная монетка ----------
  // Рисуется кодом из «карты» 10×10: каждая буква — цвет пикселя.
  const COIN_MAP = [
    '..oooooo..',
    '.oyyyyyyo.',
    'oyhhyyyydo',
    'oyhyyddydo',
    'oyyydyydyo',
    'oyyydyydyo',
    'oyyyyddydo',
    'oyyyyyyddo',
    '.oddddddo.',
    '..oooooo..',
  ];
  const COIN_COLORS = { o: '#9a5b13', y: '#f6c343', h: '#fff1b8', d: '#d99a1e' };
  let coinSvgInner = '';
  COIN_MAP.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (COIN_COLORS[ch]) coinSvgInner += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + COIN_COLORS[ch] + '"/>';
    });
  });
  function coin(cls) {
    return '<svg class="coin ' + (cls || '') + '" viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true">' + coinSvgInner + '</svg>';
  }

  // ---------- скользящий индикатор переключателей ----------
  // У каждого .seg есть плашка .seg-ind под выбранной кнопкой. При перерисовке экрана
  // плашка ставится на старое место (запомненное по data-seg) и плавно едет к новому.
  const segMem = {};
  function segs(scope) {
    (scope || document).querySelectorAll('.seg').forEach((seg) => {
      let ind = seg.querySelector(':scope > .seg-ind');
      if (!ind) {
        ind = document.createElement('span');
        ind.className = 'seg-ind';
        seg.prepend(ind);
      }
      const on = seg.querySelector(':scope > .seg-btn.on');
      if (!on) { ind.style.opacity = '0'; return; }
      const key = seg.dataset.seg || '';
      const x = on.offsetLeft, w = on.offsetWidth;
      const col = getComputedStyle(on).getPropertyValue('--c').trim();
      ind.style.backgroundColor = col || '';
      ind.style.top = on.offsetTop + 'px';
      ind.style.height = on.offsetHeight + 'px';
      const prev = key ? segMem[key] : null;
      const fresh = !ind.dataset.ready;
      if (fresh && prev && (prev.x !== x || prev.w !== w)) {
        ind.style.transition = 'none';
        ind.style.transform = 'translateX(' + prev.x + 'px)';
        ind.style.width = prev.w + 'px';
        void ind.offsetWidth; // зафиксировать старое положение
        ind.style.transition = '';
      } else if (fresh) {
        ind.style.transition = 'none';
        ind.style.transform = 'translateX(' + x + 'px)';
        ind.style.width = w + 'px';
        void ind.offsetWidth;
        ind.style.transition = '';
      }
      ind.dataset.ready = '1';
      ind.style.transform = 'translateX(' + x + 'px)';
      ind.style.width = w + 'px';
      ind.style.opacity = '1';
      if (key) segMem[key] = { x, w };
    });
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
    requestAnimationFrame(() => segs(api.el));
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
          '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-ok>' + PF.u.esc(okLabel || PF.t('Да')) + '</button>' +
          '<button class="btn btn-ghost" data-close>' + PF.t('Отмена') + '</button></div>',
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

  // Всплывающие монеты над балансом (или в правом верхнем углу).
  function floatCoins(amount) {
    const n = Math.round(amount);
    if (!n) return;
    const anchor = document.querySelector('.balance');
    const r = anchor ? anchor.getBoundingClientRect() : { left: window.innerWidth - 80, width: 60, bottom: 60 };
    const el = document.createElement('div');
    el.className = 'float-coins' + (n < 0 ? ' neg' : '');
    el.innerHTML = coin() + '<span>' + PF.u.coins(n, true) + '</span>';
    el.style.left = (r.left + r.width / 2) + 'px';
    el.style.top = (r.bottom + 6) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1700);
  }

  PF.ui = { icon, coin, segs, floatCoins, openSheet, closeTopSheet, hasOpenSheet, confirm, toast, haptic };
})(window.PF);
