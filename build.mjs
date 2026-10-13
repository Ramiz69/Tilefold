#!/usr/bin/env node
// Собирает public/ из src/ и i18n/. Без зависимостей: только стандартная библиотека Node 18+.
//
//   node build.mjs
//
// Что делает: копирует src/static как есть (там и то, что нельзя трогать: /daily, /duel, файл
// привязки App Clip); кладёт src/assets, CSS и JS-модули в public/assets/ с хэшем в имени;
// собирает главную на каждый язык из src/home.html + i18n/<язык>.json и служебные страницы из
// src/pages/ в src/page.html; пишет sitemap.xml; печатает вес страниц.
//
// Устройство взято у snowwall.app (~/Work/Projects/SnowWall-site), iOS-части – у capsla.app.

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname, extname, basename, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'public');
const SITE = 'https://tilefold.app';
const APP_ID = '1110343407';
const APP_STORE = `https://apps.apple.com/app/id${APP_ID}`;
// Ссылки, по которым нажимают, несут кампанию App Store (`ct`): в App Analytics видно, с какой
// части сайта пришла загрузка. В структурированных данных остаётся чистый адрес.
const campaign = ct => `https://apps.apple.com/app/apple-store/id${APP_ID}?pt=118223827&amp;ct=${ct}&amp;mt=8`;
// Все языки игры, в порядке меню. Язык попадает на сайт – главная, меню, sitemap, – как только
// появляется i18n/<код>.json. Флагов нет: флаг называет страну, а не язык.
const LANGUAGES = [
  { code: 'en', short: 'EN', name: 'English' },
  { code: 'ru', short: 'RU', name: 'Русский' },
  { code: 'uk', short: 'UK', name: 'Українська' },
  { code: 'ar', short: 'AR', name: 'العربية' },
  { code: 'de', short: 'DE', name: 'Deutsch' },
  { code: 'es', short: 'ES', name: 'Español' },
  { code: 'fr', short: 'FR', name: 'Français' },
  { code: 'hi', short: 'HI', name: 'हिन्दी' },
  { code: 'id', short: 'ID', name: 'Bahasa Indonesia' },
  { code: 'it', short: 'IT', name: 'Italiano' },
  { code: 'ja', short: 'JA', name: '日本語' },
  { code: 'ko', short: 'KO', name: '한국어' },
  { code: 'pt-BR', short: 'PT', name: 'Português (Brasil)' },
  { code: 'tr', short: 'TR', name: 'Türkçe' },
  { code: 'vi', short: 'VI', name: 'Tiếng Việt' },
  { code: 'zh-Hans', short: '简', name: '简体中文' },
  { code: 'zh-Hant', short: '繁', name: '繁體中文' },
].map(l => ({ ...l, path: l.code === 'en' ? '/' : `/${l.code.toLowerCase()}/` }));
const OG_LOCALE = {
  en: 'en_US', ru: 'ru_RU', uk: 'uk_UA', ar: 'ar_AR', de: 'de_DE', es: 'es_ES', fr: 'fr_FR', hi: 'hi_IN', id: 'id_ID',
  it: 'it_IT', ja: 'ja_JP', ko: 'ko_KR', 'pt-BR': 'pt_BR', tr: 'tr_TR', vi: 'vi_VN', 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW',
};
const RTL = new Set(['ar']);
const BUILT = LANGUAGES.filter(l => existsSync(join(ROOT, 'i18n', `${l.code}.json`)));
const LANGS = BUILT.map(l => l.code);

const read = p => readFileSync(p, 'utf8');
const write = (p, s) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s); };
const hash = buf => createHash('sha256').update(buf).digest('hex').slice(0, 10);
const walk = dir => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const i18n = code => JSON.parse(read(join(ROOT, 'i18n', `${code}.json`)));

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// ---------- статика, как есть ----------
for (const f of walk(join(SRC, 'static'))) {
  if (basename(f) === '.DS_Store') continue;
  const out = join(DIST, relative(join(SRC, 'static'), f));
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(f, out);
}

