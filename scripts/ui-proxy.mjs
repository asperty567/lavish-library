import { createServer, request } from 'node:http';
import net from 'node:net';

const listenPort = Number(process.env.LAVISH_TRACKER_UI_PORT || 3000);
const sitePort = Number(process.env.LAVISH_TRACKER_SITE_PORT || listenPort + 1000);
const apiPort = Number(process.env.LAVISH_TRACKER_API_PORT || 4318);

function route(url, headers = {}) {
  const path = String(url || '/').split('?')[0];
  const rsc = headers.rsc || headers.RSC || headers['next-router-state-tree'];
  if ((path === '/' || path === '') && !rsc) {
    return { port: apiPort, path: '/api/landing' };
  }
  if (path === '/health' || path.startsWith('/api')) return { port: apiPort, path: url };
  return { port: sitePort, path: url };
}

const server = createServer((req, res) => {
  const { port, path } = route(req.url, req.headers);
  const headers = { ...req.headers, host: `127.0.0.1:${port}` };
  const up = request({ hostname: '127.0.0.1', port, path, method: req.method, headers }, (incoming) => {
    res.writeHead(incoming.statusCode || 502, incoming.headers);
    incoming.pipe(res);
  });
  up.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bad gateway');
  });
  req.pipe(up);
});

server.on('upgrade', (req, socket, head) => {
  const { port, path } = route(req.url, req.headers);
  const up = net.connect(port, '127.0.0.1', () => {
    const lines = [`${req.method} ${path} HTTP/1.1`];
    const headers = { ...req.headers, host: `127.0.0.1:${port}` };
    for (const [key, value] of Object.entries(headers)) {
      if (value === undefined) continue;
      lines.push(`${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
    }
    up.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});

server.listen(listenPort, '127.0.0.1', () => {
  console.log(`Lavish Library UI proxy: http://127.0.0.1:${listenPort} -> site ${sitePort}, api ${apiPort}`);
});
