import { createServer, request } from 'node:http';
import net from 'node:net';
import { uiProxyListenPorts, uiProxyUpstreamPorts } from './ui-proxy-ports.mjs';

const listenPorts = uiProxyListenPorts();
const { sitePort, apiPort } = uiProxyUpstreamPorts();

function route(url) {
  const path = String(url || '/').split('?')[0];
  if (path === '/health' || path.startsWith('/api')) return { port: apiPort, path: url };
  return { port: sitePort, path: url };
}

function createProxy() {
  const server = createServer((req, res) => {
    const { port, path } = route(req.url);
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
    const { port, path } = route(req.url);
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

  return server;
}

function listen(port, { required }) {
  const server = createProxy();
  return new Promise((resolve, reject) => {
    server.once('error', (error) => {
      if (!required && error.code === 'EADDRINUSE') {
        console.warn(`Lavish Library UI proxy: 127.0.0.1:${port} already in use, skipping`);
        resolve(false);
        return;
      }
      reject(error);
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`Lavish Library UI proxy: http://127.0.0.1:${port} -> site ${sitePort}, api ${apiPort}`);
      resolve(true);
    });
  });
}

const bound = [];
for (const [index, port] of listenPorts.entries()) {
  bound.push(await listen(port, { required: index === 0 }));
}
if (!bound.some(Boolean)) {
  throw new Error('Lavish Library UI proxy did not bind any listen port');
}
