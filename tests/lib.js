// Общие помощники для автопроверок (Playwright). Как запускать — см. tests/README.md.
//
// Приложение раздаётся маленьким встроенным сервером (свободный порт), время в браузере
// зафиксировано, анимации выключены — поэтому снимки экранов получаются одинаковыми от запуска к запуску.
'use strict';

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

// Статический сервер для папки проекта. Возвращает { url, close }.
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ url: 'http://127.0.0.1:' + srv.address().port, close: () => srv.close() }));
  });
}

// Фиксированное «сейчас» для всех проверок: пятница, 13 ноября 2026, 15:30.
const NOW = new Date('2026-11-13T15:30:00+03:00');

// Открыть приложение. opts: { width, height, scale, locale, motion: true — не выключать анимации, now: Date|null }
async function open(opts) {
  opts = opts || {};
  const server = await serve();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: opts.width || 390, height: opts.height || 844 },
    deviceScaleFactor: opts.scale || 1,
    locale: opts.locale || 'ru-RU',
    timezoneId: 'Europe/Moscow',
    reducedMotion: opts.motion ? 'no-preference' : 'reduce',
    colorScheme: opts.dark ? 'dark' : 'light',
  });
  await context.addInitScript(() => { try { localStorage.setItem('pfx_nosplash', '1'); } catch (e) { /* нет */ } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/telegram|ERR_FAILED|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.route('https://telegram.org/**', (r) => r.abort());
  if (opts.now !== null) await page.clock.setFixedTime(opts.now || NOW);
  await page.goto(server.url + '/index.html');
  await page.waitForSelector('#app:not([hidden])');
  await page.waitForTimeout(300);
  return {
    page, errors, url: server.url,
    async close() { await browser.close(); server.close(); },
  };
}

// Наполнить приложение данными для снимков: записи, покупки, задачи, трекеры, свои занятия.
// opts.active — идёт занятие «Учёба» по задаче.
async function seed(page, opts) {
  opts = opts || {};
  await page.evaluate((o) => {
    const S = PF.store, u = PF.u, n = u.nowSec(), D = 86400;
    // записи за 30 дней: учёба, работа, отдых
    for (let i = 30; i >= 1; i--) {
      const day = n - i * D;
      const base = day - (day % D) + 6 * 3600; // утро по UTC ≈ 9:00 МСК
      S.add({ a: 'study', s: base, e: base + 3600 * (1.5 + (i % 3) * 0.5) });
      S.add({ a: 'work', s: base + 4 * 3600, e: base + 4 * 3600 + 3600 * (1 + (i % 4) * 0.5) });
      if (i % 2) S.add({ a: 'rest', s: base + 8 * 3600, e: base + 8 * 3600 + 1800 + (i % 3) * 900 });
    }
    const t0 = n - (n % D) + 5 * 3600; // сегодня
    S.add({ a: 'work', s: t0, e: t0 + 5400 });
    S.add({ a: 'study', s: t0 + 7200, e: t0 + 7200 + 4500, t: 'Конспект по истории' });
    S.add({ a: 'rest', s: t0 + 12600, e: t0 + 12600 + 1500 });
    // свои занятия
    S.addAct({ name: 'Спорт', rate: 0.5, color: '#22c55e', icon: 'sport' });
    S.addAct({ name: 'Игры', rate: -1.5, color: '#ec4899', icon: 'game' });
    // покупки и образ
    ['hair_wolf', 'top_hoodie', 'pants_cargo', 'shoes_sneakers', 'acc_headphones', 'top_blazer', 'hair_long', 'acc_glasses'].forEach((id) => S.buy(id));
    S.equip('hair_wolf'); S.equip('top_hoodie'); S.equip('pants_cargo'); S.equip('shoes_sneakers'); S.equip('acc_headphones');
    // задачи
    S.addTask({ title: 'Подготовка к экзамену', date: u.dayKey(n), time: '18:00' });
    S.addTask({ title: 'Сдать отчёт', date: u.dayKey(n + D * 2), time: '' });
    S.addTask({ title: 'Купить тетради', date: '', time: '' });
    S.addTask({ title: 'Прочитать главу 4', date: u.dayKey(n - D), time: '' });
    // трекеры
    for (let i = 20; i >= 0; i--) {
      const tm = n - i * D - 3600;
      S.addMe('weight', { t: tm, v: 72 - i * 0.05 + Math.sin(i) * 0.3 });
      S.addMe('sleep', { t: tm, v: 6.5 + (i % 4) * 0.5 });
      S.addMe('steps', { t: tm, v: 5000 + (i * 397) % 7000 });
      S.addMe('mood', { t: tm, v: 1 + ((i * 3) % 5), v2: 1 << (i % 6) });
      S.addMe('pulse', { t: tm, v: 62 + (i % 9) });
      S.addMe('pressure', { t: tm, v: 118 + (i % 7), v2: 76 + (i % 5) });
      if (i) S.addMe('water', { t: tm, v: 4 + (i % 5) });
    }
    S.setPref('wgoal', 70);
    if (o.active) {
      const task = S.S.tasks.find((k) => k.title === 'Подготовка к экзамену');
      S.start('study', { t: task.title, taskId: task.id });
      S.S.active.s = n - 47 * 60 - 12; // идёт 47 минут
      S.confirmStill(); // сохранить и перерисовать
    }
  }, opts);
  await page.evaluate(() => PF.store.flush());
  await page.waitForTimeout(200);
}

// Перейти на вкладку (в том числе «settings») и дождаться перерисовки.
async function tab(page, id) {
  await page.evaluate((x) => PF.app.switchTab(x), id);
  await page.waitForTimeout(250);
}

module.exports = { ROOT, NOW, serve, open, seed, tab };
