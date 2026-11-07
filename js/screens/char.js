// Вкладка «Персонаж»: внешность, гардероб (с перекраской) и магазин.
(function (PF) {
  'use strict';

  const u = PF.u;
  const ui = PF.ui;
  const store = PF.store;
  const C = PF.char;
  const esc = u.esc;
  const t = PF.t;
  const nm = (it) => esc(C.itemName(it));

  let root = null;
  let mode = 'wardrobe'; // wardrobe | shop
  let cat = 'hair';

  function render(el) {
    root = el;
    const b = store.balance();
    root.innerHTML =
      '<header class="top top-row"><h1>' + t('Персонаж') + '</h1>' +
      '  <button class="balance' + (Math.round(b) < 0 ? ' neg' : '') + '" data-action="rates">' + ui.coin() + '<span>' + u.coins(b) + '</span></button></header>' +
      '<div class="card char-stage">' + C.svg(store.look(), 224) + '</div>' +
      '<div class="seg seg-main">' +
      '  <button class="seg-btn' + (mode === 'wardrobe' ? ' on' : '') + '" data-mode="wardrobe">' + t('Гардероб') + '</button>' +
      '  <button class="seg-btn' + (mode === 'shop' ? ' on' : '') + '" data-mode="shop">' + t('Магазин') + '</button>' +
      '</div>' +
      (mode === 'wardrobe' ? lookHtml() : '') +
      '<div class="cat-tabs">' + C.CATS.map((c) =>
        '<button class="cat-tab' + (c.id === cat ? ' on' : '') + '" data-cat="' + c.id + '">' + t(c.name) + '</button>').join('') + '</div>' +
      (mode === 'wardrobe' ? colorHtml() : '') +
      '<div class="items">' + (mode === 'wardrobe' ? wardrobeItems() : shopItems()) + '</div>';
    root.onclick = onClick;
  }

  // ---------- внешность ----------

  function swatches(field, colors, names) {
    return '<div class="swatches">' + colors.map((col, i) =>
      '<button class="swatch' + (store.S.char[field] === i ? ' on' : '') + '" style="--sw:' + col + '" ' +
      'data-look="' + field + '" data-val="' + i + '" aria-label="' + esc(names ? t(names[i]) : String(i + 1)) + '"></button>').join('') + '</div>';
  }

  function lookHtml() {
    const ch = store.S.char;
    return '<div class="group-title">' + t('Внешность') + '</div>' +
      '<div class="card pad look">' +
      '  <div class="look-row"><span>' + t('Пол') + '</span><div class="seg seg-small">' +
      '    <button class="seg-btn' + (ch.g === 'm' ? ' on' : '') + '" data-look="g" data-val="m">' + t('Мужской') + '</button>' +
      '    <button class="seg-btn' + (ch.g === 'f' ? ' on' : '') + '" data-look="g" data-val="f">' + t('Женский') + '</button></div></div>' +
      '  <div class="look-row"><span>' + t('Кожа') + '</span>' + swatches('skin', C.SKINS) + '</div>' +
      '  <div class="look-row"><span>' + t('Глаза') + '</span>' + swatches('eyes', C.EYES, C.EYE_NAMES) + '</div>' +
      '  <div class="look-row"><span>' + t('Волосы') + '</span>' + swatches('hc', C.HAIR, C.HAIR_NAMES) + '</div>' +
      '</div>' +
      '<div class="group-title">' + t('Одежда') + '</div>';
  }

  // ---------- цвет надетой вещи ----------

  function colorHtml() {
    const id = store.equipped()[cat];
    const it = id && C.byId[id];
    if (!it) return '';
    if (!it.pal) {
      return cat === 'hair' ? '<p class="note color-note">' + t('Цвет обычных причёсок меняется бесплатно в разделе «Волосы» выше.') + '</p>' : '';
    }
    const cur = store.colorOf(id);
    const price = C.colorPrice(it);
    const orig = C.recolor(it.pal, null);
    const firstOrig = orig[Object.keys(orig)[0]];
    let sw = '<button class="cswatch' + (cur === null ? ' on' : '') + '" data-color="orig" style="--sw:' + firstOrig + '" ' +
      'aria-label="' + t('Исходный') + '"><span class="cs-label">' + t('Исходный') + '</span></button>';
    C.PALETTE.forEach((pc, i) => {
      const owned = store.ownsColor(id, i);
      sw += '<button class="cswatch' + (cur === i ? ' on' : '') + (owned ? '' : ' locked') + '" data-color="' + i + '" ' +
        'style="--sw:' + pc.hex + '" aria-label="' + esc(C.colorName(i)) + '">' + (owned ? '' : '<i class="lock"></i>') + '</button>';
    });
    return '<div class="card pad color-card">' +
      '<div class="color-head"><b>' + t('Цвет: {0}', nm(it)) + '</b>' +
      '<span class="hint">' + t('новый цвет — {0} мон.', u.num(price)) + '</span></div>' +
      '<div class="cswatches">' + sw + '</div></div>';
  }

  function onColor(val) {
    const id = store.equipped()[cat];
    const it = C.byId[id];
    if (!it || !it.pal) return;
    if (val === 'orig') { store.setColor(id, null); return; }
    const idx = Number(val);
    if (store.ownsColor(id, idx)) { store.setColor(id, idx); ui.haptic('light'); return; }
    openColorBuy(it, idx);
  }

  // Окно покупки цвета: примерка и покупка.
  function openColorBuy(it, idx) {
    const err = store.cantBuyColor(it.id, idx);
    const price = C.colorPrice(it);
    const colOv = {};
    colOv[it.cat] = idx;
    ui.openSheet({
      html:
        '<div class="try-pic">' + C.svg(store.look(null, colOv), 192) + '</div>' +
        '<h3 class="center">' + nm(it) + ' · ' + esc(C.colorName(idx)) + '</h3>' +
        '<div class="try-price">' + ui.coin('big') + u.num(price) + '</div>' +
        (err ? '<div class="form-err center">' + esc(err) + '</div>' : '') +
        '<div class="btn-col"><button class="btn btn-primary" id="cBuy"' + (err ? ' disabled' : '') + '>' + t('Купить цвет') + '</button>' +
        '<button class="btn btn-ghost" data-close>' + t('Закрыть') + '</button></div>',
      onMount(el, api) {
        const b = el.querySelector('#cBuy');
        if (b && !err) b.addEventListener('click', () => {
          const e2 = store.buyColor(it.id, idx);
          if (e2) { ui.toast(e2); return; }
          ui.haptic('success');
          api.close();
          ui.toast(t('Цвет куплен: {0}', C.colorName(idx)));
        });
      },
    });
  }

  // ---------- карточки вещей ----------

  function card(it, opts) {
    const r = C.RARITY[it.rarity];
    const override = {};
    override[it.cat] = it.id;
    return '<button class="item r-' + it.rarity + (opts.on ? ' on' : '') + '" data-item="' + it.id + '">' +
      '<span class="item-pic">' + C.svg(store.look(override), 96) + '</span>' +
      '<span class="item-name">' + nm(it) + '</span>' +
      '<span class="item-sub" style="color:' + r.color + '">' + t(C.STYLES[it.style]) + ' · ' + t(r.name) + '</span>' +
      '<span class="item-foot">' + opts.foot + '</span></button>';
  }

  function wardrobeItems() {
    const eq = store.equipped();
    const list = C.ITEMS.filter((it) => it.cat === cat && store.owns(it.id));
    let html = list.map((it) => card(it, {
      on: eq[cat] === it.id,
      foot: eq[cat] === it.id ? '<b class="badge">' + t('Надето') + '</b>' : t('Надеть'),
    })).join('');
    if (cat === 'acc') {
      html = '<button class="item' + (!eq.acc ? ' on' : '') + '" data-item="none">' +
        '<span class="item-pic">' + C.svg(store.look({ acc: null }), 96) + '</span>' +
        '<span class="item-name">' + t('Без аксессуара') + '</span><span class="item-sub">&nbsp;</span>' +
        '<span class="item-foot">' + (!eq.acc ? '<b class="badge">' + t('Надето') + '</b>' : t('Выбрать')) + '</span></button>' + html;
    }
    if (!list.some((it) => it.rarity !== 'base')) {
      html += '<div class="items-hint">' + t('Новые вещи можно купить в магазине.') + '</div>';
    }
    return html;
  }

  function shopItems() {
    const list = C.ITEMS.filter((it) => it.cat === cat && it.rarity !== 'base').sort((a, b) => a.price - b.price);
    return list.map((it) => card(it, {
      on: false,
      foot: store.owns(it.id) ? '<b class="badge">' + t('Куплено') + '</b>' :
        '<span class="price">' + ui.coin() + u.num(it.price) + '</span>',
    })).join('');
  }

  // ---------- нажатия ----------

  function onClick(e) {
    const tg = e.target.closest('[data-mode],[data-cat],[data-look],[data-item],[data-color],[data-action]');
    if (!tg) return;
    if (tg.dataset.mode) {
      mode = tg.dataset.mode;
      render(root);
    } else if (tg.dataset.cat) {
      cat = tg.dataset.cat;
      render(root);
    } else if (tg.dataset.look) {
      const f = tg.dataset.look;
      store.setLook(f, f === 'g' ? tg.dataset.val : Number(tg.dataset.val));
      ui.haptic('light');
    } else if (tg.dataset.color) {
      onColor(tg.dataset.color);
    } else if (tg.dataset.item) {
      if (mode === 'wardrobe') onWardrobe(tg.dataset.item);
      else openItem(tg.dataset.item);
    } else if (tg.dataset.action === 'rates' && PF.openRates) {
      PF.openRates();
    }
  }

  function onWardrobe(id) {
    if (id === 'none') { store.unequip('acc'); return; }
    const it = C.byId[id];
    const eq = store.equipped();
    if (eq[it.cat] === id) {
      // Повторное нажатие снимает вещь (кроме причёски и базовых вещей).
      if (it.cat !== 'hair' && it.rarity !== 'base') store.unequip(it.cat);
    } else {
      store.equip(id);
    }
    ui.haptic('light');
  }

  // Окно вещи в магазине: примерка и покупка.
  function openItem(id) {
    const it = C.byId[id];
    const r = C.RARITY[it.rarity];
    const owned = store.owns(id);
    const err = owned ? null : store.cantBuy(id);
    const override = {};
    override[it.cat] = id;
    ui.openSheet({
      html:
        '<div class="try-pic r-' + it.rarity + '">' + C.svg(store.look(override), 192) + '</div>' +
        '<h3 class="center">' + nm(it) + '</h3>' +
        '<div class="center item-sub" style="color:' + r.color + '">' + t(C.STYLES[it.style]) + ' · ' + t(r.name) + '</div>' +
        (it.pal ? '<div class="center hint">' + t('После покупки цвет можно сменить в гардеробе.') + '</div>' : '') +
        (owned
          ? '<div class="btn-col"><button class="btn btn-primary" id="iWear">' + t('Надеть') + '</button>'
          : '<div class="try-price">' + ui.coin('big') + u.num(it.price) + '</div>' +
            (err ? '<div class="form-err center">' + esc(err) + '</div>' : '') +
            '<div class="btn-col"><button class="btn btn-primary" id="iBuy"' + (err ? ' disabled' : '') + '>' + t('Купить') + '</button>') +
        '<button class="btn btn-ghost" data-close>' + t('Закрыть') + '</button></div>',
      onMount(el, api) {
        const wear = el.querySelector('#iWear');
        if (wear) wear.addEventListener('click', () => {
          store.equip(id);
          api.close();
          ui.toast(t('Надето: {0}', C.itemName(it)));
        });
        const buyBtn = el.querySelector('#iBuy');
        if (buyBtn && !err) buyBtn.addEventListener('click', async () => {
          const ok = await ui.confirm(t('Купить «{0}» за {1} мон.?', nm(it), u.num(it.price)), t('Купить'));
          if (!ok) return;
          const e2 = store.buy(id);
          if (e2) { ui.toast(e2); return; }
          ui.haptic('success');
          api.close();
          ui.toast(t('Куплено и надето: {0}', C.itemName(it)));
        });
      },
    });
  }

  PF.screens = PF.screens || {};
  PF.screens.char = { render };
})(window.PF);
