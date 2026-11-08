// Pixel Focus — сервер на Cloudflare Workers.
//
// Что делает:
//  • отвечает боту: /start (кнопка «Открыть»), /terms (условия), /paysupport (поддержка по оплате);
//  • создаёт счёт на подписку Premium в Telegram Stars (149 ⭐ за 30 дней) и подтверждает оплату;
//  • хранит, у кого и до какого числа Premium (хранилище Cloudflare KV, привязка с именем PF);
//  • отвечает приложению, есть ли у пользователя Premium (проверяя подпись Telegram);
//  • режим разработчика: вход по паролю, выдача и отзыв Premium.
//
// Секреты (Cloudflare → Worker → Settings → Variables and Secrets), в коде их НЕТ:
//  BOT_TOKEN       — токен бота от @BotFather;
//  ADMIN_PASSWORD  — пароль режима разработчика;
//  ADMIN_ID        — (необязательно) ваш числовой Telegram ID: тогда войти сможете только вы.
// Привязка KV: имя переменной PF.

const APP_URL = 'https://gomosek69.github.io/pixel-focus/';
const SUPPORT_EMAIL = 'zxcshade999@gmail.com';
const PRICE_STARS = 149;
const PERIOD = 2592000; // 30 дней — единственный срок подписки, который поддерживает Telegram
const PAYLOAD = 'premium_v1';
const DAY = 86400;

// ---------------------------------------------------------------------------
// Вспомогательное

const enc = new TextEncoder();

async function hmacRaw(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, typeof data === 'string' ? enc.encode(data) : data));
}
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

// Сравнение строк за одинаковое время (чтобы по скорости ответа нельзя было подбирать).
function safeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

const now = () => Math.floor(Date.now() / 1000);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS),
});

async function tg(env, method, body) {
  const r = await fetch('https://api.telegram.org/bot' + env.BOT_TOKEN + '/' + method, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  });
  return r.json();
}

// Секрет для вебхука выводится из токена бота — отдельно задавать не нужно.
async function webhookSecret(env) {
  return hex(await hmacRaw(enc.encode(env.BOT_TOKEN), 'webhook')).slice(0, 48);
}

// Проверка данных запуска Mini App (initData). Возвращает пользователя или null.
async function verifyInitData(env, initData) {
  if (!initData || typeof initData !== 'string') return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dcs = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => k + '=' + v).join('\n');
  const secret = await hmacRaw(enc.encode('WebAppData'), env.BOT_TOKEN);
  const check = hex(await hmacRaw(secret, dcs));
  if (!safeEqual(check, hash)) return null;
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || now() - authDate > 7 * DAY) return null;
  try { return JSON.parse(params.get('user') || 'null'); } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// Хранилище (KV)
//  sub:<id>    — оплаченная подписка { until, charge }
//  gift:<id>   — выданный Premium { until (0 = навсегда), by }
//  user:<id>   — { id, username, name, seen }
//  uname:<имя> — id пользователя по @username
//  rl:<id>     — счётчик неудачных попыток входа разработчика

const getJ = async (env, key) => { const v = await env.PF.get(key); return v ? JSON.parse(v) : null; };
const putJ = (env, key, val, opts) => env.PF.put(key, JSON.stringify(val), opts);

async function premiumOf(env, id) {
  const t = now();
  const sub = await getJ(env, 'sub:' + id);
  const gift = await getJ(env, 'gift:' + id);
  const paid = sub && sub.until > t ? sub.until : 0;
  const gifted = gift && (gift.until === 0 || gift.until > t) ? (gift.until === 0 ? Infinity : gift.until) : 0;
  const until = Math.max(paid, gifted);
  return {
    premium: until > t,
    until: until === Infinity ? 0 : until, // 0 = навсегда
    forever: until === Infinity,
    source: gifted >= paid && gifted ? 'gift' : (paid ? 'paid' : null),
  };
}

