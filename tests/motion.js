// Проверка анимаций интерфейса: с включёнными анимациями проходит по приложению (вкладки,
// запуск и остановка занятия, окна, графики, магазин, задачи, трекеры) в каждом стиле.
//
//   node tests/motion.js [--style=glass,pixel] [--shots=папка]
//
// После каждого шага ждёт конца анимаций и проверяет:
//   • нет ошибок в консоли;
//   • нет «застрявших» элементов: с текстом, но невидимых (прозрачность почти 0) или уехавших
//     за экран из-за незавершённой анимации;
//   • страница не шире экрана (нет горизонтальной прокрутки).
// С --shots дополнительно сохраняет кадры посреди анимаций — посмотреть глазами.
'use strict';

const fs = require('fs');
const path = require('path');
const { open, seed, tab } = require('./lib');

const args = process.argv.slice(2);
const opt = (name, def) => { const a = args.find((x) => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : def; };
const STYLES = opt('style', 'glass,frosted,pixel,pastel,neon,minimal,paper,soft').split(',');
const SHOTS = opt('shots', '');

// В браузере: что на экране не так после анимации.
function inspect() {
  const bad = [];
  const vw = innerWidth;
  if (document.documentElement.scrollWidth > vw + 1) bad.push('страница шире экрана на ' + (document.documentElement.scrollWidth - vw) + ' px');
  const visible = (el) => { for (let a = el; a && a !== document.body; a = a.parentElement) { if (Number(getComputedStyle(a).opacity) < 0.15) return a; } return null; };
  document.querySelectorAll('#screen *, .sheet *, .tabbar *').forEach((el) => {
    if (!el.firstChild || el.firstChild.nodeType !== 3 || !el.firstChild.nodeValue.trim()) return;
    if (el.closest('svg, [disabled], .fx, [hidden]') || !el.getClientRects().length) return;
    const dim = visible(el);
    const name = (el.className || el.tagName) + ' «' + el.textContent.trim().slice(0, 24) + '»';
    if (dim) { bad.push('невидимо: ' + name + ' (прозрачность у .' + String(dim.className).split(' ')[0] + ')'); return; }
    const r = el.getBoundingClientRect();
    // уехало за край экрана по горизонтали (ленты с прокруткой не считаем)
    if ((r.right < 0 || r.left > vw) && !el.closest('.cat-tabs, .ct-row, .chips, [data-scroll]')) {
      let scroller = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { if (/(auto|scroll)/.test(getComputedStyle(a).overflowX)) { scroller = true; break; } }
      if (!scroller) bad.push('за экраном: ' + name);
    }
  });
  return [...new Set(bad)];
}

(async () => {
  let total = 0;
  const notes = [];
  for (const style of STYLES) {
    const app = await open({ motion: true });
    const p = app.page;
    await seed(p, {});
    await p.evaluate((st) => { PF.store.setPref('theme', 'light'); PF.store.setPref('style', st); }, style);
    await p.waitForTimeout(400);
    let shot = 0;
    const frames = async (name, n, gap) => {
      if (!SHOTS) return;
      fs.mkdirSync(SHOTS, { recursive: true });
      for (let i = 0; i < n; i++) { await p.waitForTimeout(gap); await p.screenshot({ path: path.join(SHOTS, style + '-' + String(++shot).padStart(2, '0') + '-' + name + '-' + (i + 1) + '.png') }); }
    };
    const step = async (name, fn, shots) => {
      try { await fn(); } catch (e) { notes.push(style + ' · ' + name + ': шаг не выполнен — ' + String(e.message).split('\n')[0]); return; }
      if (shots) await frames(name, shots[0], shots[1]);
      await p.waitForTimeout(1300);
      const bad = await p.evaluate(inspect);
      total++;
      bad.forEach((b) => notes.push(style + ' · ' + name + ': ' + b));
    };
    const click = (sel) => p.click(sel, { timeout: 3000 });
    const closeSheet = async () => { await p.evaluate(() => PF.ui.closeTopSheet()); await p.waitForTimeout(450); };

    await step('вкладка «Статистика»', () => p.click('.tab[data-tab=stats]'), [3, 90]);
    await step('вкладка «Таймер»', () => p.click('.tab[data-tab=timer]'), [3, 90]);
    await step('старт занятия', () => click('.act-btn[data-a=work]'), [4, 110]);
    await step('остановка занятия', async () => { await p.evaluate(() => { PF.store.S.active.s -= 600; }); await click('[data-action=stop]'); }, [4, 110]);
    await step('окно «Новая запись»', () => click('[data-action=add]'), [3, 90]);
    await step('закрытие окна', closeSheet);
    await step('окно «Мои занятия»', () => click('[data-action=acts]'));
    await step('закрытие окна 2', closeSheet);
    await step('окно ставок', () => click('.balance'));
    await step('закрытие окна 3', closeSheet);
    await step('статистика', () => tab(p, 'stats'));
    for (const c of ['percent', 'pie', 'lines', 'cumulative', 'bars']) await step('график ' + c, async () => { await p.evaluate((x) => { const b = document.querySelector('[data-chart=' + x + ']'); if (b) b.click(); }, c); }, c === 'pie' ? [3, 110] : null);
    for (const m of ['day', 'year', 'month']) await step('период ' + m, () => click('[data-mode=' + m + ']'));
    await step('гардероб', () => tab(p, 'char'));
    await step('магазин', () => click('[data-mode=shop]'), [3, 90]);
    for (const c of ['top', 'pants', 'shoes', 'acc', 'dance', 'hair']) await step('магазин: ' + c, () => click('[data-cat=' + c + ']'));
    await step('окно покупки', () => click('.item:has(.price)'), [3, 90]);
    await step('закрытие окна 4', closeSheet);
    await step('задачи', () => tab(p, 'tasks'));
    await step('новая задача', async () => { await p.fill('.quick input', 'Проверка анимаций'); await p.keyboard.press('Enter'); });
    await step('задача выполнена', () => click('.task .check'), [3, 90]);
    await step('вкладка «Я»', () => tab(p, 'me'));
    await step('трекер веса', () => click('[data-open=weight]'), [3, 90]);
    await step('назад из трекера', () => click('[data-action=back]'));
    await step('+1 стакан', () => click('[data-water]'));
    await step('настройки', () => tab(p, 'settings'));
    await step('тёмная тема', () => p.evaluate(() => PF.store.setPref('theme', 'dark')), [3, 90]);
    await step('таймер в тёмной теме', () => tab(p, 'timer'));
    if (app.errors.length) notes.push(style + ': ошибки в консоли — ' + [...new Set(app.errors)].join(' | '));
    await app.close();
  }
  const uniq = [...new Set(notes)];
  console.log(uniq.join('\n') || 'замечаний нет');
  console.log('\nПроверено шагов: ' + total + '. Замечаний: ' + uniq.length);
  if (uniq.length) process.exitCode = 1;
})();
