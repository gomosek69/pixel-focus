// Данные приложения и все действия с ними.
//
// В памяти:
//   records — завершённые записи { id, a: 'work'|'study'|'rest', s: начало, e: конец, t?: название задачи }
//   active  — текущее занятие { a, s: время начала, ask: когда спросить «ты всё ещё…», t? }
// Время везде в секундах.
//
// В хранилище:
//   документ state         — текущее занятие;
//   документы rec_ГГГГ_ММ   — записи месяца (по дате начала) в компактном виде [id, буква, s, e, t?].
(function (PF) {
  'use strict';

  const u = PF.u;
  const t = (...a) => PF.t(...a);
  const ACTS = PF.ACTS;
  const UNCODE = {};
  Object.keys(ACTS).forEach((k) => { UNCODE[ACTS[k].code] = k; });

  const ASK_FIRST = 2 * 3600;   // первый вопрос «Ты всё ещё занимаешься?» через 2 часа
  const ASK_REPEAT = 2 * 3600;  // после ответа «да» — снова через 2 часа
  const MIN_SESSION = 60;       // занятия короче минуты не сохраняем
  const MAX_MANUAL = 24 * 3600; // ручная запись — не длиннее суток
  const START_BALANCE = 0;      // стартовый баланс
  const KEYS_WARN = 800;        // с этого числа ячеек облака показываем предупреждение

  const S = { records: [], active: null, char: null, prefs: defaultPrefs(), tasks: [] };

  // Настройки по умолчанию.
  // lang: auto|ru|en; theme: auto|light|dark; accent: 'auto' или номер цвета; bg: номер фона; chart: вид графика.
  const PREF_RULES = {
    lang: (v) => ['auto', 'ru', 'en'].includes(v),
    theme: (v) => ['auto', 'light', 'dark'].includes(v),
    accent: (v) => v === 'auto' || (Number.isInteger(v) && v >= 0 && v < 16),
    bg: (v) => Number.isInteger(v) && v >= 0 && v < 16,
    chart: (v) => ['bars', 'percent', 'pie', 'lines', 'cumulative'].includes(v),
    glass: (v) => ['liquid', 'frosted'].includes(v),
    name: (v) => typeof v === 'string' && v.length <= 30, // как обращаться к пользователю
    asked: (v) => v === true,                             // уже спрашивали имя
  };
  function defaultPrefs() {
    return { lang: 'auto', theme: 'auto', accent: 'auto', bg: 0, chart: 'bars', glass: 'liquid', name: '', asked: false };
  }
  function sanitizePrefs(pr) {
    const out = defaultPrefs();
    if (pr && typeof pr === 'object') {
      Object.keys(PREF_RULES).forEach((k) => { if (PREF_RULES[k](pr[k])) out[k] = pr[k]; });
    }
    return out;
  }

  // Персонаж по умолчанию: внешность, надетые вещи и список покупок [[id, цена, время]].
  function defaultChar() {
    return {
      g: 'm', skin: 1, eyes: 0, hc: 1,
      eq: { hair: 'hair_short', top: 'top_tee', pants: 'pants_jeans', shoes: 'shoes_keds', acc: null, dance: null },
      buy: [],
      col: {}, // выбранный цвет вещи: { id вещи: номер цвета в палитре }
    };
  }
  S.char = defaultChar();
  let docs = null;
  const dirty = new Set();
  let flushTimer = null;
  let chain = Promise.resolve();
  const listeners = [];

  function emit(type, payload) {
    listeners.forEach((fn) => { try { fn(type || 'change', payload); } catch (e) { console.error(e); } });
  }

  // ---------- кодирование ----------

  function encodeRec(r) {
    const arr = [r.id, ACTS[r.a].code, r.s, r.e];
    if (r.t) arr.push(r.t);
    return arr;
  }

  function decodeRec(arr) {
    if (!Array.isArray(arr)) return null;
    const [id, code, s, e, t] = arr;
    if (!UNCODE[code] || !Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
    const r = { id: String(id), a: UNCODE[code], s, e };
    if (t) r.t = String(t);
    return r;
  }

  const sortRecs = () => S.records.sort((x, y) => x.s - y.s);
  const monthDocName = (sec) => 'rec_' + u.monthKey(sec);

  function stateDoc() {
    return { v: 1, active: S.active ? Object.assign({}, S.active) : null };
  }

  function monthDoc(name) {
    const list = S.records.filter((r) => monthDocName(r.s) === name).map(encodeRec);
    return list.length ? list : null; // пустой месяц — удаляем документ
  }

  // ---------- сохранение ----------

  function markState() { dirty.add('state'); }
  function markRec(r) { dirty.add(monthDocName(r.s)); }

  function schedule() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 300);
  }

  function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    if (!dirty.size || !docs) return chain;
    const names = [...dirty];
    dirty.clear();
    chain = chain
      .then(() => {
        const payload = {};
        names.forEach((n) => {
          if (n === 'state') payload[n] = stateDoc();
          else if (n === 'char') payload[n] = S.char;
          else if (n === 'prefs') payload[n] = S.prefs;
          else if (n === 'tasks') payload[n] = S.tasks.length ? S.tasks.map(encodeTask) : null;
          else payload[n] = monthDoc(n);
        });
        return docs.writeDocs(payload);
      })
      .then(() => emit('saved'))
      .catch((e) => {
        console.error('Ошибка сохранения', e);
        names.forEach((n) => dirty.add(n));
        emit('saveError', e);
      });
    return chain;
  }

  function changed() {
    schedule();
    emit('change');
  }

  // ---------- загрузка ----------

  function applyDocs(loaded) {
    S.records = [];
    S.active = null;
    S.char = sanitizeChar(loaded.char);
    S.tasks = (Array.isArray(loaded.tasks) ? loaded.tasks : []).map(decodeTask).filter(Boolean);
    S.prefs = sanitizePrefs(loaded.prefs);
    if (PF.i18n) PF.i18n.setLang(S.prefs.lang);
    Object.keys(loaded).forEach((name) => {
      if (!name.startsWith('rec_') || !Array.isArray(loaded[name])) return;
      loaded[name].forEach((arr) => {
        const r = decodeRec(arr);
        if (r) S.records.push(r);
      });
    });
    const st = loaded.state;
    if (st && st.active && ACTS[st.active.a] && Number.isFinite(st.active.s)) {
      const a = st.active;
      S.active = { a: a.a, s: a.s, ask: Number.isFinite(a.ask) ? a.ask : a.s + ASK_FIRST };
      if (a.t) S.active.t = String(a.t);
      if (a.taskId) S.active.taskId = String(a.taskId);
    }
    sortRecs();
  }

  async function init() {
    const tg = PF.tg;
    const inTelegram = !!tg; // app.js кладёт сюда объект Telegram только внутри Telegram
    const canCloud = inTelegram && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9');
    PF.storageWarning = null;

    let backend = canCloud ? PF.storage.cloud(tg.CloudStorage) : PF.storage.local();
    if (inTelegram && !canCloud) {
      PF.storageWarning = 'Ваша версия Telegram не поддерживает облачное хранилище. Данные сохраняются только на этом устройстве. Обновите Telegram.';
    }
    docs = new PF.storage.DocStore(backend);
    let loaded;
    try {
      loaded = await docs.loadAll();
    } catch (e) {
      if (backend.name !== 'cloud') throw e;
      console.error('Облако Telegram недоступно', e);
      PF.storageWarning = 'Не удалось загрузить данные из облака Telegram. Сейчас данные сохраняются только на этом устройстве. Попробуйте перезапустить приложение.';
      backend = PF.storage.local();
      docs = new PF.storage.DocStore(backend);
      loaded = await docs.loadAll();
    }

    // Облако пустое, а на этом устройстве уже есть записи (сохранённые раньше
    // в память встроенного браузера) — переносим их в облако.
    if (backend.name === 'cloud' && !Object.keys(loaded).length) {
      try {
        const localDocs = await new PF.storage.DocStore(PF.storage.local()).loadAll();
        if (Object.keys(localDocs).length) {
          await docs.writeDocs(localDocs);
          loaded = localDocs;
          PF.migratedNotice = 'Записи с этого устройства перенесены в облако Telegram.';
        }
      } catch (e) {
        console.error('Не удалось перенести записи в облако', e);
      }
    }
    applyDocs(loaded);
  }

  // ---------- проверки ----------

  function describe(r) {
    return '«' + t(ACTS[r.a].name) + '» ' + u.dayTitle(u.dayKey(r.s)).toLowerCase() +
      ' ' + u.hm(r.s) + '–' + u.hm(r.e);
  }

  // Проверить запись. Возвращает текст ошибки или null, если всё в порядке.
  function validate(rec, excludeId, manual) {
    if (!ACTS[rec.a]) return t('Выберите занятие.');
    if (!Number.isFinite(rec.s) || !Number.isFinite(rec.e)) return t('Укажите дату и время.');
    if (rec.e <= rec.s) return t('Конец должен быть позже начала.');
    if (rec.e - rec.s < MIN_SESSION) return t('Запись должна длиться хотя бы минуту.');
    if (manual && rec.e - rec.s > MAX_MANUAL) return t('Запись не может быть длиннее суток.');
    if (rec.e > u.nowSec()) return t('Нельзя добавить запись, которая заканчивается в будущем.');
    const clash = S.records.find((r) => r.id !== excludeId && rec.s < r.e && r.s < rec.e);
    if (clash) return t('Пересекается с записью {0}.', describe(clash));
    if (S.active && rec.e > S.active.s) {
      return t('Пересекается с текущим занятием «{0}» (идёт с {1}).', t(ACTS[S.active.a].name), u.hm(S.active.s));
    }
    return null;
  }

  // ---------- действия с текущим занятием ----------

  // Завершить текущее занятие (без оповещения). Возвращает { rec } или { short: true }.
  function stopInternal(end) {
    const a = S.active;
    if (!a) return {};
    const now = u.nowSec();
    end = Math.max(a.s, Math.min(Number.isFinite(end) ? end : now, now));
    S.active = null;
    markState();
    if (end - a.s < MIN_SESSION) return { short: true };
    const rec = { id: u.uid(), a: a.a, s: a.s, e: end };
    if (a.t) rec.t = a.t;
    S.records.push(rec);
    sortRecs();
    markRec(rec);
    return { rec };
  }

  // Начать занятие. Текущее (если есть) автоматически завершается.
  // opts.t — название задачи (для запуска из вкладки «Задачи»).
  function start(a, opts) {
    if (!ACTS[a]) return {};
    const t = opts && opts.t ? String(opts.t) : '';
    const taskId = opts && opts.taskId ? String(opts.taskId) : '';
    if (S.active && S.active.a === a && (S.active.t || '') === t && (S.active.taskId || '') === taskId) return {};
    const now = u.nowSec();
    const res = stopInternal(now);
    S.active = { a, s: now, ask: now + ASK_FIRST };
    if (t) S.active.t = t;
    if (taskId) S.active.taskId = taskId;
    markState();
    changed();
    return res;
  }

  function stop(end) {
    const res = stopInternal(end);
    changed();
    return res;
  }

  // Ответ «Да, продолжаю» на вопрос «Ты всё ещё занимаешься?»
  function confirmStill() {
    if (!S.active) return;
    S.active.ask = u.nowSec() + ASK_REPEAT;
    markState();
    changed();
  }

  const needsAsk = () => !!(S.active && u.nowSec() >= S.active.ask);

  // ---------- действия с записями ----------

  function add(data) {
    const rec = { id: u.uid(), a: data.a, s: data.s, e: data.e };
    if (data.t) rec.t = data.t;
    const err = validate(rec, null, true);
    if (err) return err;
    S.records.push(rec);
    sortRecs();
    markRec(rec);
    changed();
    return null;
  }

  function update(id, data) {
    const old = S.records.find((r) => r.id === id);
    if (!old) return t('Запись не найдена.');
    const rec = Object.assign({}, old, data);
    const err = validate(rec, id, true);
    if (err) return err;
    markRec(old);
    Object.assign(old, data);
    sortRecs();
    markRec(old);
    changed();
    return null;
  }

  function remove(id) {
    const i = S.records.findIndex((r) => r.id === id);
    if (i < 0) return;
    markRec(S.records[i]);
    S.records.splice(i, 1);
    changed();
  }

  // Записи, сгруппированные по дню начала (новые дни сверху).
  function days() {
    const map = new Map();
    for (let i = S.records.length - 1; i >= 0; i--) {
      const r = S.records[i];
      const k = u.dayKey(r.s);
      if (!map.has(k)) map.set(k, { key: k, recs: [], totals: { work: 0, study: 0, rest: 0 } });
      const d = map.get(k);
      d.recs.push(r);
      d.totals[r.a] += r.e - r.s;
    }
    return [...map.values()];
  }

  // ---------- персонаж ----------

  const intIn = (v, max, def) => (Number.isInteger(v) && v >= 0 && v <= max ? v : def);

  // Проверить данные персонажа (из хранилища или резервной копии).
  function sanitizeChar(ch) {
    const d = defaultChar();
    if (!ch || typeof ch !== 'object') return d;
    const out = {
      g: ch.g === 'f' ? 'f' : 'm',
      skin: intIn(ch.skin, 5, d.skin),
      eyes: intIn(ch.eyes, 5, d.eyes),
      hc: intIn(ch.hc, 5, d.hc),
      eq: Object.assign({}, d.eq),
      buy: [],
      col: {},
    };
    if (ch.col && typeof ch.col === 'object') {
      Object.keys(ch.col).forEach((id) => {
        const v = ch.col[id];
        if (Number.isInteger(v) && v >= 0 && v < 64) out.col[id] = v;
      });
    }
    (Array.isArray(ch.buy) ? ch.buy : []).forEach((b) => {
      if (Array.isArray(b) && typeof b[0] === 'string' && Number.isFinite(b[1]) && b[1] >= 0 &&
          !out.buy.some((x) => x[0] === b[0])) {
        out.buy.push([b[0], b[1], Number.isFinite(b[2]) ? b[2] : 0]);
      }
    });
    if (ch.eq && typeof ch.eq === 'object') {
      Object.keys(out.eq).forEach((cat) => {
        const id = ch.eq[cat];
        if (id === null && (cat === 'acc' || cat === 'dance')) out.eq[cat] = null;
        else if (typeof id === 'string') out.eq[cat] = id;
      });
    }
    return out;
  }

  const item = (id) => (PF.char ? PF.char.byId[id] : null);
  const owns = (id) => {
    const it = item(id);
    return !!it && (it.rarity === 'base' || S.char.buy.some((b) => b[0] === id));
  };
  const spent = () => S.char.buy.reduce((sum, b) => sum + b[1], 0);

  // Что сейчас надето (с проверкой: только свои существующие вещи).
  function equipped() {
    const eq = {};
    Object.keys(S.char.eq).forEach((cat) => {
      const id = S.char.eq[cat];
      const it = item(id);
      eq[cat] = it && it.cat === cat && owns(id) ? id : PF.char.BASE[cat];
    });
    return eq;
  }

  // Купленный цвет вещи? Покупка цвета хранится в списке покупок как "id#номер".
  const ownsColor = (id, idx) => S.char.buy.some((b) => b[0] === id + '#' + idx);

  // Выбранный цвет вещи (только если он куплен), иначе null — исходный цвет.
  function colorOf(id) {
    const v = S.char.col[id];
    return Number.isInteger(v) && ownsColor(id, v) ? v : null;
  }

  // Описание внешности для рисования.
  // override: { cat: id } — примерить вещь; colOverride: { cat: номер цвета } — примерить цвет.
  function look(override, colOverride) {
    const eq = equipped();
    if (override) Object.assign(eq, override);
    const col = {};
    Object.keys(eq).forEach((cat) => { if (eq[cat]) col[cat] = colorOf(eq[cat]); });
    if (colOverride) Object.assign(col, colOverride);
    return { g: S.char.g, skin: S.char.skin, eyes: S.char.eyes, hc: S.char.hc, eq, col };
  }

  function charChanged() {
    dirty.add('char');
    changed();
  }

  // Настройки приложения (язык; позже — тема и цвета).
  function setPref(key, value) {
    if (!PREF_RULES[key] || !PREF_RULES[key](value)) return;
    S.prefs[key] = value;
    dirty.add('prefs');
    if (key === 'lang') {
      PF.i18n.setLang(value);
      emit('lang');
    } else if (key === 'theme' || key === 'accent' || key === 'bg' || key === 'glass') {
      emit('theme');
    }
    changed();
  }

  function setLook(field, value) {
    if (field === 'g') S.char.g = value === 'f' ? 'f' : 'm';
    else if (field === 'skin' || field === 'eyes' || field === 'hc') S.char[field] = intIn(value, 5, S.char[field]);
    else return;
    charChanged();
  }

  // Почему нельзя купить (или null, если можно).
  function cantBuy(id) {
    const it = item(id);
    if (!it || it.rarity === 'base') return t('Эту вещь нельзя купить.');
    if (owns(id)) return t('Уже куплено.');
    const bal = Math.round(balance());
    if (bal < 0) return t('Баланс отрицательный — покупки недоступны.');
    if (bal < it.price) return t('Не хватает {0} мон.', u.num(it.price - bal));
    return null;
  }

  function cantPay(price) {
    const bal = Math.round(balance());
    if (bal < 0) return t('Баланс отрицательный — покупки недоступны.');
    if (bal < price) return t('Не хватает {0} мон.', u.num(price - bal));
    return null;
  }

  // Почему нельзя купить цвет (или null).
  function cantBuyColor(id, idx) {
    const it = item(id);
    if (!it || !it.pal || !PF.char.PALETTE[idx]) return t('Эту вещь нельзя перекрасить.');
    if (!owns(id)) return t('Сначала купите вещь.');
    if (ownsColor(id, idx)) return t('Уже куплено.');
    return cantPay(PF.char.colorPrice(it));
  }

  // Купить цвет и сразу применить.
  function buyColor(id, idx) {
    const err = cantBuyColor(id, idx);
    if (err) return err;
    S.char.buy.push([id + '#' + idx, PF.char.colorPrice(item(id)), u.nowSec()]);
    S.char.col[id] = idx;
    charChanged();
    return null;
  }

  // Выбрать купленный цвет (null — исходный).
  function setColor(id, idx) {
    if (idx === null) delete S.char.col[id];
    else if (ownsColor(id, idx)) S.char.col[id] = idx;
    else return;
    charChanged();
  }

  // Купить и сразу надеть. Возвращает текст ошибки или null.
  function buy(id) {
    const err = cantBuy(id);
    if (err) return err;
    const it = item(id);
    S.char.buy.push([id, it.price, u.nowSec()]);
    S.char.eq[it.cat] = id;
    charChanged();
    return null;
  }

  function equip(id) {
    const it = item(id);
    if (!it || !owns(id)) return;
    S.char.eq[it.cat] = id;
    charChanged();
  }

  // Снять вещь: аксессуар просто снимается, остальное заменяется базовой вещью.
  function unequip(cat) {
    if (cat === 'hair') return;
    S.char.eq[cat] = PF.char.BASE[cat];
    charChanged();
  }

  // ---------- монеты ----------
  // Баланс нигде не хранится: он всегда считается заново из записей,
  // поэтому правка и удаление записей сразу его пересчитывают.

  // Монеты за завершённую запись — точно, с дробями (ставка × минуты).
  const recCoins = (r) => ACTS[r.a].rate * (r.e - r.s) / 60;

  // Монеты за текущее занятие — по целым минутам, поэтому баланс меняется раз в минуту.
  function activeCoins() {
    const a = S.active;
    if (!a) return 0;
    return ACTS[a.a].rate * Math.floor(Math.max(0, u.nowSec() - a.s) / 60);
  }

  function balance() {
    let sum = START_BALANCE - spent();
    for (const r of S.records) sum += recCoins(r);
    return sum + activeCoins();
  }

  // ---------- задачи ----------
  // Задача: { id, title, date: 'ГГГГ-ММ-ДД' | '', time: 'ЧЧ:ММ' | '', done, c: создана, d: выполнена }
  // В хранилище — компактно: [id, название, дата, время, 0/1, создана, выполнена].

  const encodeTask = (k) => [k.id, k.title, k.date, k.time, k.done ? 1 : 0, k.c, k.d || 0];

  function decodeTask(arr) {
    if (!Array.isArray(arr) || typeof arr[1] !== 'string' || !arr[1].trim()) return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(arr[2]) ? arr[2] : '';
    const time = date && /^\d{2}:\d{2}$/.test(arr[3]) ? arr[3] : '';
    return {
      id: String(arr[0] || u.uid()), title: arr[1].slice(0, 200), date, time,
      done: !!arr[4], c: Number.isFinite(arr[5]) ? arr[5] : 0, d: Number.isFinite(arr[6]) ? arr[6] : 0,
    };
  }

  // Проверить поля задачи. Возвращает текст ошибки или null.
  function checkTask(f) {
    if (!f.title || !String(f.title).trim()) return t('Введите название задачи.');
    if (String(f.title).trim().length > 200) return t('Название слишком длинное (не больше 200 символов).');
    if (f.time && !f.date) return t('Чтобы указать время, выберите дату.');
    return null;
  }

  const taskFields = (f) => ({
    title: String(f.title).trim(),
    date: f.date || '',
    time: f.date ? (f.time || '') : '',
  });

  function markTasks() { dirty.add('tasks'); changed(); }

  function addTask(f) {
    const err = checkTask(f);
    if (err) return err;
    S.tasks.push(Object.assign({ id: u.uid(), done: false, c: u.nowSec(), d: 0 }, taskFields(f)));
    markTasks();
    return null;
  }

  function updateTask(id, f) {
    const k = S.tasks.find((x) => x.id === id);
    if (!k) return t('Задача не найдена.');
    const err = checkTask(f);
    if (err) return err;
    Object.assign(k, taskFields(f));
    markTasks();
    return null;
  }

  // Отметить выполненной / вернуть. Если по задаче идёт занятие — оно завершается.
  // Возвращает результат остановки занятия ({ rec } / { short }) или {}.
  function toggleTask(id) {
    const k = S.tasks.find((x) => x.id === id);
    if (!k) return {};
    k.done = !k.done;
    k.d = k.done ? u.nowSec() : 0;
    let res = {};
    if (k.done && S.active && S.active.taskId === id) res = stopInternal(u.nowSec());
    markTasks();
    return res;
  }

  function removeTask(id) {
    S.tasks = S.tasks.filter((x) => x.id !== id);
    if (S.active && S.active.taskId === id) { delete S.active.taskId; markState(); }
    markTasks();
  }

  function clearDoneTasks() {
    S.tasks = S.tasks.filter((x) => !x.done);
    markTasks();
  }

  // ---------- резервная копия ----------

  function exportObj() {
    return {
      app: 'pixel-focus',
      format: 1,
      exportedAt: new Date().toISOString(),
      data: {
        records: S.records.map((r) => Object.assign({}, r)),
        active: S.active ? Object.assign({}, S.active) : null,
        char: JSON.parse(JSON.stringify(S.char)),
        tasks: S.tasks.map(encodeTask),
      },
    };
  }

  // Разобрать резервную копию. Бросает ошибку с понятным текстом.
  function parseBackup(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) {
      throw new Error(t('Не получилось прочитать файл: это не резервная копия.'));
    }
    if (!obj || obj.app !== 'pixel-focus' || !obj.data) {
      throw new Error(t('Это не резервная копия Pixel Focus.'));
    }
    const records = [];
    (obj.data.records || []).forEach((r) => {
      if (!r || !ACTS[r.a] || !Number.isFinite(r.s) || !Number.isFinite(r.e) || r.e <= r.s) return;
      const rec = { id: String(r.id || u.uid()), a: r.a, s: Math.floor(r.s), e: Math.floor(r.e) };
      if (r.t) rec.t = String(r.t).slice(0, 200);
      records.push(rec);
    });
    let active = null;
    const a = obj.data.active;
    if (a && ACTS[a.a] && Number.isFinite(a.s)) {
      active = { a: a.a, s: Math.floor(a.s), ask: Number.isFinite(a.ask) ? a.ask : a.s + ASK_FIRST };
      if (a.t) active.t = String(a.t).slice(0, 200);
      if (a.taskId) active.taskId = String(a.taskId);
    }
    const tasks = (Array.isArray(obj.data.tasks) ? obj.data.tasks : []).map(decodeTask).filter(Boolean);
    return { records, active, char: sanitizeChar(obj.data.char), tasks, exportedAt: obj.exportedAt };
  }

  function markAllDocs() {
    docs.names().forEach((n) => dirty.add(n));
    S.records.forEach(markRec);
    markState();
    dirty.add('char');
    dirty.add('tasks');
  }

  // Заменить все данные данными из копии.
  function importBackup(parsed) {
    markAllDocs(); // старые месяцы — чтобы удалить лишнее
    S.records = parsed.records.slice();
    S.active = parsed.active;
    S.char = parsed.char || defaultChar();
    S.tasks = (parsed.tasks || []).slice();
    sortRecs();
    markAllDocs();
    changed();
    return flush();
  }

  function wipe() {
    markAllDocs();
    S.records = [];
    S.active = null;
    S.char = defaultChar();
    S.tasks = [];
    changed();
    return flush();
  }

  PF.store = {
    S,
    ASK_FIRST,
    ASK_REPEAT,
    MIN_SESSION,
    init,
    flush,
    on: (fn) => listeners.push(fn),
    get backendName() { return docs ? docs.backendName : ''; },
    keyCount: () => (docs ? docs.keyCount() : 0),
    KEYS_WARN,
    storageNearlyFull: () => !!docs && docs.backendName === 'cloud' && docs.keyCount() >= KEYS_WARN,
    recCoins,
    activeCoins,
    balance,
    spent,
    owns,
    equipped,
    look,
    setLook,
    setPref,
    cantBuy,
    buy,
    equip,
    unequip,
    ownsColor,
    colorOf,
    cantBuyColor,
    buyColor,
    setColor,
    start,
    stop,
    confirmStill,
    needsAsk,
    validate,
    add,
    update,
    remove,
    days,
    addTask,
    updateTask,
    toggleTask,
    removeTask,
    clearDoneTasks,
    exportObj,
    parseBackup,
    importBackup,
    wipe,
  };
})(window.PF);
