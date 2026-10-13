# tilefold.app

Сайт игры [Tilefold](https://apps.apple.com/app/id1110343407): главная на 17 языках игры,
политика конфиденциальности, поддержка, пресс-кит, страница задачи дня (`/daily`) и вызова
(`/duel`), файл привязки для App Clip. Устройство повторяет snowwall.app
(`~/Work/Projects/SnowWall-site`), iOS-части – capsla.app. Код игры – в отдельном
закрытом репозитории `~/Work/Projects/Tilefold`.

## Сборка

```sh
node build.mjs              # src/ + i18n/ → public/ (Node 18+, без зависимостей)
node tools/serve.mjs 8787   # предпросмотр с заголовками из _headers, CSP действует
node tools/check-i18n.mjs   # переводы против i18n/en.json
```

`public/` – в репозитории: Cloudflare Workers Builds отдаёт её как есть (`wrangler.jsonc`,
`assets.directory = ./public`), отдельного шага сборки там нет. **Пуш в `main` публикует
сайт** – работать в ветке, в `main` вливать готовое и собранное.

## Устройство

| Где | Что |
|---|---|
| `src/home.html` | главная, одна на все языки; тексты – `i18n/<язык>.json` |
| `src/pages/*.html` | политика (en, ru, uk), поддержка (en, ru, uk), пресса (en, ru), 404; заголовок `<!--meta {...} -->` задаёт адрес и язык |
| `src/data/palettes.json` | восемь палитр игры из `Theme.swift` – сборка делает из них CSS; страница перекрашивается выбранной палитрой |
| `src/js/board.js` | доска на первом экране: свайп и стрелки, без человека играет сама |
| `src/static/` | копируется как есть: `/daily`, `/duel`, `.well-known/apple-app-site-association`, `_headers`, иконки, картинки для соцсетей, пресс-кит |

## Что нельзя ломать

- `/daily` и `/duel` – на них ведут ссылки из игры, виджетов и App Clip. Адреса без
  перенаправлений: из подпапки ссылка отвечала редиректом, и клип не открывался.
- `.well-known/apple-app-site-association` – отдаётся как JSON (правило в `_headers`),
  иначе Apple молча его не принимает.
- `daily.html` и `duel.html` держат стили и скрипт в себе, поэтому в `_headers` у них свой,
  мягкий CSP вместо строгого общего.
- Ссылки на политику, поддержку и сайт в App Store Connect ведут сейчас на корень;
  политика с корня переехала на `/privacy/` – ссылку в ASC менять с выпуском 2.4.0.

## Материалы

```sh
python3 tools/shots.py      # скриншоты секций из витрины Tilefold/design/store
python3 tools/press.py      # кадры, иконка и ZIP для пресс-кита (держать ≤ 3 МБ)
node tools/og.mjs           # затем открыть http://localhost:8790/tools/og.html –
                            # картинки 1200×630 для соцсетей на все языки
```

Значки App Store – из `~/Work/Projects/Capsla/src` (для ar, hi, uk там английские).
