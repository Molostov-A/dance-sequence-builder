# Серверное хранение на Ubuntu 24.04

Основной адрес: **https://dance-sequence-builder.duckdns.org**, VPS: **78.17.57.32**.

На указанном VPS уже работает nginx, поэтому для него используется `compose.nginx.yaml`: приложение доступно только на `127.0.0.1:8088`, HTTPS обслуживает существующий nginx. Caddy из основного Compose нужен только для отдельного сервера без своего reverse proxy.

Клиент доступен с VPS и GitHub Pages, API работает на VPS. В текущей установке HTTPS принимает nginx, SQLite хранит отдельную библиотеку каждого пользователя. Caddy в Compose оставлен для установки на отдельный сервер без reverse proxy. Google Диск — дополнительная функция; пользователи не вводят технические параметры.

## Что уже подготовлено

- Docker Compose: Node.js 24, Caddy, постоянные тома для базы и TLS.
- Вход через Google (серверный OpenID Connect, без доступа к Drive).
- Вход по шестизначному коду из письма: срок 10 минут, ограничение попыток и отправок, код в базе хранится как HMAC.
- Сессия на 30 дней в HttpOnly/Secure/SameSite cookie; защита изменяющих запросов Origin + CSRF.
- Доступ к данным определяется сессией. Переданный пользователем ID не может открыть чужую библиотеку.
- Автосохранение с задержкой 1,2 секунды, сверка раз в минуту, атомарная проверка версии при записи.
- Раздельные кэши гостя и аккаунтов, явный перенос гостевой библиотеки, сохранение локальной копии при сетевой ошибке.
- История последних десяти версий и скрипт резервного копирования SQLite.

## 1. Настройка домена и запуск

Проверьте в DuckDNS, что `dance-sequence-builder.duckdns.org` указывает на `78.17.57.32`. На VPS порты 80 и 443 должны быть доступны Caddy. Если эти порты уже обслуживает ваш обратный прокси, используйте его для HTTPS, направив запросы на сервис `app:8080` в общей Docker-сети; второй прокси на тех же портах не запускайте.

Скопируйте проект на VPS. В корне проекта:

```bash
cp server/.env.example server/.env
openssl rand -hex 48
```

Вставьте полученную случайную строку в `SESSION_SECRET` файла `server/.env`. Файл исключён из Git и Docker-образа; не отправляйте его содержимое в чат. Уже подготовленный локальный `server/.env` содержит случайный секрет, но для production лучше создать отдельный на VPS.

Для указанного домена уже заданы:

```dotenv
PUBLIC_URL=https://dance-sequence-builder.duckdns.org
APP_DOMAIN=dance-sequence-builder.duckdns.org
DB_PATH=/data/dance.sqlite
TRUST_PROXY=1
```

Затем заполните хотя бы один способ входа из следующих разделов и запустите:

```bash
docker compose --env-file server/.env config --quiet
docker compose --env-file server/.env up -d --build
docker compose --env-file server/.env logs --tail=100 app proxy
```

На текущем VPS с nginx вместо этого используются:

```bash
docker compose -p dance-sequence-builder --env-file server/.env -f compose.yaml -f compose.nginx.yaml config --quiet
docker compose -p dance-sequence-builder --env-file server/.env -f compose.yaml -f compose.nginx.yaml up -d --build app
```

Каталоги развёртывания: `/opt/dance-sequence-builder/releases/<UTC-время>`, активный релиз — `/opt/dance-sequence-builder/current`, серверные настройки — `/opt/dance-sequence-builder/shared/server.env` (доступ только root). `server/.env` внутри релиза ссылается на этот файл. Compose project name фиксирован как `dance-sequence-builder`, чтобы обновления использовали тот же том `app_data`.

Для этого режима домен обслуживает `/etc/nginx/sites-available/dance-sequence-builder`, сертификат — Certbot. Перед обновлением nginx выполняется `nginx -t`; изменения применяются через reload.

Caddy автоматически получает сертификат только в отдельном режиме без nginx. На текущем VPS сертификат выпущен Certbot для существующего nginx. GitHub Pages не запускает сервер, но клиент Pages обращается к API VPS через точный CORS origin и bearer-сессию без сторонних cookie. На самом сайте VPS используется HttpOnly cookie. Подробности автоматического обновления и обоих режимов авторизации — `AUTO_DEPLOY.md`.

## 2. Вход через Google: однократно настраивает владелец

