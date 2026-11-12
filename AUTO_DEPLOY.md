# Автоматическое развёртывание из GitHub

Workflow `.github/workflows/deploy.yml` запускается при push в `master` и через Actions → Deploy server and GitHub Pages → Run workflow.

1. Проверки: серверные тесты, браузерные проверки SPA и сквозные сценарии API/SQLite для одного и разных origins.
2. Сервер: пакет передаётся по SSH на `78.17.57.32:22`, обновляется только контейнер конструктора, сохраняется тот же том SQLite.
3. GitHub Pages: после готовности API публикуются только `index.html`, `js/`, `css/`, `img/`. Сервер, `.env`, база и ключи в Pages не попадают.

API: `https://dance-sequence-builder.duckdns.org`.
Pages: `https://molostov-a.github.io/dance-sequence-builder/`.

## Настройки GitHub и VPS

Pages → Source: **GitHub Actions** (`build_type: workflow`). Окружение **production** разрешает деплой только из `master`. Его секреты: `DEPLOY_SSH_KEY` (отдельный deploy-ключ, не административный) и `DEPLOY_KNOWN_HOSTS` (проверенный SSH host key VPS). `StrictHostKeyChecking=yes`; SSH-пароль не нужен. Переменные `DEPLOY_HOST` и `DEPLOY_PORT` необязательны, по умолчанию используются указанные IP и порт 22.

На VPS deploy-ключ имеет `restrict` и принудительную команду `/usr/local/sbin/deploy-dance-sequence-builder`. Произвольные SSH-команды, терминал и forwarding недоступны. Обработчик использует только защищённые `shared/deploy-compose.yaml` и `shared/server.env`, которые архив не может заменить. Он проверяет пути/размер/типы файлов, запрещает ссылки и `.env`, сериализует деплои через `flock` и откатывает контейнер при неуспешном запуске или проверке revision. Каталог приложения — `/opt/dance-sequence-builder`, активный релиз — `current`, история — `releases/`.

Изменения самого обработчика и фиксированной Compose-конфигурации устанавливает владелец отдельно по административному SSH-доступу, а не из переданного архива.

## Pages и авторизация API

`js/runtime-config.js` выбирает адрес VPS для Pages и тот же origin для сайта VPS. Серверный `FRONTEND_URL=https://molostov-a.github.io/dance-sequence-builder/` разрешает CORS только этому origin и собственному origin API.

Pages отправляет непрозрачный токен сессии через `Authorization: Bearer` с `credentials: omit`; сторонние cookie не нужны. Токен хранится только в браузере пользователя, не входит в JSON библиотеки, экспорт, код или Actions secrets. Выход отзывает токен. При Google-входе сервер возвращает на фиксированный URL Pages одноразовый код, клиент проверяет state и обменивает код с исходным PKCE verifier. На сайте VPS остаётся HttpOnly/Secure cookie.

Привязка дополнительного Google-входа к аккаунту со сторонней почтой выполняется на сайте VPS. Google OAuth и SMTP настраиваются владельцем в `shared/server.env` по `SERVER_SETUP.md`.

## Обновления

После push проверьте все три jobs в Actions. Pages публикуется после готовности API; активный деплой не прерывается следующим push. `/api/health` возвращает `revision` — SHA развёрнутого коммита. Логи: `docker logs --tail=100 dance-sequence-builder-app-1`. Деплой не меняет Google/SMTP-настройки и не удаляет базу.

Коммиты и push выполняются только по явной команде владельца согласно `AGENTS.md`.
