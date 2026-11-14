// Автопроверка рисунков персонажа (без браузера).
//
//   node tests/char-audit.js
//
// Для каждой вещи на обоих полах проверяет:
//   • «обрезка»   — вещь пытается рисовать за краем картинки (часть рисунка теряется);
//   • «край»      — рисунок касается самого края картинки (контуру не остаётся места);
//   • «оторвано»  — маленькие группы точек, не соединённые с остальным персонажем;
//   • «часть»     — точка привязана не к той части тела (рука/туловище), из-за чего в танце она «отстаёт».
'use strict';

const path = require('path');
global.window = { PF: {} };
require(path.resolve(__dirname, '../js/char.js'));
const C = global.window.PF.char;
const { Canvas, N, OY, P, geo } = C._dbg;
const NH = N + OY;
const IX = (x, y) => (y + OY) * N + x;

function look(g, eq) { return { g, skin: 1, eyes: 0, hc: 1, eq: Object.assign({}, C.BASE, eq), col: {} }; }

// Связные области закрашенных точек (8 соседей). Возвращает массив областей (списки индексов).
function components(filled) {
  const seen = new Uint8Array(N * NH), out = [];
  for (let s = 0; s < N * NH; s++) {
    if (!filled[s] || seen[s]) continue;
    const comp = [], stack = [s]; seen[s] = 1;
    while (stack.length) {
      const i = stack.pop(); comp.push(i);
      const x = i % N, y = (i / N) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= N || yy >= NH) continue;
        const j = yy * N + xx;
        if (filled[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    out.push(comp);
  }
  return out;
}

function audit(g, eq) {
  const res = { clip: 0, edge: [], loose: [], part: [] };
  Canvas.onClip = () => { res.clip++; };
  const c = C.compose(look(g, eq));
  Canvas.onClip = null;
  const filled = c.m.map((m) => (m ? 1 : 0));
  // эффекты (слои свечения) считаем вместе с основной картинкой для «края», но не для «оторвано»
  const all = filled.slice();
  c.fx.forEach((l) => l.c.m.forEach((m, i) => { if (m) all[i] = 1; }));
  for (let x = 0; x < N; x++) if (all[IX(x, -OY)]) { res.edge.push('верх'); break; }
  for (let y = -OY; y < N; y++) if (all[IX(0, y)]) { res.edge.push('лево'); break; }
  for (let y = -OY; y < N; y++) if (all[IX(N - 1, y)]) { res.edge.push('право'); break; }
  for (let x = 0; x < N; x++) if (all[IX(x, N - 1)]) { res.edge.push('низ'); break; }
  const comps = components(filled).sort((a, b) => b.length - a.length);
  comps.slice(1).forEach((cm) => {
    if (cm.length > 12) return; // руки отделены от туловища линией контура — это нормально
    const i = cm[0];
    res.loose.push(cm.length + ' т. у (' + (i % N) + ',' + (((i / N) | 0) - OY) + ')');
  });
  // привязка к частям тела: точки рук должны быть в колонках рук, а точки туловища и ног — не в них
  const G = geo(g);
  let badArm = 0, badTorso = 0;
  for (let y = G.ay0 + 1; y <= G.ay1; y++) {
    for (let x = 0; x < N; x++) {
      const i = IX(x, y); if (!c.m[i]) continue;
      const p = c.part[i];
      const inL = x <= G.ax1, inR = x >= G.bx0;
      if ((p === P.larm && x > G.ax1 + 3) || (p === P.rarm && x < G.bx0 - 3)) badArm++;
      if (p === P.head && (inL || inR) && y > G.ay0 + 2 && eq.hair === undefined) badTorso++;
    }
  }
  if (badArm) res.part.push('рука: ' + badArm);
  if (badTorso) res.part.push('голова в зоне рук: ' + badTorso);
  return res;
}

let problems = 0;
const lines = [];

// Тело без одежды должно быть зеркально-симметричным (кроме лица).
['m', 'f'].forEach((g) => {
  const c = C.compose({ g, skin: 1, eyes: 0, hc: 1, eq: { hair: null, top: null, pants: null, shoes: null, acc: null, dance: null }, col: {} });
  const bad = [];
  for (let y = 26; y < N; y++) for (let x = 0; x < N / 2; x++) {
    if (!!c.m[IX(x, y)] !== !!c.m[IX(N - 1 - x, y)]) bad.push('(' + x + ',' + y + ')');
  }
  if (bad.length) { problems++; lines.push('тело [' + g + '] несимметрично: ' + bad.length + ' т., например ' + bad.slice(0, 6).join(' ')); }
});
C.ITEMS.filter((it) => it.cat !== 'dance').forEach((it) => {
  ['m', 'f'].forEach((g) => {
    const eq = {}; eq[it.cat] = it.id;
    const base = audit(g, {});
    const r = audit(g, eq);
    const msgs = [];
    if (r.clip) msgs.push('обрезка: ' + r.clip + ' т.');
    const edge = r.edge.filter((e) => !base.edge.includes(e));
    if (edge.length) msgs.push('край: ' + edge.join(', '));
    const loose = r.loose.filter((l) => !base.loose.includes(l));
    if (loose.length) msgs.push('оторвано: ' + loose.join('; '));
    if (r.part.length) msgs.push('часть: ' + r.part.join(', '));
    if (msgs.length) { problems++; lines.push(it.id + ' [' + g + '] ' + msgs.join(' | ')); }
  });
});
// Почти симметричные вещи: если слева и справа отличается всего несколько точек, это обычно
// не задумка, а ошибка на один пиксель. Печатается как подсказка, в замечания не входит.
const hints = [];
C.ITEMS.filter((it) => it.cat !== 'dance').forEach((it) => {
  const eq = {}; eq[it.cat] = it.id;
  const c = C.compose(look('m', eq));
  let diff = 0; const ex = [];
  for (let y = -OY; y < N; y++) for (let x = 0; x < N / 2; x++) {
    if (!!c.m[IX(x, y)] !== !!c.m[IX(N - 1 - x, y)]) { diff++; if (ex.length < 4) ex.push('(' + x + ',' + y + ')'); }
  }
  if (diff > 0 && diff <= 8) hints.push(it.id + ': ' + diff + ' т. ' + ex.join(' '));
});
console.log(lines.join('\n') || 'замечаний нет');
if (hints.length) console.log('\nПочти симметричные (проверить глазами):\n' + hints.join('\n'));
console.log('\nВсего замечаний: ' + problems);