async function rememberUser(env, u) {
  const rec = { id: u.id, username: u.username || '', name: [u.first_name, u.last_name].filter(Boolean).join(' '), seen: now() };
  await putJ(env, 'user:' + u.id, rec);
  if (u.username) await env.PF.put('uname:' + u.username.toLowerCase(), String(u.id));
}

// ---------------------------------------------------------------------------
// Бот

function isRu(from) {
  return String((from && from.language_code) || '').toLowerCase().startsWith('ru');
}

const TEXT = {
  start: {
    ru: '👋 Привет! Это Pixel Focus — учёт работы, учёбы и отдыха с пиксельным персонажем.\n\nНажмите кнопку ниже, чтобы открыть приложение.',
    en: '👋 Hi! This is Pixel Focus — track work, study and rest with a pixel character.\n\nTap the button below to open the app.',
  },
  open: { ru: 'Открыть Pixel Focus', en: 'Open Pixel Focus' },
  terms: {
    ru: '📄 Условия использования Pixel Focus\n\n' +
      '1. Pixel Focus — приложение для учёта времени. Базовые функции бесплатны.\n' +
      '2. Pixel Focus Premium — подписка за ' + PRICE_STARS + ' Telegram Stars на 30 дней. Она продлевается автоматически, пока вы её не отмените в Telegram.\n' +
      '3. Premium открывает дополнительные функции внутри приложения. Монеты и вещи в приложении не имеют денежной ценности и не обмениваются на деньги.\n' +
      '4. Ваши записи хранятся в облаке Telegram; на нашем сервере хранится только ваш Telegram ID, имя пользователя и срок подписки.\n' +
      '5. Вопросы по оплате и возвраты — команда /paysupport или почта ' + SUPPORT_EMAIL + '.\n' +
      '6. Условия могут обновляться; актуальная версия всегда доступна по команде /terms.',
    en: '📄 Pixel Focus Terms of Use\n\n' +
      '1. Pixel Focus is a time-tracking app. Basic features are free.\n' +
      '2. Pixel Focus Premium is a subscription for ' + PRICE_STARS + ' Telegram Stars per 30 days. It renews automatically until you cancel it in Telegram.\n' +
      '3. Premium unlocks extra features inside the app. In-app coins and items have no monetary value and cannot be exchanged for money.\n' +
      '4. Your entries are stored in Telegram cloud; our server stores only your Telegram ID, username and subscription period.\n' +
      '5. Payment questions and refunds — /paysupport or ' + SUPPORT_EMAIL + '.\n' +
      '6. These terms may be updated; the current version is always available via /terms.',
  },
  paysupport: {
    ru: '💬 Поддержка по оплате\n\nЕсли с оплатой Premium что-то не так или вы хотите вернуть средства, напишите на ' + SUPPORT_EMAIL +
      ' и укажите ваш Telegram ID: {id}.\n\nОтменить автопродление можно в Telegram: Настройки → Telegram Stars → подписки.',
    en: '💬 Payment support\n\nIf something went wrong with your Premium payment or you want a refund, email ' + SUPPORT_EMAIL +
      ' and include your Telegram ID: {id}.\n\nYou can cancel auto-renewal in Telegram: Settings → Telegram Stars → subscriptions.',
  },
  thanks: {
    ru: '⭐ Спасибо! Pixel Focus Premium активен до {date}. Откройте приложение — всё уже разблокировано.',
    en: '⭐ Thank you! Pixel Focus Premium is active until {date}. Open the app — everything is unlocked.',
  },
};

