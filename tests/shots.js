// Снимки всех основных экранов — для сравнения «до и после» и для образцов оформления.
//
//   node tests/shots.js <папка> [--dark] [--style=<стиль>] [--scale=2] [--view] [--only=timer-active,shop] [--attr=ключ=значение,…]
//
// --view — снимать только видимую часть экрана (как на телефоне), а не всю страницу.
//
// --style ставит оформление через настройку приложения (prefs.style), --attr — служебные атрибуты на <html>
// (для экспериментов). Время зафиксировано, анимации выключены, поэтому снимки повторяемы.
'use strict';

const fs = require('fs');
const path = require('path');
const { open, seed, tab } = require('./lib');

const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith('--')) || 'shots');
const flag = (name) => args.includes('--' + name);
const opt = (name, def) => { const a = args.find((x) => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : def; };

// Экраны: имя → как до него дойти. full — снимок всей страницы, иначе только видимая часть.
const SCREENS = [
  ['timer-active', async (p) => { await tab(p, 'timer'); }],
  ['timer-idle', async (p) => { await p.evaluate(() => PF.store.stop()); await tab(p, 'stats'); await tab(p, 'timer'); }],
  ['stats', async (p) => { await tab(p, 'stats'); await p.click('[data-mode=month]'); await p.waitForTimeout(200); }],
  ['wardrobe', async (p) => { await tab(p, 'char'); }],
  ['shop', async (p) => { await tab(p, 'char'); await p.click('[data-mode=shop]'); await p.waitForTimeout(200); await p.click('[data-cat=top]'); await p.waitForTimeout(200); }],
  ['tasks', async (p) => { await tab(p, 'tasks'); }],
  ['me', async (p) => { await tab(p, 'me'); }],
  ['me-weight', async (p) => { await tab(p, 'me'); await p.click('[data-open=weight]'); await p.waitForTimeout(250); }],
  ['settings', async (p) => { await tab(p, 'settings'); }],
  ['sheet-record', async (p) => { await tab(p, 'timer'); await p.click('[data-action=add]'); await p.waitForTimeout(350); }, 'view'],
  ['sheet-acts', async (p) => { await p.evaluate(() => PF.ui.closeTopSheet()); await p.waitForTimeout(300); await p.click('[data-action=acts]'); await p.waitForTimeout(350); }, 'view'],
  ['sheet-buy', async (p) => {
    await p.evaluate(() => PF.ui.closeTopSheet()); await p.waitForTimeout(300);
    await tab(p, 'char'); await p.click('[data-mode=shop]'); await p.waitForTimeout(150); await p.click('[data-cat=top]'); await p.waitForTimeout(150);
    await p.click('.item:has(.price)'); await p.waitForTimeout(350);
  }, 'view'],
];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const app = await open({ dark: flag('dark'), scale: Number(opt('scale', 1)) });
  const p = app.page;
  await seed(p, { active: true });
  await p.evaluate(([dark, style]) => {
    PF.store.setPref('theme', dark ? 'dark' : 'light');
    if (style) PF.store.setPref('style', style);
  }, [flag('dark'), opt('style', '')]);
  const attrs = opt('attr', '');
  if (attrs) await p.evaluate((list) => list.split(',').forEach((kv) => { const [k, v] = kv.split('='); document.documentElement.setAttribute('data-' + k, v); }), attrs);
  await p.waitForTimeout(300);
  const only = opt('only', '').split(',').filter(Boolean);
  for (const [name, go, mode] of SCREENS) {
    if (only.length && !only.includes(name)) continue;
    await go(p);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.screenshot({ path: path.join(outDir, name + '.png'), fullPage: mode !== 'view' && !flag('view') });
  }
  if (app.errors.length) { console.log('ОШИБКИ:\n' + app.errors.join('\n')); process.exitCode = 1; }
  else console.log('ok: ' + outDir);
  await app.close();
})();
