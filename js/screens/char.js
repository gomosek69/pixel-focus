// Вкладка «Персонаж»: внешность, гардероб и магазин.
(function (PF) {
  'use strict';

  const u = PF.u;
  const ui = PF.ui;
  const store = PF.store;
  const C = PF.char;
  const esc = u.esc;

  let root = null;
  let mode = 'wardrobe'; // wardrobe | shop
  let cat = 'hair';

  function render(el) {
    root = el;
    const b = store.balance();
    root.innerHTML =
      '<header class="top top-row"><h1>Персонаж</h1>' +
      '  <button class="balance' + (Math.round(b) < 0 ? ' neg' : '') + '" data-action="rates">' + ui.coin() + '<span>' + u.coins(b) + '</span></button></header>' +
      '<div class="card char-stage">' + C.svg(store.look(), 224) + '</div>' +
      '<div class="seg seg-main">' +
      '  <button class="seg-btn' + (mode === 'wardrobe' ? ' on' : '') + '" data-mode="wardrobe">Гардероб</button>' +
      '  <button class="seg-btn' + (mode === 'shop' ? ' on' : '') + '" data-mode="shop">Магазин</button>' +
      '</div>' +
      (mode === 'wardrobe' ? lookHtml() : '') +
      '<div class="cat-tabs">' + C.CATS.map((c) =>
        '<button class="cat-tab' + (c.id === cat ? ' on' : '') + '" data-cat="' + c.id + '">' + c.name + '</button>').join('') + '</div>' +
      '<div class="items">' + (mode === 'wardrobe' ? wardrobeItems() : shopItems()) + '</div>';
    root.onclick = onClick;
  }

  // ---------- внешность ----------

  function swatches(field, colors, names) {
    return '<div class="swatches">' + colors.map((col, i) =>
      '<button class="swatch' + (store.S.char[field] === i ? ' on' : '') + '" style="--sw:' + col + '" ' +
      'data-look="' + field + '" data-val="' + i + '" aria-label="' + esc(names ? names[i] : String(i + 1)) + '"></button>').join('') + '</div>';
  }

  function lookHtml() {
    const ch = store.S.char;
    return '<div class="group-title">Внешность</div>' +
      '<div class="card pad look">' +
      '  <div class="look-row"><span>Пол</span><div class="seg seg-small">' +
      '    <button class="seg-btn' + (ch.g === 'm' ? ' on' : '') + '" data-look="g" data-val="m">Мужской</button>' +
      '    <button class="seg-btn' + (ch.g === 'f' ? ' on' : '') + '" data-look="g" data-val="f">Женский</button></div></div>' +
      '  <div class="look-row"><span>Кожа</span>' + swatches('skin', C.SKINS) + '</div>' +
      '  <div class="look-row"><span>Глаза</span>' + swatches('eyes', C.EYES, C.EYE_NAMES) + '</div>' +
      '  <div class="look-row"><span>Волосы</span>' + swatches('hc', C.HAIR, C.HAIR_NAMES) + '</div>' +
      '</div>' +
      '<div class="group-title">Одежда</div>';
  }

  // ---------- карточки вещей ----------

  function card(it, opts) {
    const r = C.RARITY[it.rarity];
    const override = {};
    override[it.cat] = it.id;
    return '<button class="item r-' + it.rarity + (opts.on ? ' on' : '') + '" data-item="' + it.id + '">' +
      '<span class="item-pic">' + C.svg(store.look(override), 96) + '</span>' +
      '<span class="item-name">' + esc(it.name) + '</span>' +
      '<span class="item-sub" style="color:' + r.color + '">' + C.STYLES[it.style] + ' · ' + r.name + '</span>' +
      '<span class="item-foot">' + opts.foot + '</span></button>';
  }

  function wardrobeItems() {
    const eq = store.equipped();
    const list = C.ITEMS.filter((it) => it.cat === cat && store.owns(it.id));
    let html = list.map((it) => card(it, {
      on: eq[cat] === it.id,
      foot: eq[cat] === it.id ? '<b class="badge">Надето</b>' : 'Надеть',
    })).join('');
    if (cat === 'acc') {
      html = '<button class="item' + (!eq.acc ? ' on' : '') + '" data-item="none">' +
        '<span class="item-pic">' + C.svg(store.look({ acc: null }), 96) + '</span>' +
        '<span class="item-name">Без аксессуара</span><span class="item-sub">&nbsp;</span>' +
        '<span class="item-foot">' + (!eq.acc ? '<b class="badge">Надето</b>' : 'Выбрать') + '</span></button>' + html;
    }
    const bought = C.ITEMS.some((it) => it.cat === cat && it.rarity !== 'base');
    const ownsBought = list.some((it) => it.rarity !== 'base');
    if (bought && !ownsBought) {
      html += '<div class="items-hint">Новые вещи можно купить в магазине.</div>';
    }
    return html;
  }

  function shopItems() {
    const list = C.ITEMS.filter((it) => it.cat === cat && it.rarity !== 'base').sort((a, b) => a.price - b.price);
    return list.map((it) => card(it, {
      on: false,
      foot: store.owns(it.id) ? '<b class="badge">Куплено</b>' :
        '<span class="price">' + ui.coin() + it.price.toLocaleString('ru-RU') + '</span>',
    })).join('');
  }

  // ---------- нажатия ----------

  function onClick(e) {
    const t = e.target.closest('[data-mode],[data-cat],[data-look],[data-item],[data-action]');
    if (!t) return;
    if (t.dataset.mode) {
      mode = t.dataset.mode;
      render(root);
    } else if (t.dataset.cat) {
      cat = t.dataset.cat;
      render(root);
    } else if (t.dataset.look) {
      const f = t.dataset.look;
      store.setLook(f, f === 'g' ? t.dataset.val : Number(t.dataset.val));
      ui.haptic('light');
    } else if (t.dataset.item) {
      if (mode === 'wardrobe') onWardrobe(t.dataset.item);
      else openItem(t.dataset.item);
    } else if (t.dataset.action === 'rates' && PF.openRates) {
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
        '<h3 class="center">' + esc(it.name) + '</h3>' +
        '<div class="center item-sub" style="color:' + r.color + '">' + C.STYLES[it.style] + ' · ' + r.name + '</div>' +
        (owned
          ? '<div class="btn-col"><button class="btn btn-primary" id="iWear">Надеть</button>'
          : '<div class="try-price">' + ui.coin('big') + it.price.toLocaleString('ru-RU') + '</div>' +
            (err ? '<div class="form-err center">' + esc(err) + '</div>' : '') +
            '<div class="btn-col"><button class="btn btn-primary" id="iBuy"' + (err ? ' disabled' : '') + '>Купить</button>') +
        '<button class="btn btn-ghost" data-close>Закрыть</button></div>',
      onMount(el, api) {
        const wear = el.querySelector('#iWear');
        if (wear) wear.addEventListener('click', () => {
          store.equip(id);
          api.close();
          ui.toast('Надето: ' + it.name);
        });
        const buyBtn = el.querySelector('#iBuy');
        if (buyBtn && !err) buyBtn.addEventListener('click', async () => {
          const ok = await ui.confirm('Купить «' + esc(it.name) + '» за ' + it.price.toLocaleString('ru-RU') + ' мон.?', 'Купить');
          if (!ok) return;
          const e2 = store.buy(id);
          if (e2) { ui.toast(e2); return; }
          ui.haptic('success');
          api.close();
          ui.toast('Куплено и надето: ' + it.name);
        });
      },
    });
  }

  PF.screens = PF.screens || {};
  PF.screens.char = { title: 'Персонаж', render };
})(window.PF);
