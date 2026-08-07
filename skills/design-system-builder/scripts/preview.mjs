#!/usr/bin/env node
/**
 * preview.mjs — serve the generated design system on localhost + open it.
 *
 * Why: opening index.html via file:// works for the page itself, but its
 * iframes fail to load because Chrome/Safari block file:// iframes from
 * loading other file:// URLs even under the same parent. A tiny HTTP server
 * fixes it and makes fonts + assets load correctly too.
 *
 * Usage:
 *   node scripts/preview.mjs [folder] [--port 8765]
 *
 * Zero dependencies. Node >= 18.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const folder = resolve(args.find((a) => !a.startsWith('--')) || './design-system');
const portArg = args.indexOf('--port');
const port = portArg >= 0 ? parseInt(args[portArg + 1], 10) : 8765;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = join(folder, urlPath);
    // Prevent path traversal.
    if (!filePath.startsWith(folder)) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    const s = await stat(filePath);
    if (s.isDirectory()) { res.writeHead(302, { Location: urlPath + '/index.html' }); res.end(); return; }
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`404 — ${req.url}\n${e.message}`);
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Try --port ${port + 1}.`);
    process.exit(1);
  }
  throw e;
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${port}/index.html`;
  console.log(`\n📐 Serving ${folder}`);
  console.log(`   ${url}\n   (Ctrl-C to stop)\n`);

  const openCmd = process.platform === 'darwin' ? 'open'
                : process.platform === 'win32'  ? 'cmd'
                : 'xdg-open';
  const openArgs = process.platform === 'win32' ? ['/c', 'start', url] : [url];
  spawn(openCmd, openArgs, { stdio: 'ignore', detached: true }).unref();
});