async function onUpdate(env, upd) {
  // Подтверждение перед оплатой — нужно ответить за 10 секунд.
  if (upd.pre_checkout_query) {
    const q = upd.pre_checkout_query;
    const ok = q.invoice_payload === PAYLOAD && q.currency === 'XTR';
    await tg(env, 'answerPreCheckoutQuery', ok
      ? { pre_checkout_query_id: q.id, ok: true }
      : { pre_checkout_query_id: q.id, ok: false, error_message: 'Unknown product' });
    return;
  }
  const msg = upd.message;
  if (!msg) return;
  const from = msg.from || {};
  const lang = isRu(from) ? 'ru' : 'en';

  // Успешная оплата (первая или автопродление).
  if (msg.successful_payment) {
    const sp = msg.successful_payment;
    if (sp.invoice_payload === PAYLOAD) {
      const prev = await getJ(env, 'sub:' + from.id);
      const base = Math.max(now(), prev && prev.until ? prev.until : 0);
      const until = sp.subscription_expiration_date || (base + PERIOD);
      await putJ(env, 'sub:' + from.id, { until, charge: sp.telegram_payment_charge_id, at: now() });
      await rememberUser(env, from);
      const date = new Date(until * 1000).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US');
      await tg(env, 'sendMessage', { chat_id: msg.chat.id, text: TEXT.thanks[lang].replace('{date}', date) });
    }
    return;
  }
  // Возврат средств — Premium снимается.
  if (msg.refunded_payment) {
    await env.PF.delete('sub:' + from.id);
    return;
  }

  const text = (msg.text || '').trim();
  const cmd = text.split(/[\s@]/)[0].toLowerCase();
  if (cmd === '/start') {
    await tg(env, 'sendMessage', {
      chat_id: msg.chat.id, text: TEXT.start[lang],
      reply_markup: { inline_keyboard: [[{ text: TEXT.open[lang], web_app: { url: APP_URL } }]] },
    });
  } else if (cmd === '/terms') {
    await tg(env, 'sendMessage', { chat_id: msg.chat.id, text: TEXT.terms[lang] });
  } else if (cmd === '/paysupport') {
    await tg(env, 'sendMessage', { chat_id: msg.chat.id, text: TEXT.paysupport[lang].replace('{id}', from.id) });
  }
}

// ---------------------------------------------------------------------------
// Режим разработчика

const MAX_TRIES = 5;

async function adminToken(env, id, exp) {
  return exp + '.' + hex(await hmacRaw(enc.encode(env.BOT_TOKEN), 'admin:' + id + ':' + exp));
}
async function checkAdminToken(env, id, token) {
  if (!token || typeof token !== 'string') return false;
  const exp = Number(token.split('.')[0]);
  if (!exp || exp < now()) return false;
  return safeEqual(await adminToken(env, id, exp), token);
}
const allowedAdmin = (env, id) => !env.ADMIN_ID || String(env.ADMIN_ID).split(',').map((s) => s.trim()).includes(String(id));

// Найти пользователя по @username или числовому ID.
async function findUser(env, who) {
  who = String(who || '').trim().replace(/^@/, '');
  if (!who) return null;
  if (/^\d+$/.test(who)) return Number(who);
  const id = await env.PF.get('uname:' + who.toLowerCase());
  return id ? Number(id) : null;
}

// ---------------------------------------------------------------------------
// Приложение (API)

