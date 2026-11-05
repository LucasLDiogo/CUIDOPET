// Converte dist-single/index.html em uma página para hospedagem tipo "fragmento" (sem <html>/<head>/<body>).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const src = readFileSync(new URL('../dist-single/index.html', import.meta.url), 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/i)[1];
const body = src.match(/<body>([\s\S]*?)<\/body>/i)[1];
const keep = head
  .replace(/<meta charset[^>]*>/i, '').replace(/<meta name="viewport"[^>]*>/i, '')
  .replace(/<link rel="manifest"[^>]*>/i, '').replace(/<link rel="preconnect"[^>]*>/gi, '');
const titleIdx = keep.indexOf('</title>') + 8;
const out = keep.slice(0, titleIdx) + '\n<meta name="claude:viewport-fit-sides" content="cover">\n' + keep.slice(titleIdx) + '\n' + body.replace(/<noscript>[\s\S]*?<\/noscript>/, '');
mkdirSync(new URL('../dist-artifact/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist-artifact/cuidope.html', import.meta.url), out.trim() + '\n');
console.log('dist-artifact/cuidope.html', (out.length / 1024).toFixed(0), 'KB');
