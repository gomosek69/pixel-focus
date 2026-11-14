// Листы с персонажами для просмотра глазами: все вещи, сочетания, кадры танцев.
//
//   node tests/char-sheets.js <папка> <набор> [--size=96] [--g=m|f] [--part=N]
//
// Наборы:
//   items        — все вещи по категориям на обоих полах
//   hats         — каждая причёска с каждым аксессуаром
//   tops-pants   — каждый верх с каждыми штанами
//   pants-shoes  — каждые штаны с каждой обувью
//   dances       — каждый танец по кадрам в нескольких нарядах
//   colors       — перекраска вещей и цвета волос
// Большие наборы режутся на несколько картинок (…-1.png, …-2.png).
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const outDir = path.resolve(pos[0] || 'sheets');
const set = pos[1] || 'items';
const opt = (name, def) => { const a = args.find((x) => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : def; };
const SIZE = Number(opt('size', 96));

const ROOT = path.resolve(__dirname, '..');
const CSS = `
  body { margin: 0; background: #e9e6f2; font: 10px/1.1 sans-serif; color: #333; }
  .grid { display: flex; flex-wrap: wrap; gap: 2px; padding: 4px; }
  .cell { text-align: center; overflow: hidden; padding-top: ${Math.round(SIZE * 0.16)}px; }
  .cell div { height: 11px; white-space: nowrap; overflow: hidden; }
  .head { flex-basis: 100%; font: bold 13px sans-serif; padding: 6px 2px 2px; }
  .pix { display: block; image-rendering: pixelated; margin: 0 auto; }
  .pp { transform-box: view-box; }
  .fx-b, .fx-shimmer { opacity: 0; }
`;

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1640, height: 600 } });
  await page.setContent('<html><head><style>' + CSS + '</style></head><body><div class="grid" id="g"></div></body></html>');
  await page.addScriptTag({ content: 'window.PF={};' + fs.readFileSync(path.join(ROOT, 'js/char.js'), 'utf8') });

  // В браузере: построить список ячеек для набора. Ячейка: { look, label } или { head }.
  const count = await page.evaluate(([setName, gOpt]) => {
    const C = PF.char;
    const by = (cat) => C.ITEMS.filter((it) => it.cat === cat);
    const look = (g, eq, extra) => Object.assign({ g, skin: 1, eyes: 0, hc: 1, eq: Object.assign({}, C.BASE, eq), col: {} }, extra || {});
    const cells = [];
    const gs = gOpt ? [gOpt] : ['m', 'f'];
    if (setName === 'items') {
      ['hair', 'top', 'pants', 'shoes', 'acc'].forEach((cat) => gs.forEach((g) => {
        cells.push({ head: cat + ' — ' + (g === 'm' ? 'мужской' : 'женский') });
        by(cat).forEach((it, i) => { const eq = {}; eq[cat] = it.id; cells.push({ look: look(g, eq, { skin: i % 6, hc: i % 6 }), label: it.id.replace(cat + '_', '') }); });
      }));
    } else if (setName === 'hats') {
      by('acc').forEach((acc) => {
        cells.push({ head: acc.id });
        by('hair').forEach((h, i) => cells.push({ look: look(i % 2 ? 'f' : 'm', { hair: h.id, acc: acc.id }), label: h.id.replace('hair_', '') }));
      });
    } else if (setName === 'tops-pants') {
      by('top').forEach((top) => {
        cells.push({ head: top.id });
        by('pants').forEach((pn, i) => cells.push({ look: look(gOpt || (i % 2 ? 'f' : 'm'), { top: top.id, pants: pn.id }), label: pn.id.replace('pants_', '') }));
      });
    } else if (setName === 'pants-shoes') {
      by('pants').forEach((pn) => {
        cells.push({ head: pn.id });
        by('shoes').forEach((sh, i) => cells.push({ look: look(gOpt || (i % 2 ? 'f' : 'm'), { pants: pn.id, shoes: sh.id }), label: sh.id.replace('shoes_', '') }));
      });
    } else if (setName === 'dances') {
      const outfits = [
        ['обычный', {}],
        ['длинные волосы, мантия', { hair: 'hair_long', top: 'top_robe', acc: 'acc_wings' }],
        ['волны, кимоно, юбка', { hair: 'hair_wavy', top: 'top_kimono', pants: 'pants_skirt', shoes: 'shoes_kneesocks', acc: 'acc_bunny' }],
        ['афро, пуховик, клёш', { hair: 'hair_afro', top: 'top_puffer', pants: 'pants_bell', shoes: 'shoes_platformboots', acc: 'acc_headphones' }],
        ['хвостики, жакет, баллоны', { hair: 'hair_twintails', top: 'top_sculpt', pants: 'pants_balloon', shoes: 'shoes_chunky', acc: 'acc_puffscarf' }],
        ['эльф, тренч, шляпа', { hair: 'hair_elf', top: 'top_trench', pants: 'pants_wide', shoes: 'shoes_cowboy', acc: 'acc_fedora' }],
      ];
      Object.keys(C.DANCES).forEach((d) => {
        const n = C.DANCES[d].frames.length;
        outfits.forEach(([name, eq], oi) => {
          cells.push({ head: d + ' — ' + name });
          for (let f = 0; f < n; f++) cells.push({ look: look(oi % 2 ? 'f' : 'm', Object.assign({ dance: 'dance_' + d }, eq)), label: 'кадр ' + (f + 1), frame: f, frames: n, dur: C.DANCES[d].dur });
        });
      });
    } else if (setName === 'colors') {
      cells.push({ head: 'цвета волос' });
      ['hair_long', 'hair_afro', 'hair_twintails', 'hair_spiky'].forEach((h) => C.HAIR.forEach((x, i) => cells.push({ look: look('f', { hair: h }, { hc: i }), label: h.replace('hair_', '') + ' ' + i })));
      ['top_hoodie', 'top_blazer', 'top_robe', 'pants_skirt', 'pants_cargo', 'shoes_sneakers', 'shoes_winged', 'acc_scarf', 'acc_wings', 'hair_fire'].forEach((id) => {
        const it = C.byId[id]; cells.push({ head: 'перекраска: ' + id });
        C.PALETTE.forEach((x, i) => { const eq = {}, col = {}; eq[it.cat] = id; col[it.cat] = i; cells.push({ look: look('m', eq, { col }), label: x.ru }); });
      });
    }
    window.__cells = cells;
    return cells.length;
  }, [set, opt('g', '')]);

  // Рисуем порциями, чтобы картинка не была слишком высокой.
  const perSheet = Number(opt('per', 220));
  let part = 0;
  for (let from = 0; from < count; from += perSheet) {
    part++;
    if (opt('part', '') && Number(opt('part')) !== part) continue;
    await page.evaluate(([a, b, size]) => {
      const C = PF.char, g = document.getElementById('g');
      g.innerHTML = '';
      window.__cells.slice(a, b).forEach((cell) => {
        if (cell.head) { g.insertAdjacentHTML('beforeend', '<div class="head">' + cell.head + '</div>'); return; }
        const d = document.createElement('div'); d.className = 'cell'; d.style.width = (size + 6) + 'px';
        d.innerHTML = C.svg(cell.look, size) + '<div>' + cell.label + '</div>';
        if (cell.frames) {
          // остановить танец на нужном кадре
          const delay = -((cell.frame + 0.5) * cell.dur / cell.frames);
          d.querySelectorAll('.pp').forEach((el) => { el.style.animationPlayState = 'paused'; el.style.animationDelay = delay + 's'; });
        }
        g.appendChild(d);
      });
    }, [from, from + perSheet, SIZE]);
    await page.waitForTimeout(150);
    const file = path.join(outDir, set + (opt('g', '') ? '-' + opt('g') : '') + '-' + part + '.png');
    await page.screenshot({ path: file, fullPage: true });
    console.log(file);
  }
  await browser.close();
})();