// ---------- ресурсы с хэшем ----------
const assets = new Map();   // 'assets/x.svg' | 'css/home.css' | 'js/main.js' -> '/assets/x.<hash>.svg'
function emit(key, content, ext) {
  // Скриншоты одного кадра на разных языках называются одинаково, поэтому язык – в имени файла.
  const stem = key.startsWith('assets/shots/') ? key.split('/').slice(2).join('-').replace(/\.\w+$/, '') : basename(key, extname(key));
  const name = `${stem}.${hash(content)}${ext || extname(key)}`;
  write(join(DIST, 'assets', name), content);
  assets.set(key, `/assets/${name}`);
  return `/assets/${name}`;
}
for (const f of walk(join(SRC, 'assets'))) if (basename(f) !== '.DS_Store') emit(relative(SRC, f), readFileSync(f));

const minCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').trim();
// Палитры игры – CSS из src/data/palettes.json: фон, поднос, клетки, текст и плитки с цветом цифры.
// Выбранная палитра – атрибут data-palette на <html> (его ставит theme-init.js до отрисовки),
// тёмная тема – data-theme или системная, как у меню оформления.
const PALETTES = JSON.parse(read(join(SRC, 'data/palettes.json'))).palettes;
function luminance(hex) {
  const ch = i => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
}
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// Цвет цифры – как в игре (Theme.ink(on:)): из тёплого почти-чёрного и белого тот, что контрастнее.
const inkOn = bg => contrast(bg, '#181412') >= contrast(bg, '#FFFFFF') ? '#181412' : '#FFFFFF';
const TILE_LEVELS = 15;
function paletteCss() {
  const vars = (p, i) => `--bg:${p.bg[i]};--tray:${p.tray[i]};--cell:${p.cell[i]};--ink:${p.ink[i]};`;
  const tiles = p => Array.from({ length: TILE_LEVELS }, (_, k) => {
    const c = p.tiles[Math.min(k, p.tiles.length - 1)];
    return `--t${k + 1}:${c};--k${k + 1}:${inkOn(c)};`;
  }).join('');
  return PALETTES.map(p => {
    const light = p.id === 'classic' ? `:root:not([data-palette]),:root[data-palette="${p.id}"]` : `:root[data-palette="${p.id}"]`;
    const dark = light;
    return `${light}{${vars(p, 0)}${tiles(p)}}
@media (prefers-color-scheme:dark){${dark.split(',').map(s => s + ':not([data-theme="light"])').join(',')}{${vars(p, 1)}}}
${dark.split(',').map(s => s + '[data-theme="dark"]').join(',')}{${vars(p, 1)}}
.sw-${p.id}{--s0:${p.tray[0]};--s1:${p.tiles[2]};--s2:${p.tiles[3]};--s3:${p.tiles[4]};--s4:${p.tiles[5]};}`;
  }).join('\n');
}
const tokens = read(join(SRC, 'css/tokens.css')) + '\n' + paletteCss();
for (const sheet of ['home', 'page']) emit(`css/${sheet}.css`, minCss(tokens + '\n' + read(join(SRC, `css/${sheet}.css`))));

