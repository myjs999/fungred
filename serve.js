// 本地静态服务器（开发用）：node serve.js [port]
//   POST /shot  body=dataURL  → 存到 _shots/<name>.jpg（无头视觉验证用）
const http = require('http'), fs = require('fs'), path = require('path');
const root = __dirname, port = parseInt(process.argv[2] || '8765');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (req.method === 'POST' && p === '/shot') {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      try {
        const { name, data } = JSON.parse(body);
        const b64 = data.split(',')[1];
        fs.mkdirSync(path.join(root, '_shots'), { recursive: true });
        fs.writeFileSync(path.join(root, '_shots', (name || 'shot').replace(/[^\w-]/g, '') + '.jpg'), Buffer.from(b64, 'base64'));
        res.writeHead(200); res.end('ok');
      } catch (e) { res.writeHead(400); res.end(String(e)); }
    });
    return;
  }
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log('fungred dev server on http://localhost:' + port));
