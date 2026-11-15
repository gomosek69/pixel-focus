// Автопроверка рисунков персонажа (без браузера).
//
//   node tests/char-audit.js
//
// Для каждой вещи на обоих полах проверяет:
//   • «обрезка»   — вещь пытается рисовать за краем картинки (часть рисунка теряется);
//   • «край»      — рисунок касается самого края картинки (контуру не остаётся места);
//   • «оторвано»  — маленькие группы точек, не соединённые с остальным персонажем;
//   • «часть»     — точка привязана не к той части тела (рука/туловище), из-за чего в танце она «отстаёт»;
//   • «дырка»     — просвет внутри силуэта, сквозь который виден фон (кроме обычных промежутков
//                   у шеи, между рукой и телом и между ногами).
// Потом те же проверки для сочетаний: причёска + аксессуар, верх + штаны, штаны + обувь, верх + аксессуар.
// В сочетании замечание печатается, только если его нет у каждой из вещей по отдельности.
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
  const res = { clip: 0, edge: [], loose: [], part: [], holes: [] };
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
  // дырки: пустые точки, до которых нельзя дойти снаружи (4 соседа)
  const seen = new Uint8Array(N * NH), stack = [];
  const push = (i) => { if (!filled[i] && !seen[i]) { seen[i] = 1; stack.push(i); } };
  for (let x = 0; x < N; x++) { push(x); push((NH - 1) * N + x); }
  for (let y = 0; y < NH; y++) { push(y * N); push(y * N + N - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % N, y = (i / N) | 0;
    if (x > 0) push(i - 1); if (x < N - 1) push(i + 1); if (y > 0) push(i - N); if (y < NH - 1) push(i + N);
  }
  // Считаются только настоящие просветы: точка без закрашенных соседей (иначе её закроет контур)
  // и не в обычных промежутках — у шеи, между рукой и телом, между ногами.
  const G0 = geo(g);
  const natural = (x, y) => (y >= 24 && y <= 33)
    || (y >= G0.ay0 && y <= G0.ay1 + 4 && ((x > G0.ax1 && x <= G0.tx0 + 1) || (x >= G0.tx1 - 1 && x < G0.bx0)))
    || (y >= G0.ly0 && x >= G0.lx1 && x <= G0.rx0);
  for (let i = 0; i < N * NH; i++) {
    if (filled[i] || seen[i]) continue;
    const x = i % N, y = ((i / N) | 0) - OY;
    if (natural(x, y)) continue;
    if (filled[i - 1] || filled[i + 1] || filled[i - N] || filled[i + N]) continue;
    res.holes.push('(' + x + ',' + y + ')');
  }
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
    const holes = r.holes.filter((h) => !base.holes.includes(h));
    if (holes.length) msgs.push('дырка: ' + holes.length + ' т., например ' + holes.slice(0, 4).join(' '));
    if (msgs.length) { problems++; lines.push(it.id + ' [' + g + '] ' + msgs.join(' | ')); }
  });
});

// Сочетания вещей.
const by = (cat) => C.ITEMS.filter((it) => it.cat === cat);
const single = {};
const one = (g, it) => single[g + it.id] || (single[g + it.id] = audit(g, { [it.cat]: it.id }));
let combos = 0;
[['hair', 'acc'], ['top', 'pants'], ['pants', 'shoes'], ['top', 'acc'], ['hair', 'top']].forEach(([ca, cb]) => {
  by(ca).forEach((a) => by(cb).forEach((b) => ['m', 'f'].forEach((g) => {
    combos++;
    const ra = one(g, a), rb = one(g, b), r = audit(g, { [ca]: a.id, [cb]: b.id });
    const msgs = [];
    if (r.clip > ra.clip + rb.clip) msgs.push('обрезка: ' + r.clip + ' т.');
    const edge = r.edge.filter((e) => !ra.edge.includes(e) && !rb.edge.includes(e));
    if (edge.length) msgs.push('край: ' + edge.join(', '));
    const loose = r.loose.filter((l) => !ra.loose.includes(l) && !rb.loose.includes(l));
    if (loose.length) msgs.push('оторвано: ' + loose.join('; '));
    const holes = r.holes.filter((h) => !ra.holes.includes(h) && !rb.holes.includes(h));
    if (holes.length) msgs.push('дырка: ' + holes.length + ' т., например ' + holes.slice(0, 4).join(' '));
    if (msgs.length) { problems++; lines.push(a.id + ' + ' + b.id + ' [' + g + '] ' + msgs.join(' | ')); }
  })));
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
console.log('\nПроверено сочетаний: ' + combos + '. Всего замечаний: ' + problems);