const minJs = s => s.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//')).join('\n') + '\n';
const jsDir = join(SRC, 'js');
const importRe = /(import\s[^'"]*?from\s*|import\s*)(['"])\.\/([\w-]+\.js)\2/g;
const deps = f => [...read(join(jsDir, f)).matchAll(importRe)].map(m => m[3]);
const done = new Set();
function buildModule(f, stack = []) {
  if (done.has(f)) return;
  if (stack.includes(f)) throw new Error(`import cycle: ${[...stack, f].join(' -> ')}`);
  for (const d of deps(f)) buildModule(d, [...stack, f]);
  const src = read(join(jsDir, f)).replace(importRe, (_, a, q, dep) => `${a}${q}./${basename(assets.get(`js/${dep}`))}${q}`);
  emit(`js/${f}`, minJs(src));
  done.add(f);
}
buildModule('main.js');
buildModule('page.js');
emit('js/theme-init.js', minJs(read(join(jsDir, 'theme-init.js'))));
const preload = entry => [...deps(entry)].map(f => `<link rel="modulepreload" href="${assets.get(`js/${f}`)}">`).join('\n');

// ---------- шаблоны ----------
// {{ключ.путь}} – значение, {{#список}}…{{/список}} – повтор ({{.поле}} или {{.}}),
// {{@src/путь}} – адрес ресурса с хэшем. Отсутствующий ключ – ошибка, а не пустая строка.
function render(tpl, data, where) {
  tpl = tpl.replace(/{{#([\w.]+)}}([\s\S]*?){{\/\1}}/g, (_, key, body) => {
    const list = get(data, key);
    if (!Array.isArray(list)) throw new Error(`${where}: {{#${key}}} is not a list`);
    return list.map(item => body.replace(/{{\.(\w*)}}/g, (_, f) => {
      const v = f ? item[f] : item;
      if (v === undefined) throw new Error(`${where}: missing .${f} in ${key}`);
      return v;
    })).join('');
  });
  tpl = tpl.replace(/{{([\w.]+)}}/g, (_, key) => {
    const v = get(data, key);
    if (v === undefined || v === null || typeof v === 'object') throw new Error(`${where}: missing {{${key}}}`);
    return String(v);
  });
  tpl = tpl.replace(/{{@([^}]+)}}/g, (_, p) => {
    const url = assets.get(p);
    if (!url) throw new Error(`${where}: unknown asset ${p}`);
    return url;
  });
  return tpl;
}

// Иконки для сетки «Везде» (stroke = currentColor).
const ICONS = {
  widget: '<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="2"/><rect x="3.5" y="13" width="17" height="7.5" rx="2"/>',
  shortcuts: '<rect x="4" y="4" width="10" height="10" rx="3"/><rect x="10" y="10" width="10" height="10" rx="3"/>',
  ipad: '<rect x="4" y="2.5" width="16" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  mac: '<rect x="3" y="4.5" width="18" height="12" rx="1.8"/><path d="M8 20h8"/><path d="M12 16.5V20"/>',
  fold: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M12 4v16" stroke-dasharray="2 2"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8.5 20h7"/>',
  clip: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9.5 9.5h5v5h-5z"/>',
  control: '<rect x="4" y="4" width="16" height="16" rx="5"/><path d="M9 12h6M12 9v6"/>',
  offline: '<path d="M3 3l18 18"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4.3-2.4M19 12.5a10 10 0 0 0-2.6-1.8M12 20h.01"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? fail('icon ' + name)}</svg>`;
const CHECK = '<svg class="yes" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4.5 10.5 3.5 3.5 7.5-8"/></svg>';

// ---------- меню в шапке: язык и оформление ----------
const svg16 = (body, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
const GLOBE = svg16('<circle cx="8" cy="8" r="6.25"/><path d="M1.75 8h12.5M8 1.75c1.8 1.7 2.7 3.8 2.7 6.25S9.8 12.55 8 14.25M8 1.75C6.2 3.45 5.3 5.55 5.3 8s.9 4.55 2.7 6.25"/>', 'globe');
const THEME_ICONS = {
  auto: '<circle cx="8" cy="8" r="5.75"/><path d="M8 2.25a5.75 5.75 0 0 0 0 11.5Z" fill="currentColor"/>',
  light: '<circle cx="8" cy="8" r="2.75"/><path d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9"/>',
  dark: '<path d="M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85Z"/>',
};
const CHEVRON = svg16('<path d="m5 6.5 3 3 3-3"/>', 'chev');
const TICK = svg16('<path d="m3.5 8.5 3 3 6-7"/>', 'tick');

function headerMenus(ui, here, hrefs) {
  const cur = LANGUAGES.find(l => l.code === here);
  const langItems = BUILT.map(l => `<li><a class="menu-item" tabindex="-1" href="${hrefs[l.code]}" hreflang="${l.code}" lang="${l.code}"${l.code === here ? ' aria-current="page"' : ''}><span class="label">${l.name}</span>${TICK}</a></li>`).join('');
  const modes = ['auto', 'light', 'dark'];
  const themeIcon = m => svg16(THEME_ICONS[m], 'ico');
  return `<div class="menu-wrap lang-menu">
      <button class="chip menu-btn" type="button" aria-expanded="false" aria-controls="lang-list"><span class="vh">${ui.language}: ${cur.name}</span> ${GLOBE}<span aria-hidden="true">${cur.short}</span>${CHEVRON}</button>
      <ul class="menu" id="lang-list" aria-label="${ui.language}">${langItems}</ul>
    </div>
    <div class="menu-wrap theme-menu" data-theme-menu>
      <button class="chip menu-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="theme-list"><span class="vh">${ui.theme.label}:</span> ${modes.map(m => `<span class="tv tv-${m}">${themeIcon(m)}<span class="tvl">${ui.theme[m]}</span></span>`).join('')}${CHEVRON}</button>
      <div class="menu" id="theme-list" role="menu" aria-label="${ui.theme.label}">${modes.map(m => `<button class="menu-item" type="button" role="menuitemradio" aria-checked="${m === 'auto'}" tabindex="-1" data-value="${m}">${themeIcon(m)}<span class="label">${ui.theme[m]}</span>${TICK}</button>`).join('')}</div>
    </div>`;
}
const homeHrefs = Object.fromEntries(BUILT.map(l => [l.code, l.path]));

// Значок App Store: чёрный для светлой темы, белый для тёмной. Свой есть у всех 17 языков;
// на всякий случай без своего – английский.
function badge(lang, ui, ct, lazy = false) {
  const code = existsSync(join(SRC, 'assets/badges', `badge-black-${lang.toLowerCase()}.svg`)) ? lang.toLowerCase() : 'en';
  const svg = read(join(SRC, 'assets/badges', `badge-black-${code}.svg`));
  const [, , w, h] = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  const width = Math.round(48 * w / h);
  const img = tone => `<img class="badge-${tone}" src="${assets.get(`assets/badges/badge-${tone}-${code}.svg`)}" alt="${ui.badgeAlt}" width="${width}" height="48"${lazy ? ' loading="lazy"' : ''}>`;
  return `<a class="badge" href="${campaign(ct)}">${img('black')}${img('white')}</a>`;
}
// Скриншот секции на языке страницы; язык без своей витрины берёт английскую.
const shot = (lang, name) => assets.get(`assets/shots/${lang.toLowerCase()}/${name}.webp`) || assets.get(`assets/shots/en/${name}.webp`) || fail(`shot ${name}`);

function homeData(t) {
  const url = SITE + t.path;
  const cell = v => v === true ? `${CHECK}<span class="vh">${t.ui.included}</span>`
    : v === false ? `<span class="no" aria-hidden="true">—</span><span class="vh">${t.ui.notIncluded}</span>` : v;
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'MobileApplication',
    name: 'Tilefold',
    url,
    inLanguage: t.lang,
    description: t.meta.description,
    image: `${SITE}/icon.png`,
    operatingSystem: 'iOS 26 or later, iPadOS 26 or later, macOS on Apple silicon',
    applicationCategory: 'GameApplication',
    installUrl: APP_STORE,
    offers: [{ '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: APP_STORE }],
  };
  const alternates = [...BUILT.map(l => `<link rel="alternate" hreflang="${l.code}" href="${SITE}${l.path}">`),
    `<link rel="alternate" hreflang="x-default" href="${SITE}/">`].join('\n');
  const ogLocales = [`<meta property="og:locale" content="${OG_LOCALE[t.lang]}">`,
    ...BUILT.filter(l => l.code !== t.lang).map(l => `<meta property="og:locale:alternate" content="${OG_LOCALE[l.code]}">`)].join('\n');
  const ogImage = existsSync(join(SRC, 'static/og', `og-${t.lang}.png`)) ? `og-${t.lang}.png` : 'og-en.png';
  const shots = Object.fromEntries(['board', 'etude', 'hint', 'review', 'daily', 'palettes', 'statistics', 'sizes'].map(n => [n, shot(t.lang, n)]));
  return {
    ...t,
    dir: RTL.has(t.lang) ? 'rtl' : 'ltr', alternates, ogLocales, ogImage, shots,
    site: SITE, url, modulepreload: preload('main.js'),
    badgeHero: badge(t.lang, t.ui, 'site-home'),
    badgeLazy: badge(t.lang, t.ui, 'site-home', true),
    menus: headerMenus(t.ui, t.lang, homeHrefs),
    pages: pageLinks(t.lang),
    jsonld: JSON.stringify(jsonld).replace(/</g, '\\u003c'),
    // Палитры – из Tilefold/Appearance/Theme.swift; названия – на языке страницы.
    palettes: { ...t.palettes, list: PALETTES.map(p => ({ id: p.id, name: t.palettes.names[p.id] ?? fail(`palette name ${p.id}`) })) },
    modes: { ...t.modes, items: t.modes.items.map(m => ({ ...m, tiles: RULES[m.kind] ?? fail(`rule ${m.kind}`) })) },
    everywhere: { ...t.everywhere, facts: t.everywhere.facts.map(f => ({ ...f, icon: icon(f.icon) })) },
    plus: { ...t.plus, rows: t.plus.rows.map(r => ({ label: r.label, free: cell(r.free), plus: cell(r.plus) })) },
  };
}
function fail(msg) { throw new Error(msg); }

// Иллюстрации правил: какие плитки складываются и во что. Уровень цвета – как в игре: первая
// плитка режима – .l1, следующая – .l2 и так далее.
const tile = (v, level) => `<span class="mt l${level}">${v}</span>`;
const ARROW = '<span class="mt-arrow">→</span>';
const RULES = {
  pow2: tile(2, 1) + tile(2, 1) + ARROW + tile(4, 2),
  pow3: tile(3, 1) + tile(3, 1) + tile(3, 1) + ARROW + tile(9, 2),
  fib: tile(3, 3) + tile(5, 4) + ARROW + tile(8, 5),
};

// Служебные страницы: политика, поддержка, пресса. Есть не на всех языках – где своей нет,
// ссылка ведёт на английскую.
const pageFiles = readdirSync(join(SRC, 'pages')).map(f => {
  const raw = read(join(SRC, 'pages', f));
  const m = raw.match(/^<!--meta (\{.*?\}) -->\n/);
  if (!m) throw new Error(`${f}: missing <!--meta {...} --> header`);
  return { file: f, meta: JSON.parse(m[1]), body: raw.slice(m[0].length) };
});
function pageLinks(lang) {
  const find = nav => (pageFiles.find(p => p.meta.nav === nav && p.meta.lang === lang) || pageFiles.find(p => p.meta.nav === nav && p.meta.lang === 'en'))?.meta.path || '/';
  return { support: find('support'), privacy: find('privacy'), press: find('press') };
}

const pages = [];   // [path, file, html, robots]
const homeTpl = read(join(SRC, 'home.html'));
for (const lang of LANGS) {
  const html = render(homeTpl, homeData(i18n(lang)), `home/${lang}`);
  const out = `${LANGUAGES.find(l => l.code === lang).path.slice(1)}index.html`;
  write(join(DIST, out), html);
  pages.push([LANGUAGES.find(l => l.code === lang).path, out, html]);
}

const pageTpl = read(join(SRC, 'page.html'));
for (const { file, meta, body } of pageFiles) {
  const t = i18n(LANGS.includes(meta.lang) ? meta.lang : 'en');
  const twin = code => pageFiles.find(p => p.meta.nav === meta.nav && p.meta.lang === code)?.meta.path;
  const hrefs = Object.fromEntries(BUILT.map(l => [l.code, twin(l.code) || l.path]));
  const current = Object.fromEntries(['home', 'support', 'privacy', 'press'].map(k => [k, k === meta.nav ? ' aria-current="page"' : '']));
  const data = {
    lang: meta.lang, dir: RTL.has(meta.lang) ? 'rtl' : 'ltr',
    title: meta.title,
    metaDescription: meta.description ? `<meta name="description" content="${meta.description}">` : '',
    robots: meta.robots ? `<meta name="robots" content="${meta.robots}">` : '',
    canonical: meta.robots ? '' : `<link rel="canonical" href="${SITE}${meta.path}">`,
    content: body.replace(/{{/g, '&#123;&#123;'),
    badge: badge(meta.lang, t.ui, meta.nav === 'press' ? 'site-press' : 'site-support', true),
    home: LANGUAGES.find(l => l.code === meta.lang)?.path || '/',
    links: pageLinks(meta.lang),
    footer: t.footer,
    ui: t.ui,
    current,
    menus: headerMenus(t.ui, LANGS.includes(meta.lang) ? meta.lang : 'en', hrefs),
    modulepreload: preload('page.js'),
  };
  const html = render(pageTpl, data, `pages/${file}`);
  const out = meta.path.endsWith('/') ? `${meta.path.slice(1)}index.html` : meta.path.slice(1);
  write(join(DIST, out), html);
  pages.push([meta.path, out, html, meta.robots]);
}

// ---------- sitemap ----------
const today = new Date().toISOString().slice(0, 10);
const homePaths = new Set(BUILT.map(l => l.path));
const alt = BUILT.map(l => `<xhtml:link rel="alternate" hreflang="${l.code}" href="${SITE}${l.path}"/>`).join('') + `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>`;
const urls = pages.filter(p => !p[3]).map(([path]) =>
  `  <url><loc>${SITE}${path}</loc><lastmod>${today}</lastmod>${homePaths.has(path) ? alt : ''}</url>`);
urls.push(`  <url><loc>${SITE}/daily</loc><lastmod>${today}</lastmod></url>`);
write(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`);

// ---------- отчёт ----------
const size = p => { const b = readFileSync(join(DIST, p.replace(/^\//, ''))); return [b.length, gzipSync(b, { level: 9 }).length]; };
const kb = n => `${(n / 1024).toFixed(1)} KB`;
const js = [...assets].filter(([k]) => k.startsWith('js/')).map(([, u]) => size(u));
const jsGz = js.reduce((a, [, g]) => a + g, 0), jsRaw = js.reduce((a, [r]) => a + r, 0);
console.log(`${LANGS.length} languages · ${pages.length} pages · ${assets.size} hashed assets`);
console.log(`JS total: ${kb(jsRaw)} raw, ${kb(jsGz)} gzip (budget 40 KB gzip)`);
for (const [path, file] of pages) {
  const html = read(join(DIST, file));
  const refs = [...html.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)].map(m => m[1]);
  const lazy = new Set([...html.matchAll(/<img[^>]+src="(\/assets\/[^"]+)"[^>]*loading="lazy"/g)].map(m => m[1]));
  const first = [...new Set(refs)].filter(u => !lazy.has(u));
  const [, hg] = size(file);
  const tot = first.reduce((a, u) => { const [r, g] = size(u); return [a[0] + r, a[1] + g]; }, [0, hg]);
  console.log(`${path.padEnd(16)} html ${kb(hg).padStart(8)} gz · first load ${kb(tot[1]).padStart(8)} gz (${first.length + 1} files)`);
}
if (jsGz > 40 * 1024) { console.error('JS over budget'); process.exit(1); }
