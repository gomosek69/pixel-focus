// Низкий уровень хранения данных.
//
// Есть два «бэкенда» с одинаковым набором функций:
//  - cloud: Telegram CloudStorage (когда приложение открыто в Telegram);
//  - local: localStorage браузера (для проверки без Telegram).
//
// Поверх них работает DocStore: он хранит именованные «документы» (любые JSON-данные)
// и сам режет каждый документ на куски, чтобы уложиться в лимиты CloudStorage:
//  - не больше 4096 символов в одном значении (берём 4000 с запасом);
//  - не больше 1024 ключей (оставляем запас и ругаемся после 1000).
// Ключ куска: <имя документа>-<номер>, например rec_2026_11-0.
// Ключ idx хранит оглавление: { имя документа: число кусков }.
(function (PF) {
  'use strict';

  const CHUNK = 4000;
  const MAX_KEYS = 1000;
  const LS_PREFIX = 'pf_';

  function memoryBackend() {
    const m = new Map();
    return {
      name: 'memory',
      getKeys: async () => [...m.keys()],
      getItems: async (keys) => Object.fromEntries(keys.map((k) => [k, m.get(k) || ''])),
      setItem: async (k, v) => { m.set(k, v); },
      removeItems: async (keys) => { keys.forEach((k) => m.delete(k)); },
    };
  }

  function localBackend() {
    try {
      const t = '__pf_test__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
    } catch (e) {
      console.warn('localStorage недоступен, данные будут только в памяти', e);
      return memoryBackend();
    }
    return {
      name: 'local',
      async getKeys() {
        const out = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(LS_PREFIX)) out.push(k.slice(LS_PREFIX.length));
        }
        return out;
      },
      async getItems(keys) {
        const o = {};
        keys.forEach((k) => { o[k] = localStorage.getItem(LS_PREFIX + k) || ''; });
        return o;
      },
      async setItem(k, v) { localStorage.setItem(LS_PREFIX + k, v); },
      async removeItems(keys) { keys.forEach((k) => localStorage.removeItem(LS_PREFIX + k)); },
    };
  }

  function cloudBackend(cs) {
    // Telegram вызывает callback(error, result) — превращаем в Promise.
    const call = (fn) => new Promise((resolve, reject) => {
      fn((err, val) => (err ? reject(new Error(String(err))) : resolve(val)));
    });
    return {
      name: 'cloud',
      getKeys: () => call((cb) => cs.getKeys(cb)),
      async getItems(keys) {
        const parts = [];
        for (let i = 0; i < keys.length; i += 20) parts.push(keys.slice(i, i + 20));
        const results = await Promise.all(parts.map((p) => call((cb) => cs.getItems(p, cb))));
        return Object.assign({}, ...results);
      },
      setItem: (k, v) => call((cb) => cs.setItem(k, v, cb)),
      removeItems: (keys) => (keys.length ? call((cb) => cs.removeItems(keys, cb)) : Promise.resolve()),
    };
  }

  // Разрезать строку на куски, не разрывая пары символов (эмодзи).
  function split(s) {
    const parts = [];
    let i = 0;
    while (i < s.length) {
      let end = Math.min(i + CHUNK, s.length);
      const code = s.charCodeAt(end - 1);
      if (end < s.length && code >= 0xd800 && code <= 0xdbff) end -= 1;
      parts.push(s.slice(i, end));
      i = end;
    }
    if (!parts.length) parts.push('');
    return parts;
  }

  class DocStore {
    constructor(backend) {
      this.b = backend;
      this.idx = {};   // имя документа -> число кусков
      this.raw = {};   // имя документа -> массив кусков, которые сейчас лежат в хранилище
    }

    get backendName() { return this.b.name; }

    names() { return Object.keys(this.idx); }

    keyCount() {
      return 1 + Object.values(this.idx).reduce((a, n) => a + n, 0);
    }

    // Прочитать все документы. Возвращает { имя: значение }.
    async loadAll() {
      const keys = await this.b.getKeys();
      if (!keys.includes('idx')) return {};
      const all = await this.b.getItems(keys);
      let idx = {};
      try { idx = JSON.parse(all.idx || '{}') || {}; } catch (e) { idx = {}; }

      const docs = {};
      const valid = new Set(['idx']);
      for (const name of Object.keys(idx)) {
        const n = idx[name];
        const parts = [];
        for (let i = 0; i < n; i++) {
          valid.add(name + '-' + i);
          parts.push(all[name + '-' + i] || '');
        }
        this.raw[name] = parts;
        try {
          docs[name] = JSON.parse(parts.join(''));
        } catch (e) {
          console.error('Документ повреждён:', name, e);
        }
      }
      this.idx = idx;

      // Убрать «осиротевшие» ключи (остались от прерванной записи).
      const orphans = keys.filter((k) => !valid.has(k));
      if (orphans.length) this.b.removeItems(orphans).catch(() => {});
      return docs;
    }

    // Записать документы: { имя: значение } (значение null — удалить документ).
    // Пишутся только изменившиеся куски.
    async writeDocs(docs) {
      const writes = [];
      const removes = [];
      const newIdx = Object.assign({}, this.idx);
      const newRaw = Object.assign({}, this.raw);

      for (const name of Object.keys(docs)) {
        const val = docs[name];
        const old = this.raw[name] || [];
        if (val === null || val === undefined) {
          for (let i = 0; i < old.length; i++) removes.push(name + '-' + i);
          delete newIdx[name];
          delete newRaw[name];
          continue;
        }
        const parts = split(JSON.stringify(val));
        parts.forEach((p, i) => { if (old[i] !== p) writes.push([name + '-' + i, p]); });
        for (let i = parts.length; i < old.length; i++) removes.push(name + '-' + i);
        newIdx[name] = parts.length;
        newRaw[name] = parts;
      }

      const total = 1 + Object.values(newIdx).reduce((a, n) => a + n, 0);
      if (total > MAX_KEYS) {
        const err = new Error('Хранилище заполнено');
        err.code = 'LIMIT';
        throw err;
      }

      const idxChanged = JSON.stringify(newIdx) !== JSON.stringify(this.idx);
      // Сначала куски, потом оглавление, потом удаление лишнего —
      // так при обрыве связи на полпути старые данные не теряются.
      await Promise.all(writes.map(([k, v]) => this.b.setItem(k, v)));
      if (idxChanged) await this.b.setItem('idx', JSON.stringify(newIdx));
      if (removes.length) await this.b.removeItems(removes);

      this.idx = newIdx;
      this.raw = newRaw;
    }
  }

  PF.storage = {
    CHUNK,
    MAX_KEYS,
    local: localBackend,
    cloud: cloudBackend,
    memory: memoryBackend,
    DocStore,
  };
})(window.PF);
