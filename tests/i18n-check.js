// Проверка переводов: каждая русская фраза из PF.t('…') и из списков (стили, трекеры и т. п.)
// должна быть в js/i18n-en.js.
//
//   node tests/i18n-check.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const files = ['js/util.js', 'js/store.js', 'js/ui.js', 'js/greet.js', 'js/app.js']
  .concat(fs.readdirSync(path.join(ROOT, 'js/screens')).map((f) => 'js/screens/' + f));

const keys = new Set();
for (const f of files) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of s.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) keys.add(m[1].replace(/\\'/g, "'"));
  // t(условие ? 'А' : 'Б')
  for (const m of s.matchAll(/\bt\([^()]*?\?\s*'([^']*)'\s*:\s*'([^']*)'/g)) { keys.add(m[1]); keys.add(m[2]); }
  // списки с полем name: 'Русское название' (стили, трекеры, занятия)
  if (f === 'js/util.js') for (const m of s.matchAll(/name:\s*'([^']*[А-Яа-яЁё][^']*)'/g)) keys.add(m[1]);
}

global.window = global;
global.PF = {};
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(ROOT, 'js/i18n-en.js'), 'utf8'));
const EN = global.PF.EN || {};
const missing = [...keys].filter((k) => /[А-Яа-яЁё]/.test(k) && !(k in EN));
if (missing.length) {
  console.log('Нет перевода (' + missing.length + '):\n' + missing.join('\n'));
  process.exitCode = 1;
} else {
  console.log('ok: все ' + keys.size + ' фраз переведены');
}
