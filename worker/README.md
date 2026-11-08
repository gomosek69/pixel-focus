# Сервер Pixel Focus (Cloudflare Workers)

Сервер нужен для подписки Premium: он создаёт счёт в Telegram Stars, подтверждает оплату,
хранит, у кого есть Premium, и отвечает боту на `/start`, `/terms`, `/paysupport`.
Код — один файл `worker.js`. Бесплатного тарифа Cloudflare хватает с запасом.

## Шаги (делаются один раз)

### 1. Регистрация
Зарегистрируйтесь на https://dash.cloudflare.com (бесплатно).

### 2. Создать Worker
1. В меню слева: **Compute (Workers) → Workers & Pages** → **Create** → **Create Worker** (или «Start with Hello World»).
2. Имя: `pixel-focus` → **Deploy**.
3. Нажмите **Edit code**, удалите весь текст и вставьте содержимое файла `worker/worker.js` из репозитория.
4. **Deploy**.
5. Запишите адрес воркера — он вида `https://pixel-focus.ВАШЕ-ИМЯ.workers.dev`.

### 3. Хранилище (KV)
1. В меню слева: **Storage & Databases → KV** → **Create** → имя `pixel-focus` → **Add**.
2. Вернитесь в ваш Worker → вкладка **Settings** → **Bindings** → **Add** → **KV namespace**.
3. **Variable name:** `PF` (именно так, большими буквами), **KV namespace:** `pixel-focus` → **Add binding / Deploy**.

### 4. Секреты
Worker → **Settings** → **Variables and Secrets** → **Add**. Тип каждой записи — **Secret**:

| Имя | Что вписать |
|---|---|
| `BOT_TOKEN` | токен бота: @BotFather → /mybots → ваш бот → **API Token** |
| `ADMIN_PASSWORD` | пароль режима разработчика (придумайте новый, сложный) |
| `ADMIN_ID` | *(рекомендуется)* ваш числовой Telegram ID — узнать у бота @userinfobot. Тогда войти в режим разработчика сможете только вы |

Нажмите **Deploy**.

### 5. Подключить бота к серверу
Откройте в браузере (подставьте свой адрес и пароль):

```
https://pixel-focus.ВАШЕ-ИМЯ.workers.dev/setup?key=ВАШ_ПАРОЛЬ
```

Должно появиться что-то вроде `{"webhook":{"ok":true,...},"commands":true,"kv":true,"token":true}`.
Если `kv` или `token` = `false` — проверьте шаги 3 и 4.

### 6. Сообщить адрес
Пришлите адрес воркера — его нужно вписать в `js/config.js` (`PF.API_URL`), после этого в приложении заработает оплата.

## Проверка
- Напишите боту `/start` — он должен ответить и показать кнопку «Открыть Pixel Focus».
- `/terms` — условия, `/paysupport` — поддержка по оплате.
- В приложении: Настройки → Premium → «Оформить за 149 ⭐».

## Где что хранится (KV)
- `sub:<id>` — оплаченная подписка и срок;
- `gift:<id>` — выданный в режиме разработчика Premium (0 = навсегда);
- `user:<id>`, `uname:<имя>` — чтобы выдавать Premium по @username (пользователь должен хотя бы раз открыть приложение);
- `rl:<id>` — счётчик неудачных попыток входа разработчика (блокировка на час после 5).

Пароль и токен хранятся только в секретах Cloudflare и никогда не попадают в репозиторий.
