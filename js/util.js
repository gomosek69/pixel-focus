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

  // Три занятия. code — короткая буква для компактного хранения.
  PF.ACTS = {
    work: { code: 'w', name: 'Работа', color: '#3b82f6', icon: 'work' },
    study: { code: 's', name: 'Учёба', color: '#8b5cf6', icon: 'study' },
    rest: { code: 'r', name: 'Отдых', color: '#10b981', icon: 'rest' },
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

    // "1 ч 05 мин", "45 мин", "меньше минуты"
    durShort(sec) {
      const min = Math.floor(Math.max(0, sec) / 60);
      if (min < 1) return 'меньше минуты';
      const h = Math.floor(min / 60);
      const m = min % 60;
      if (!h) return m + ' мин';
      if (!m) return h + ' ч';
      return h + ' ч ' + pad(m) + ' мин';
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
      if (dayKey === today) return 'Сегодня';
      if (dayKey === PF.u.addDays(today, -1)) return 'Вчера';
      const [y, m, d] = dayKey.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      if (y !== new Date().getFullYear()) return d + ' ' + MONTHS_GEN[m - 1] + ' ' + y;
      return WEEKDAYS[dt.getDay()] + ', ' + d + ' ' + MONTHS_GEN[m - 1];
    },

    // "8 нояб."
    shortDate(sec) {
      const d = toDate(sec);
      return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
    },
  };
})(window.PF);
