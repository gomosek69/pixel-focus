// Проверка читаемости: хватает ли контраста у текста во всех стилях оформления.
//
//   node tests/contrast.js [--style=pixel,neon] [--dark] [--light] [--min=2.5] [--only=timer-active,shop]
//
// Для каждого стиля и темы открывает основные экраны, делает снимок и для каждой надписи
// сравнивает цвет букв с цветом фона под ними — так, как это видно на экране (с учётом
// стекла, прозрачности и узоров). Контраст ниже порога (по умолчанию 2,5:1 — заметно хуже обычного серого текста подсказок) — замечание.
'use strict';

const { open, seed, SCREENS } = require('./lib');

const args = process.argv.slice(2);
const opt = (name, def) => { const a = args.find((x) => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : def; };
const flag = (name) => args.includes('--' + name);
const MIN = Number(opt('min', 2.5));
const STYLES = opt('style', 'glass,frosted,pixel,pastel,neon,minimal,paper,soft').split(',');
const THEMES = flag('dark') ? ['dark'] : flag('light') ? ['light'] : ['light', 'dark'];
const ONLY = opt('only', '').split(',').filter(Boolean);

// В браузере: все видимые надписи экрана — текст, рамка, класс.
function collect() {
  const out = [];
  const vw = innerWidth, vh = innerHeight;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue.trim();
    const el = n.parentElement;
    if (!text || !el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    // выключенные кнопки (например, стрелка «в будущее») и надписи из одних смайликов не считаем
    if (el.closest('[disabled]') || !/[\p{L}\p{N}]/u.test(text)) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 4 || r.height < 6 || r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh) continue;
    // надпись должна быть сверху (не под открытым окном и не под нижней панелью)
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!top || !(top === el || el.contains(top) || top.contains(el))) continue;
    out.push({
      text: text.slice(0, 28), cls: (el.className && el.className.baseVal === undefined ? el.className : '') || el.tagName.toLowerCase(),
      box: [Math.floor(r.left), Math.floor(r.top), Math.ceil(r.width), Math.ceil(r.height)], size: parseFloat(cs.fontSize),
    });
  }
  return out;
}

// В браузере: по снимку экрана посчитать контраст каждой надписи.
async function measure([b64, items]) {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
  const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  return items.map((it) => {
    const [x, y, w, h] = it.box;
    const d = ctx.getImageData(x, y, Math.min(w, cv.width - x), Math.min(h, cv.height - y)).data;
    // фон — самый частый цвет в рамке надписи (цвета округлены, чтобы сгладить узоры)
    const buckets = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const k = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4);
      let b = buckets.get(k); if (!b) { b = [0, 0, 0, 0]; buckets.set(k, b); }
      b[0]++; b[1] += d[i]; b[2] += d[i + 1]; b[3] += d[i + 2];
    }
    let best = null; buckets.forEach((b) => { if (!best || b[0] > best[0]) best = b; });
    const bg = [best[1] / best[0], best[2] / best[0], best[3] / best[0]];
    const lb = lum(...bg);
    // цвет букв — точка, сильнее всего отличающаяся от фона по яркости
    let fg = bg, far = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = lum(d[i], d[i + 1], d[i + 2]);
      const c = (Math.max(l, lb) + 0.05) / (Math.min(l, lb) + 0.05);
      if (c > far) { far = c; fg = [d[i], d[i + 1], d[i + 2]]; }
    }
    return Object.assign({ ratio: Math.round(far * 100) / 100, fg: hex(fg), bg: hex(bg) }, it);
  });
}

(async () => {
  let total = 0, bad = 0;
  for (const style of STYLES) {
    for (const theme of THEMES) {
      const app = await open({ dark: theme === 'dark' });
      const p = app.page;
      const helper = await p.context().newPage();
      await seed(p, { active: true });
      await p.evaluate(([dark, st]) => { PF.store.setPref('theme', dark ? 'dark' : 'light'); PF.store.setPref('style', st); }, [theme === 'dark', style]);
      await p.waitForTimeout(300);
      const found = new Map();
      for (const [name, go] of SCREENS) {
        if (ONLY.length && !ONLY.includes(name)) { if (!name.startsWith('sheet')) continue; }
        await go(p);
        if (ONLY.length && !ONLY.includes(name)) continue;
        await p.evaluate(() => window.scrollTo(0, 0));
        const items = await p.evaluate(collect);
        const shot = await p.screenshot();
        const res = await helper.evaluate(measure, [shot.toString('base64'), items]);
        total += res.length;
        res.filter((r) => r.ratio < MIN).forEach((r) => {
          const key = r.cls + '|' + r.fg + '|' + r.bg;
          if (!found.has(key)) found.set(key, Object.assign({ screen: name }, r));
        });
      }
      if (found.size) {
        console.log('\n' + style + ' / ' + (theme === 'dark' ? 'тёмная' : 'светлая') + ':');
        [...found.values()].sort((a, b) => a.ratio - b.ratio).forEach((r) => {
          bad++;
          console.log('  ' + String(r.ratio).padEnd(5) + r.fg + ' на ' + r.bg + '  ' + r.screen + ' · .' + String(r.cls).split(' ').join('.') + ' · «' + r.text + '»');
        });
      }
      if (app.errors.length) { console.log('ОШИБКИ (' + style + '/' + theme + '):\n' + app.errors.join('\n')); process.exitCode = 1; }
      await app.close();
    }
  }
  console.log('\nПроверено надписей: ' + total + '. Слабый контраст (ниже ' + MIN + ':1): ' + bad);
})();