1. В [Google Cloud Console](https://console.cloud.google.com/) создайте проект и настройте Google Auth Platform: название приложения, контактный email, аудиторию. В режиме Testing добавьте аккаунты тестовых пользователей.
2. Создайте OAuth client типа **Web application**.
3. Authorized redirect URI:
   `https://dance-sequence-builder.duckdns.org/api/auth/google/callback`
4. Запишите Client ID и Client secret в `server/.env`:

```dotenv
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
```

Для входа используются только `openid email profile`. Google Drive API и API key не требуются. Реквизиты Drive, если понадобятся, относятся к отдельной запасной функции.

После изменения `.env` пересоздайте контейнер:

```bash
docker compose --env-file server/.env up -d --force-recreate app
```

На текущем VPS к командам Compose добавляются `-p dance-sequence-builder -f compose.yaml -f compose.nginx.yaml`; выполнять их следует из `/opt/dance-sequence-builder/current`.

Личная библиотека аккаунта определяется пользователем приложения. Google и вход по почте объединяются для подтверждённого Google-адреса, которым Google управляет (Gmail/Workspace). Если Google-аккаунт использует стороннюю почту и такой аккаунт приложения уже существует, сначала нужен код из письма; затем можно нажать «Привязать Google». Это предотвращает присоединение к чужому аккаунту по устаревшей сторонней почте.

## 3. Вход по почте

SMTP пока отсутствует, поэтому в текущей конфигурации почтовый вход выключен. Не нужно устанавливать собственный почтовый сервер на VPS: можно подключить SMTP выбранного почтового провайдера/сервиса транзакционных писем.

После получения реквизитов заполните:

```dotenv
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=Конструктор связок <verified-sender@example.com>
```

`SMTP_FROM` должен быть разрешён вашим провайдером. Для порта 465 обычно используется `SMTP_SECURE=true`; для 587 — STARTTLS (`false`). На публичном HTTPS-сервере незашифрованная SMTP-сессия не разрешена. Для отправки от своего домена провайдер может потребовать подтверждение DNS; если DuckDNS не позволяет создать нужные записи, используйте поддерживаемый провайдером подтверждённый адрес отправителя или отдельный почтовый домен.

Без настроенных Google и SMTP приложение доступно в гостевом режиме, а кнопки входа отключены. Реальные коды не выводятся в логи и не возвращаются API. После настройки SMTP проверьте доставку на реальный адрес владельца.

## 4. Данные, конфликты и выход

- При входе данные аккаунта загружаются с сервера. Гостевая библиотека не отправляется автоматически: для нового аккаунта есть кнопка «Перенести гостевую библиотеку».
- При выходе открывается гостевая копия; приватные данные аккаунта исчезают из интерфейса и не подмешиваются в следующий аккаунт.
- Если сеть пропала после входа, изменения сохраняются в кэше этого аккаунта и отправятся при восстановлении связи. При перезагрузке без доступного сервера аккаунт не подтверждается: его кэш остаётся на устройстве до восстановления входа.
- Если менялись обе версии, доступны «Загрузить с сервера» и «Сохранить мою версию». Перед заменой можно сделать экспорт.
- Библиотека хранится одним JSON-снимком, до 2 MiB и 4000 узлов. SQLite хранит историю десяти предыдущих версий. Автоматического объединения одновременных правок нет.
- В серверном режиме фоновое автосохранение в Google Drive отключено; дополнительная связь с Drive разделена по аккаунтам и используется явно через окно резервного хранения.

## 5. Резервные копии и обновления

Не удаляйте Docker-том `app_data`; `docker compose down -v` удалит его вместе с библиотеками и аккаунтами.

Сделать согласованную копию работающей SQLite, включая изменения WAL:

```bash
docker compose --env-file server/.env exec app node backup.mjs /data/backups/dance-backup.sqlite
docker compose --env-file server/.env cp app:/data/backups/dance-backup.sqlite ./dance-backup.sqlite
```

Храните копию вне VPS. Для восстановления остановите `app`, замените `/data/dance.sqlite` согласованной копией (старые `-wal`/`-shm` убираются только при остановленном приложении), затем запустите `app`. Сервер содержит email и историю данных — доступ к бэкапам должен быть ограничен владельцем.

Обновление кода:

```bash
docker compose --env-file server/.env up -d --build
```

## Проверки разработки

```bash
cd server
npm ci
npm test
cd ..
node tests/run-tests.js
node tests/server-browser-smoke.mjs
```

Последний сценарий использует изолированный Chrome, настоящий HTTP API и SQLite, но перехватывает почту в памяти. Он проверяет вход двух пользователей, раздельные данные, автосохранение, восстановление сессии, выход, конфликты, офлайн-правки, восстановление сети, смену аккаунта и ширины 1400/900/390 px. `SMOKE_CROSS_ORIGIN=1 node tests/server-browser-smoke.mjs` проверяет разные origins и bearer-сессию, как на Pages. Настоящие Google OAuth и SMTP требуют реквизитов владельца и отдельной проверки после развёртывания.

## Основания протокола

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Проверка Google ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [Node.js SQLite](https://nodejs.org/api/sqlite.html)
- [SMTP Nodemailer](https://nodemailer.com/smtp)

Приложение развёрнуто на указанном VPS, DNS соответствует IP и HTTPS проверен. Google OAuth и SMTP ещё не настроены, поэтому соответствующие кнопки входа пока недоступны. Секреты следует вводить непосредственно на VPS в `shared/server.env`; новые деплои их сохраняют.
