#!/usr/bin/env node
// Картинки для соцсетей. Раздаёт репозиторий на 127.0.0.1:8790 и принимает PNG, который
// присылает tools/og.html, – в src/static/og/og-<язык>.png. Взято у snowwall.app.
//
//   node tools/og.mjs
//   затем открыть http://localhost:8790/tools/og.html – она нарисует и сохранит все языки
//   (браузер на Mac: заголовки набираются системным шрифтом, арабский и хинди – как надо).

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.json': 'application/json; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/save') {
    const lang = url.searchParams.get('lang');
    if (!/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(lang)) { res.writeHead(400).end('bad lang'); return; }
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const out = join(ROOT, 'src/static/og', `og-${lang}.png`);
      writeFileSync(out, Buffer.concat(chunks));
      console.log('wrote', out);
      res.writeHead(200).end(`saved og-${lang}.png (${Buffer.concat(chunks).length} bytes)`);
    });
    return;
  }
  const file = normalize(join(ROOT, url.pathname));
  // Папку (в том числе корень, который открывает предпросмотр) не отдаём: читать её – падение.
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
}).listen(8790, '127.0.0.1', () => console.log('http://localhost:8790/tools/og.html'));
