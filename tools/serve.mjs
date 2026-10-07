import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.m4a':'audio/mp4', '.mp3':'audio/mpeg', '.css':'text/css', '.png':'image/png',
  '.jpg':'image/jpeg', '.json':'application/json' };

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
    const path = resolve(join(ROOT, rel));
    if (path !== ROOT && !path.startsWith(ROOT + sep)) { res.writeHead(403); res.end('Forbidden'); return; }
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path).toLowerCase()] || 'application/octet-stream' });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('Not found: ' + e.message); }
}).listen(5173, () => console.log('http://localhost:5173  (root: ' + ROOT + ')'));
