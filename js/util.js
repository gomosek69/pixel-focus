// Общие вспомогательные функции: время, даты, форматирование.
window.PF = window.PF || {};

(function (PF) {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');

  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
    'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MONTHS_SHORT = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.',
    'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
  const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  const EN_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const EN_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const isEn = () => PF.i18n && PF.i18n.lang === 'en';

  // Три основных занятия. code — короткая буква для компактного хранения.
  // Свои занятия пользователя (store.js) добавляются в этот же объект с полем custom: true;
  // их ключ и код — один и тот же id вида «c» + буквы/цифры.
  PF.ACTS = {
    work: { code: 'w', name: 'Работа', color: 'var(--act-work)', icon: 'work', rate: 0.3 },
    study: { code: 's', name: 'Учёба', color: 'var(--act-study)', icon: 'study', rate: 1 },
    rest: { code: 'r', name: 'Отдых', color: 'var(--act-rest)', icon: 'rest', rate: -1 },
  };
  PF.BASE_ACTS = ['work', 'study', 'rest'];
  // Занятия, которые можно запускать: основные + свои (кроме удалённых). Обновляет store.js.
  PF.ACT_ORDER = ['work', 'study', 'rest'];
  // Название занятия (обычный текст, не HTML): основные переводятся, свои — как ввёл пользователь.
  PF.actName = (k) => {
    const a = PF.ACTS[k];
    if (!a) return '?';
    return a.custom ? a.name : PF.t(a.name);
  };
  // Свои занятия: лимиты, цвета и значки на выбор.
  PF.CUSTOM_MAX = 10;
  PF.RATE_MIN = -2;
  PF.RATE_MAX = 2;
  PF.ACT_COLORS = ['#8b5cf6', '#ec4899', '#ef4444', '#eab308', '#22c55e', '#06b6d4',
    '#6366f1', '#84cc16', '#d946ef', '#0ea5e9', '#a16207', '#64748b'];
  PF.ACT_ICONS = ['star', 'sport', 'game', 'music', 'code', 'art', 'home', 'heart',
    'food', 'moon', 'phone', 'cart', 'pen', 'globe', 'work', 'study', 'rest'];

  // Трекеры во вкладке «Я». Значения хранятся в единицах: вес — кг, сон — часы, вода — стаканы (250 мл).
  // lim — допустимый диапазон (у давления — для верхнего и нижнего).
  PF.TRACKERS = {
    weight: { name: 'Вес', icon: 'scale', color: '#e5484d', agg: 'avg', step: 0.1, lim: [20, 400] },
    pressure: { name: 'Давление', icon: 'heart', color: '#d6409f', agg: 'avg', step: 1, lim: [50, 260], lim2: [30, 180] },
    pulse: { name: 'Пульс', icon: 'pulse', color: '#f76b15', agg: 'avg', step: 1, lim: [25, 250] },
    sleep: { name: 'Сон', icon: 'moon', color: '#6e56cf', agg: 'sum', step: 0.01, lim: [0, 24] },
    water: { name: 'Вода', icon: 'drop', color: '#0090ff', agg: 'sum', step: 1, lim: [0, 50] },
    mood: { name: 'Настроение', icon: 'smile', color: '#e2a400', agg: 'avg', step: 1, lim: [1, 5] },
    steps: { name: 'Шаги', icon: 'steps', color: '#30a46c', agg: 'sum', step: 1, lim: [0, 200000] },
  };
  PF.TRACKER_IDS = ['weight', 'pressure', 'pulse', 'sleep', 'water', 'mood', 'steps'];
  PF.LB = 0.45359237; // 1 фунт в кг

  // Основные цвета приложения на выбор (Настройки → Оформление).
  PF.ACCENTS = [
    { ru: 'Индиго', en: 'Indigo', hex: '#6366f1' },
    { ru: 'Синий', en: 'Blue', hex: '#2563eb' },
    { ru: 'Бирюзовый', en: 'Teal', hex: '#0d9488' },
    { ru: 'Зелёный', en: 'Green', hex: '#16a34a' },
    { ru: 'Оранжевый', en: 'Orange', hex: '#ea580c' },
    { ru: 'Розовый', en: 'Pink', hex: '#db2777' },
    { ru: 'Красный', en: 'Red', hex: '#dc2626' },
    { ru: 'Фиолетовый', en: 'Purple', hex: '#7c3aed' },
  ];
  // Фоны главного экрана (рисуются в CSS: --bgimg-N).
  PF.BACKGROUNDS = ['Обычный', 'Рассвет', 'Океан', 'Лес', 'Пиксели', 'Звёзды'];

  const toDate = (sec) => new Date(sec * 1000);

  PF.u = {
    pad,

    // Текущее время в секундах (все времена в приложении — в секундах).
    nowSec: () => Math.floor(Date.now() / 1000),

    uid: () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6),

    esc: (s) => String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),

    // 14:05
    hm(sec) {
      const d = toDate(sec);
      return pad(d.getHours()) + ':' + pad(d.getMinutes());
    },

    // 2026-11-07 (формат для <input type="date"> и ключ дня)
    dayKey(sec) {
      const d = toDate(sec);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    },

    // 2026_11 — ключ месяца для хранения записей
    monthKey(sec) {
      const d = toDate(sec);
      return d.getFullYear() + '_' + pad(d.getMonth() + 1);
    },

    // Значение для <input type="datetime-local">
    dateTimeInput(sec) {
      return PF.u.dayKey(sec) + 'T' + PF.u.hm(sec);
    },

    // Дата "2026-11-07" + время "14:05" -> секунды (по местному времени)
    fromInputs(dateStr, timeStr) {
      if (!dateStr || !timeStr) return NaN;
      const [y, m, d] = dateStr.split('-').map(Number);
      const [hh, mm] = timeStr.split(':').map(Number);
      return Math.floor(new Date(y, m - 1, d, hh, mm, 0).getTime() / 1000);
    },

    // Начало суток для ключа дня
    dayStart(dayKey) {
      const [y, m, d] = dayKey.split('-').map(Number);
      return Math.floor(new Date(y, m - 1, d).getTime() / 1000);
    },

    // Добавить n дней к ключу дня
    addDays(dayKey, n) {
      const [y, m, d] = dayKey.split('-').map(Number);
      const dt = new Date(y, m - 1, d + n);
      return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
    },

    // Число с разделением разрядов: "1 234" / "1,234"
    num(n) {
      return Number(n).toLocaleString(isEn() ? 'en-US' : 'ru-RU');
    },

    // "1 ч 05 мин", "45 мин", "меньше минуты" (англ.: "1 h 05 min")
    durShort(sec) {
      const min = Math.floor(Math.max(0, sec) / 60);
      const H = isEn() ? ' h' : ' ч';
      const M = isEn() ? ' min' : ' мин';
      if (min < 1) return isEn() ? 'under a minute' : 'меньше минуты';
      const h = Math.floor(min / 60);
      const m = min % 60;
      if (!h) return m + M;
      if (!m) return h + H;
      return h + H + ' ' + pad(m) + M;
    },

    // Монеты для показа: округление до целого, "1 234", со знаком для изменений: "+18", "−30".
    coins(x, signed) {
      let n = Math.round(x);
      if (Object.is(n, -0)) n = 0;
      const abs = PF.u.num(Math.abs(n));
      if (n < 0) return '−' + abs;
      return (signed && n > 0 ? '+' : '') + abs;
    },

    // Цена в минуту со знаком: "+0,3", "−1", "0".
    rate(r) {
      const v = Math.round(r * 10) / 10;
      if (!v) return '0';
      const n = String(Math.abs(v));
      return (v > 0 ? '+' : '−') + (isEn() ? n : n.replace('.', ','));
    },

    // "1:05:23"
    durClock(sec) {
      sec = Math.max(0, Math.floor(sec));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return h + ':' + pad(m) + ':' + pad(s);
    },

    // "Сегодня", "Вчера", "пятница, 6 ноября", "6 ноября 2025"
    dayTitle(dayKey) {
      const today = PF.u.dayKey(PF.u.nowSec());
      const en = isEn();
      if (dayKey === today) return en ? 'Today' : 'Сегодня';
      if (dayKey === PF.u.addDays(today, -1)) return en ? 'Yesterday' : 'Вчера';
      if (dayKey === PF.u.addDays(today, 1)) return en ? 'Tomorrow' : 'Завтра';
      const [y, m, d] = dayKey.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      if (en) {
        if (y !== new Date().getFullYear()) return EN_MONTHS[m - 1] + ' ' + d + ', ' + y;
        return EN_WEEKDAYS[dt.getDay()] + ', ' + EN_MONTHS[m - 1] + ' ' + d;
      }
      if (y !== new Date().getFullYear()) return d + ' ' + MONTHS_GEN[m - 1] + ' ' + y;
      return WEEKDAYS[dt.getDay()] + ', ' + d + ' ' + MONTHS_GEN[m - 1];
    },

    // Короткий день недели: "Пн" / "Mo"
    weekdayShort(dt) {
      return (isEn() ? ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] : ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'])[dt.getDay()];
    },

    // "8 нояб."
    shortDate(sec) {
      const d = toDate(sec);
      if (isEn()) return EN_MONTHS_SHORT[d.getMonth()] + ' ' + d.getDate();
      return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
    },
  };
})(window.PF);
