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
const { open, seed, SCREENS } = require('./lib');

const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith('--')) || 'shots');
const flag = (name) => args.includes('--' + name);
const opt = (name, def) => { const a = args.find((x) => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : def; };

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
