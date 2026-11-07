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
  const ACTS = PF.ACTS;
  const UNCODE = {};
  Object.keys(ACTS).forEach((k) => { UNCODE[ACTS[k].code] = k; });

  const ASK_FIRST = 2 * 3600;   // первый вопрос «Ты всё ещё занимаешься?» через 2 часа
  const ASK_REPEAT = 2 * 3600;  // после ответа «да» — снова через 2 часа
  const MIN_SESSION = 60;       // занятия короче минуты не сохраняем
  const MAX_MANUAL = 24 * 3600; // ручная запись — не длиннее суток

  const S = { records: [], active: null };
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
        names.forEach((n) => { payload[n] = n === 'state' ? stateDoc() : monthDoc(n); });
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
    return '«' + ACTS[r.a].name + '» ' + u.dayTitle(u.dayKey(r.s)).toLowerCase() +
      ' ' + u.hm(r.s) + '–' + u.hm(r.e);
  }

  // Проверить запись. Возвращает текст ошибки или null, если всё в порядке.
  function validate(rec, excludeId, manual) {
    if (!ACTS[rec.a]) return 'Выберите занятие.';
    if (!Number.isFinite(rec.s) || !Number.isFinite(rec.e)) return 'Укажите дату и время.';
    if (rec.e <= rec.s) return 'Конец должен быть позже начала.';
    if (rec.e - rec.s < MIN_SESSION) return 'Запись должна длиться хотя бы минуту.';
    if (manual && rec.e - rec.s > MAX_MANUAL) return 'Запись не может быть длиннее суток.';
    if (rec.e > u.nowSec()) return 'Нельзя добавить запись, которая заканчивается в будущем.';
    const clash = S.records.find((r) => r.id !== excludeId && rec.s < r.e && r.s < rec.e);
    if (clash) return 'Пересекается с записью ' + describe(clash) + '.';
    if (S.active && rec.e > S.active.s) {
      return 'Пересекается с текущим занятием «' + ACTS[S.active.a].name + '» (идёт с ' + u.hm(S.active.s) + ').';
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
    if (S.active && S.active.a === a && (S.active.t || '') === t) return {};
    const now = u.nowSec();
    const res = stopInternal(now);
    S.active = { a, s: now, ask: now + ASK_FIRST };
    if (t) S.active.t = t;
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
    if (!old) return 'Запись не найдена.';
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

  // ---------- резервная копия ----------

  function exportObj() {
    return {
      app: 'pixel-focus',
      format: 1,
      exportedAt: new Date().toISOString(),
      data: {
        records: S.records.map((r) => Object.assign({}, r)),
        active: S.active ? Object.assign({}, S.active) : null,
      },
    };
  }

  // Разобрать резервную копию. Бросает ошибку с понятным текстом.
  function parseBackup(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) {
      throw new Error('Не получилось прочитать файл: это не резервная копия.');
    }
    if (!obj || obj.app !== 'pixel-focus' || !obj.data) {
      throw new Error('Это не резервная копия Pixel Focus.');
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
    }
    return { records, active, exportedAt: obj.exportedAt };
  }

  function markAllDocs() {
    docs.names().forEach((n) => dirty.add(n));
    S.records.forEach(markRec);
    markState();
  }

  // Заменить все данные данными из копии.
  function importBackup(parsed) {
    markAllDocs(); // старые месяцы — чтобы удалить лишнее
    S.records = parsed.records.slice();
    S.active = parsed.active;
    sortRecs();
    markAllDocs();
    changed();
    return flush();
  }

  function wipe() {
    markAllDocs();
    S.records = [];
    S.active = null;
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
    start,
    stop,
    confirmStill,
    needsAsk,
    validate,
    add,
    update,
    remove,
    days,
    exportObj,
    parseBackup,
    importBackup,
    wipe,
  };
})(window.PF);
