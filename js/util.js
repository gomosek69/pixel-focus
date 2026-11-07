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

  // Три занятия. code — короткая буква для компактного хранения.
  PF.ACTS = {
    work: { code: 'w', name: 'Работа', color: 'var(--act-work)', icon: 'work', rate: 0.3 },
    study: { code: 's', name: 'Учёба', color: 'var(--act-study)', icon: 'study', rate: 1 },
    rest: { code: 'r', name: 'Отдых', color: 'var(--act-rest)', icon: 'rest', rate: -1 },
  };
  PF.ACT_ORDER = ['work', 'study', 'rest'];

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

    // "8 нояб."
    shortDate(sec) {
      const d = toDate(sec);
      if (isEn()) return EN_MONTHS_SHORT[d.getMonth()] + ' ' + d.getDate();
      return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
    },
  };
})(window.PF);
