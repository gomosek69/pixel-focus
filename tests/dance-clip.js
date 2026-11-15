// Проверка: не обрезается ли танцующий персонаж рамками, в которых он показан.
//
//   node tests/dance-clip.js
//
// Открывает приложение, надевает самый «большой» наряд (пышные волосы, корона, крылья)
// и в каждом месте, где показан персонаж (главный экран, гардероб, карточки магазина,
// вкладка «Я»), останавливает каждый танец на каждом кадре. Если какая-то часть персонажа
// выходит за рамку с обрезкой (overflow: hidden) или выступает за свою карточку больше чем
// на 1 точку экрана — печатает замечание.
'use strict';

const { open, seed, tab } = require('./lib');

const OUTFITS = [
  { hair: 'hair_afro', acc: 'acc_crown', top: 'top_robe' },
  { hair: 'hair_long', acc: 'acc_wings', top: 'top_kimono', pants: 'pants_tutu' },
  { hair: 'hair_fire', acc: 'acc_wizard', top: 'top_sculpt', pants: 'pants_bell' },
];

// Места, где показан персонаж: [название, как дойти, селектор картинки]
const PLACES = [
  ['главный экран', async (p) => { await tab(p, 'stats'); await tab(p, 'timer'); }, '#screen svg.pix'],
  ['гардероб, большой', async (p) => { await tab(p, 'char'); }, '.char-stage svg.pix'],
  ['гардероб, карточка', async (p) => { await tab(p, 'char'); }, '.item-pic svg.pix'],
  ['вкладка «Я»', async (p) => { await tab(p, 'me'); }, '.me-hero-char svg.pix'],
];

(async () => {
  const app = await open({ motion: true });
  const p = app.page;
  await seed(p, {});
  const dances = await p.evaluate(() => Object.keys(PF.char.DANCES).map((id) => ({ id, n: PF.char.DANCES[id].frames.length, dur: PF.char.DANCES[id].dur })));
  const notes = [];
  let checked = 0;
  for (const eq of OUTFITS) {
    for (const d of dances) {
      // надеть наряд и танец напрямую (без покупки): подменяем «внешность» для всех экранов
      await p.evaluate(([eq, dance]) => {
        const look = { g: 'f', skin: 1, eyes: 0, hc: 1, eq: Object.assign({}, PF.char.BASE, eq, { dance: 'dance_' + dance }), col: {} };
        PF.store.look = () => JSON.parse(JSON.stringify(look));
      }, [eq, d.id]);
      for (const [place, go, sel] of PLACES) {
        await go(p);
        for (let f = 0; f < d.n; f++) {
          const over = await p.evaluate(([sel, f, n, dur]) => {
            const svg = document.querySelector(sel);
            if (!svg) return null;
            if (!svg.classList.contains('dancing')) return { worst: 0, who: '', still: true };
            const delay = -((f + 0.5) * dur / n);
            svg.querySelectorAll('.pp').forEach((el) => { el.style.animationPlayState = 'paused'; el.style.animationDelay = delay + 's'; });
            void svg.getBoundingClientRect();
            let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
            svg.querySelectorAll('rect').forEach((el) => {
              const q = el.getBoundingClientRect();
              if (q.left < l) l = q.left; if (q.top < t) t = q.top; if (q.right > r) r = q.right; if (q.bottom > b) b = q.bottom;
            });
            let worst = 0, who = '', out = 0, frame = '';
            for (let a = svg.parentElement; a && a !== document.body; a = a.parentElement) {
              const cs = getComputedStyle(a);
              const q = a.getBoundingClientRect();
              const o = Math.max(q.left - l, q.top - t, r - q.right, b - q.bottom);
              // ближайшая видимая рамка (карточка): персонаж не должен из неё выступать
              if (!frame && /(^| )(card|item)( |$)/.test(a.className)) { frame = a.className; out = o; }
              if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
              if (o > worst) { worst = o; who = a.className || a.id || a.tagName; }
            }
            return { worst: Math.round(worst), who, out: Math.round(out), frame };
          }, [sel, f, d.n, d.dur]);
          checked++;
          if (!over || over.still) { notes.push(place + ': персонаж не найден или не танцует'); continue; }
          if (over.out > 1) notes.push(place + ': танец ' + d.id + ', кадр ' + (f + 1) + ', наряд ' + eq.hair + '+' + eq.acc + ' — выступает на ' + over.out + ' px за карточку «' + over.frame + '»');
          if (over.worst > 1) notes.push(place + ': танец ' + d.id + ', кадр ' + (f + 1) + ', наряд ' + eq.hair + '+' + eq.acc + ' — выходит на ' + over.worst + ' px за «' + over.who + '»');
        }
      }
    }
  }
  // одинаковые замечания (разные кадры) — в одну строку
  const uniq = [...new Set(notes.map((s) => s.replace(/, кадр \d+/, '')))];
  console.log(uniq.join('\n') || 'замечаний нет');
  console.log('\nПроверено кадров: ' + checked + '. Замечаний: ' + uniq.length);
  if (app.errors.length) { console.log('ОШИБКИ:\n' + app.errors.join('\n')); process.exitCode = 1; }
  await app.close();
})();
