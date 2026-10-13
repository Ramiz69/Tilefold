#!/usr/bin/env node
// Checks every i18n/<lang>.json against i18n/en.json, the source of truth.
//
//   node tools/check-i18n.mjs          all languages
//   node tools/check-i18n.mjs de ja    only these
//
// A translation must have exactly en.json's keys, list lengths and value types; keep each
// string's HTML tags, href targets and {placeholders}; and set lang and path for its own code.
// Exits non-zero on any problem, so a translator can run it until it is quiet.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const I18N = join(ROOT, 'i18n');
const load = code => JSON.parse(readFileSync(join(I18N, `${code}.json`), 'utf8'));
const en = load('en');

// Values that are data, not copy: they must match en.json exactly.
const SAME = new Set(['jsonld.proOffer.price', 'jsonld.proOffer.priceCurrency', 'jsonld.proOffer.name']);
// Per-language values, checked separately.
// badgeLang names the App Store badge in src/assets; the build falls back to English without one.
const OWN = new Set(['lang', 'path', 'badgeLang']);
// May be null: a price in dollars means little on a page in another currency.
const NULLABLE = new Set(['jsonld.proOffer']);

const tags = s => (s.match(/<\/?[a-z][^>]*>/gi) || []).map(t => t.replace(/\s+(?!href=)[a-z-]+="[^"]*"/gi, '')).sort().join(' ');
const holes = s => (s.match(/\{[a-z]+\}|\{\{[^}]+\}\}/g) || []).sort().join(' ');

function compare(a, b, path, problems) {
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return problems.push(`${path}: should be a list`);
    if (a.length !== b.length) problems.push(`${path}: ${b.length} items, en has ${a.length}`);
    a.forEach((v, i) => i < b.length && compare(v, b[i], `${path}[${i}]`, problems));
  } else if (a && typeof a === 'object') {
    if (b === null && NULLABLE.has(path)) return;
    if (!b || typeof b !== 'object' || Array.isArray(b)) return problems.push(`${path}: should be an object`);
    for (const k of Object.keys(a)) {
      if (!(k in b)) problems.push(`${path ? path + '.' : ''}${k}: missing`);
      else compare(a[k], b[k], path ? `${path}.${k}` : k, problems);
    }
    for (const k of Object.keys(b)) if (!(k in a)) problems.push(`${path ? path + '.' : ''}${k}: not in en.json`);
  } else if (typeof a !== typeof b) {
    problems.push(`${path}: is ${typeof b}, en has ${typeof a}`);
  } else if (typeof a === 'string') {
    if (OWN.has(path)) return;
    if (SAME.has(path)) { if (a !== b) problems.push(`${path}: must stay "${a}"`); return; }
    if (tags(a) !== tags(b)) problems.push(`${path}: HTML differs from en (${tags(a) || 'none'} vs ${tags(b) || 'none'})`);
    if (holes(a) !== holes(b)) problems.push(`${path}: placeholders differ from en (${holes(a) || 'none'} vs ${holes(b) || 'none'})`);
    if (a.trim() && !b.trim()) problems.push(`${path}: empty`);
  } else if (a !== b && typeof a !== 'boolean') {
    problems.push(`${path}: must stay ${JSON.stringify(a)}`);
  } else if (typeof a === 'boolean' && a !== b) {
    problems.push(`${path}: must stay ${a}`);
  }
}

const wanted = process.argv.slice(2);
const codes = (wanted.length ? wanted : readdirSync(I18N).map(f => f.replace(/\.json$/, ''))).filter(c => c !== 'en');
let bad = 0;
for (const code of codes) {
  let t;
  try { t = load(code); } catch (e) { console.log(`${code}: ${e.message}`); bad++; continue; }
  const problems = [];
  compare(en, t, '', problems);
  if (t.lang !== code) problems.push(`lang: should be "${code}"`);
  const path = `/${code.toLowerCase()}/`;
  if (t.path !== path) problems.push(`path: should be "${path}"`);
  const untranslated = [];
  (function walk(a, b, p) {
    if (typeof a === 'string' && a === b && /[a-z]{4,}\s+[a-z]{3,}/i.test(a) && !SAME.has(p) && !OWN.has(p)) untranslated.push(p);
    else if (a && typeof a === 'object') for (const k of Object.keys(a)) if (b && k in b) walk(a[k], b[k], p ? `${p}.${k}` : k);
  })(en, t, '');
  if (untranslated.length) problems.push(`still English: ${untranslated.slice(0, 8).join(', ')}${untranslated.length > 8 ? ` and ${untranslated.length - 8} more` : ''}`);
  console.log(problems.length ? `${code}: ${problems.length} problem(s)\n  ${problems.join('\n  ')}` : `${code}: ok`);
  if (problems.length) bad++;
}
process.exit(bad ? 1 : 0);
