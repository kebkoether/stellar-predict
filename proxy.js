/**
 * Simple reverse proxy for single-port deployment (Railway).
 * Routes /api/* and /health to the backend, everything else to Next.js.
 */
const http = require('http');

const PORT = parseInt(process.env.PORT || '8080');
const API_PORT = 3000;
const WEB_PORT = 3002;

const server = http.createServer((req, res) => {
  const isApi = req.url.startsWith('/api') || req.url === '/health';
  const target = isApi ? API_PORT : WEB_PORT;

  const options = {
    hostname: '127.0.0.1',
    port: target,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on('error', (err) => {
    console.error(`Proxy error (${isApi ? 'api' : 'web'}):`, err.message);
    res.writeHead(502);
    res.end('Bad Gateway');
  });

  req.pipe(proxy, { end: true });
});

// Handle WebSocket upgrades
server.on('upgrade', (req, socket, head) => {
  const options = {
    hostname: '127.0.0.1',
    port: API_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  const proxy = http.request(options);
  proxy.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
      Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
      '\r\n\r\n'
    );
    proxySocket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  proxy.on('error', (err) => {
    console.error('WebSocket proxy error:', err.message);
    socket.end();
  });

  proxy.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Reverse proxy listening on port ${PORT}`);
  console.log(`  /api/* → localhost:${API_PORT}`);
  console.log(`  /*     → localhost:${WEB_PORT}`);
});
