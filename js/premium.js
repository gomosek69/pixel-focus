// Premium: статус подписки, оплата в Telegram Stars, окно Premium, режим разработчика.
//
// Статус проверяет сервер (worker/worker.js) по подписи Telegram. Ответ запоминается на
// устройстве, чтобы при плохом интернете подписка не «пропадала».
// В обычном браузере (без Telegram) оплаты нет — есть тестовый переключатель в Настройках.
(function (PF) {
  'use strict';

  const t = (...a) => PF.t(...a);
  const LS_CACHE = 'pfx_premium';
  const LS_TEST = 'pfx_test_premium';
  const LS_ADMIN = 'pfx_admin_token';
  const PRICE = 149;
  // Префикс pfx_, а не pf_: ключи pf_* принадлежат хранилищу данных (storage.js) и чистятся им как лишние.

  const st = { premium: false, until: 0, forever: false, source: null, checked: false };
  const listeners = [];
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* нет */ } },
  };

  const inTelegram = () => !!(PF.tg && PF.tg.initData);
  const serverReady = () => !!PF.API_URL;

  try { Object.assign(st, JSON.parse(ls.get(LS_CACHE) || '{}')); } catch (e) { /* нет кэша */ }

  function isPremium() {
    if (!inTelegram()) return ls.get(LS_TEST) === '1';
    if (!st.premium) return false;
    return st.forever || st.until > Date.now() / 1000;
  }

  async function call(path, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch(PF.API_URL + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ initData: PF.tg.initData }, body || {})),
        signal: ctrl.signal,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error(data.error || 'http'); e.data = data; throw e; }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function refresh() {
    if (!inTelegram() || !serverReady()) return;
    const was = isPremium();
    try {
      const r = await call('/api/status');
      Object.assign(st, { premium: !!r.premium, until: r.until || 0, forever: !!r.forever, source: r.source, checked: true });
      ls.set(LS_CACHE, JSON.stringify({ premium: st.premium, until: st.until, forever: st.forever, source: st.source }));
      if (was !== isPremium()) emit();
    } catch (e) {
      console.warn('Статус Premium не получен', e);
    }
  }

  function setTestMode(on) {
    ls.set(LS_TEST, on ? '1' : null);
    emit();
  }

  // ---------- оплата ----------

  async function buy() {
    if (!inTelegram()) { PF.ui.toast(t('Оплата работает только внутри Telegram.'), true); return; }
    if (!serverReady()) { PF.ui.toast(t('Оплата скоро появится.'), true); return; }
    if (!PF.tg.openInvoice || !PF.tg.isVersionAtLeast('6.1')) { PF.ui.toast(t('Обновите Telegram, чтобы оформить подписку.'), true); return; }
    let link;
    try {
      link = (await call('/api/invoice')).link;
    } catch (e) {
      PF.ui.toast(t('Не удалось создать счёт. Попробуйте позже.'), true);
      return;
    }
    PF.tg.openInvoice(link, async (status) => {
      if (status !== 'paid') {
        if (status === 'failed') PF.ui.toast(t('Оплата не прошла.'), true);
        return;
      }
      PF.ui.haptic('success');
      // Сервер получает оплату чуть позже — несколько раз спрашиваем статус.
      for (let i = 0; i < 8 && !isPremium(); i++) {
        await refresh();
        if (!isPremium()) await new Promise((r) => setTimeout(r, 1500));
      }
      PF.ui.closeAllSheets && PF.ui.closeAllSheets();
      if (isPremium()) celebrate();
      else PF.ui.toast(t('Оплата получена. Premium включится через минуту.'), true);
    });
  }

  function celebrate() {
    PF.ui.toast(t('⭐ Premium активен! Спасибо за поддержку.'), true);
    const bonus = PF.store.claimDailyBonus();
    if (bonus) setTimeout(() => PF.ui.floatCoins(bonus), 600);
  }

  // ---------- окно Premium (реклама) ----------

  const PERKS = [
    ['∞', 'Безлимитные задачи', 'и запуск занятия прямо из задачи'],
    ['📊', 'Вся статистика', 'месяц, год и все 5 видов графиков'],
    ['📜', 'Вся история', 'и записи задним числом'],
    ['👑', 'Редкие и легендарные вещи', 'свечение, огонь, крылья'],
    ['💃', '20 танцев', 'включая «67», «Флосс» и «Лунную походку»'],
    ['🎨', 'Перекраска одежды', '13 цветов для любой вещи'],
    ['🪙', '+25% монет', 'за работу и учёбу'],
    ['🎁', '+30 монет каждый день', 'просто за то, что заходите'],
    ['✨', '3 эксклюзива', 'Золотая аура, Корона Premium и танец «Победный»'],
    ['🪟', 'Всё оформление', 'матовое стекло, цвета и фоны'],
  ];

  function heroLook() {
    return PF.store.look({ acc: 'acc_premcrown', dance: 'dance_victory' });
  }

  // reason — короткая причина, почему показываем окно (например, «У вас 3 из 3 задач»).
  function paywall(reason) {
    const on = isPremium();
    const u = PF.u;
    let foot;
    if (on) {
      const until = st.forever ? t('навсегда') : (st.until ? new Date(st.until * 1000).toLocaleDateString(PF.i18n.locale()) : '');
      foot = '<div class="pw-active">⭐ ' + (inTelegram()
        ? t('Premium активен {0}', st.forever ? until : t('до {0}', until))
        : t('Тестовый Premium включён (только в этом браузере)')) + '</div>' +
        '<p class="note center">' + t('Отменить автопродление можно в Telegram: Настройки → Telegram Stars.') + '</p>' +
        '<div class="btn-col"><button class="btn btn-ghost" data-close>' + t('Закрыть') + '</button></div>';
    } else {
      const can = inTelegram() && serverReady();
      foot = '<div class="btn-col"><button class="btn btn-premium" id="pwBuy"' + (can ? '' : ' disabled') + '>' +
        t('Оформить за {0} ⭐ в месяц', PRICE) + '</button>' +
        '<button class="btn btn-ghost" data-close>' + t('Позже') + '</button></div>' +
        '<p class="note center">' + (!inTelegram()
          ? t('Оплата работает внутри Telegram. Для проверки в браузере включите тестовый Premium в Настройках.')
          : !serverReady() ? t('Оплата скоро появится.')
            : t('Оплата звёздами Telegram. Подписка продлевается каждые 30 дней, отменить можно в любой момент. Условия — команда /terms в боте.')) + '</p>';
    }
    PF.ui.openSheet({
      html:
        '<div class="pw-hero">' + PF.char.svg(heroLook(), 192) + '<div class="pw-badge">PREMIUM</div></div>' +
        '<h3 class="center pw-title">Pixel Focus Premium</h3>' +
        (reason && !on ? '<div class="pw-reason">' + u.esc(reason) + '</div>' : '') +
        '<div class="pw-perks">' + PERKS.map(([ic, a, b]) =>
          '<div class="pw-perk"><span class="pw-ic">' + ic + '</span><span><b>' + t(a) + '</b><small>' + t(b) + '</small></span></div>').join('') + '</div>' +
        foot,
      onMount(el) {
        const b = el.querySelector('#pwBuy');
        if (b) b.addEventListener('click', buy);
      },
    });
  }

  // Значок-замочек для премиальных функций.
  const lock = () => '<span class="plock" aria-label="Premium">⭐</span>';

  // ---------- режим разработчика ----------

  const adminToken = () => ls.get(LS_ADMIN);

  async function adminLogin(password) {
    const r = await call('/api/admin/login', { password });
    ls.set(LS_ADMIN, r.token);
    return r;
  }
  function adminLogout() { ls.set(LS_ADMIN, null); }
  async function admin(action, extra) {
    try {
      return await call('/api/admin', Object.assign({ token: adminToken(), action }, extra || {}));
    } catch (e) {
      if (e.message === 'denied') adminLogout();
      throw e;
    }
  }

  PF.premium = {
    PRICE,
    get state() { return st; },
    isPremium,
    inTelegram,
    serverReady,
    refresh,
    buy,
    paywall,
    lock,
    setTestMode,
    testMode: () => ls.get(LS_TEST) === '1',
    on: (fn) => listeners.push(fn),
    adminToken,
    adminLogin,
    adminLogout,
    admin,
  };
})(window.PF);