async function api(env, path, body) {
  const user = await verifyInitData(env, body.initData);
  if (!user) return json({ error: 'auth' }, 401);

  if (path === '/api/status') {
    await rememberUser(env, user);
    return json(await premiumOf(env, user.id));
  }

  if (path === '/api/invoice') {
    const isEn = !isRu(user);
    const r = await tg(env, 'createInvoiceLink', {
      title: 'Pixel Focus Premium',
      description: isEn
        ? 'All features unlocked: unlimited tasks, full history and stats, rare items, dances, colors, +25% coins.'
        : 'Все функции: безлимитные задачи, вся история и статистика, редкие вещи, танцы, цвета, +25% монет.',
      payload: PAYLOAD,
      currency: 'XTR',
      prices: [{ label: 'Premium', amount: PRICE_STARS }],
      subscription_period: PERIOD,
    });
    if (!r.ok) return json({ error: 'invoice', detail: r.description }, 502);
    return json({ link: r.result });
  }

  if (path === '/api/admin/login') {
    if (!env.ADMIN_PASSWORD || !allowedAdmin(env, user.id)) return json({ error: 'denied' }, 403);
    const rlKey = 'rl:' + user.id;
    const tries = Number(await env.PF.get(rlKey) || 0);
    if (tries >= MAX_TRIES) return json({ error: 'locked' }, 429);
    if (!safeEqual(body.password, env.ADMIN_PASSWORD)) {
      await env.PF.put(rlKey, String(tries + 1), { expirationTtl: 3600 });
      return json({ error: 'wrong', left: MAX_TRIES - tries - 1 }, 403);
    }
    await env.PF.delete(rlKey);
    const exp = now() + 30 * DAY;
    return json({ token: await adminToken(env, user.id, exp), id: user.id });
  }

  if (path === '/api/admin') {
    if (!allowedAdmin(env, user.id) || !(await checkAdminToken(env, user.id, body.token))) return json({ error: 'denied' }, 403);
    const action = body.action;
    if (action === 'self') {
      // Мой Premium: включить (навсегда) или выключить (для проверки бесплатной версии).
      if (body.on) await putJ(env, 'gift:' + user.id, { until: 0, by: user.id, at: now() });
      else await env.PF.delete('gift:' + user.id);
      return json(await premiumOf(env, user.id));
    }
    if (action === 'grant' || action === 'revoke') {
      const target = await findUser(env, body.user);
      if (!target) return json({ error: 'nouser' }, 404);
      if (action === 'grant') {
        const days = Number(body.days || 0);
        await putJ(env, 'gift:' + target, { until: days > 0 ? now() + days * DAY : 0, by: user.id, at: now() });
      } else {
        await env.PF.delete('gift:' + target);
      }
      const info = await getJ(env, 'user:' + target);
      return json(Object.assign({ id: target, user: info }, await premiumOf(env, target)));
    }
    if (action === 'list') {
      const list = await env.PF.list({ prefix: 'gift:', limit: 100 });
      const out = [];
      for (const k of list.keys) {
        const id = k.name.slice(5);
        const g = await getJ(env, k.name);
        const u = await getJ(env, 'user:' + id);
        out.push({ id: Number(id), username: u ? u.username : '', name: u ? u.name : '', until: g ? g.until : null });
      }
      return json({ gifts: out });
    }
    return json({ error: 'action' }, 400);
  }

  return json({ error: 'notfound' }, 404);
}

// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // Telegram присылает сюда сообщения боту и платежи.
    if (url.pathname === '/tg' && request.method === 'POST') {
      if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== await webhookSecret(env)) {
        return new Response('forbidden', { status: 403 });
      }
      try { await onUpdate(env, await request.json()); } catch (e) { console.error(e); }
      return new Response('ok');
    }

    // Однократная настройка: подключить бота к серверу. Открыть в браузере:
    //   https://<адрес-воркера>/setup?key=<ADMIN_PASSWORD>
    if (url.pathname === '/setup') {
      if (!env.ADMIN_PASSWORD || !safeEqual(url.searchParams.get('key') || '', env.ADMIN_PASSWORD)) {
        return new Response('forbidden', { status: 403 });
      }
      const hook = await tg(env, 'setWebhook', {
        url: url.origin + '/tg', secret_token: await webhookSecret(env),
        allowed_updates: ['message', 'pre_checkout_query'], drop_pending_updates: true,
      });
      const cmdsRu = await tg(env, 'setMyCommands', { language_code: 'ru', commands: [
        { command: 'start', description: 'Открыть приложение' },
        { command: 'terms', description: 'Условия использования' },
        { command: 'paysupport', description: 'Поддержка по оплате' },
      ] });
      const cmds = await tg(env, 'setMyCommands', { commands: [
        { command: 'start', description: 'Open the app' },
        { command: 'terms', description: 'Terms of use' },
        { command: 'paysupport', description: 'Payment support' },
      ] });
      return json({ webhook: hook, commands: cmds.ok && cmdsRu.ok, kv: !!env.PF, token: !!env.BOT_TOKEN });
    }

    if (url.pathname.startsWith('/api/') && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (e) { /* пусто */ }
      try { return await api(env, url.pathname, body); } catch (e) {
        console.error(e);
        return json({ error: 'server' }, 500);
      }
    }

    return new Response('Pixel Focus server is running.', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  },
};
