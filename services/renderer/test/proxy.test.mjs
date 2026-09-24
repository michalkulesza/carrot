import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { createEgressProxy } from '../server.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(() => resolve()));

async function proxyPort(proxy) { return listen(proxy); }

test('HTTP and CONNECT proxy reject private destinations', async () => {
  const proxy = createEgressProxy();
  const port = await proxyPort(proxy);
  try {
    const response = await new Promise((resolve, reject) => {
      const request = http.request({ hostname: '127.0.0.1', port, path: 'http://127.0.0.1:8080/admin' }, result => {
        result.resume();
        result.on('end', () => resolve(result.statusCode));
      });
      request.on('error', reject);
      request.end();
    });
    assert.equal(response, 403);

    const statusLine = await new Promise((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1', () => socket.write('CONNECT 169.254.169.254:443 HTTP/1.1\r\nHost: 169.254.169.254:443\r\n\r\n'));
      let data = '';
      socket.on('data', chunk => { data += chunk.toString(); socket.end(); });
      socket.on('end', () => resolve(data.split('\r\n')[0]));
      socket.on('error', reject);
    });
    assert.equal(statusLine, 'HTTP/1.1 403 Forbidden');
  } finally { await close(proxy); }
});

test('HTTP proxy connects to the validated public IP literal', async () => {
  const upstream = http.createServer((_request, response) => response.end('served by pinned target'));
  const upstreamPort = await listen(upstream);
  let connectedHost;
  const proxy = createEgressProxy({
    resolveHost: async () => [{ address: '93.184.216.34', family: 4 }],
    requestHttp(options, callback) {
      connectedHost = options.hostname;
      return http.request({ ...options, hostname: '127.0.0.1', family: 4, port: upstreamPort }, callback);
    },
  });
  const port = await proxyPort(proxy);
  try {
    const body = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path: `http://recipe.example:${upstreamPort}/card` }, response => {
        let value = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { value += chunk; });
        response.on('end', () => resolve(value));
      }).on('error', reject);
    });
    assert.equal(connectedHost, '93.184.216.34');
    assert.equal(body, 'served by pinned target');
  } finally {
    await close(proxy);
    await close(upstream);
  }
});

test('CONNECT proxy tunnels through the validated public IP literal', async () => {
  const upstream = net.createServer(socket => socket.pipe(socket));
  const upstreamPort = await listen(upstream);
  let connectedHost;
  const proxy = createEgressProxy({
    resolveHost: async () => [{ address: '93.184.216.34', family: 4 }],
    connectTcp(options) {
      connectedHost = options.host;
      return net.connect({ ...options, host: '127.0.0.1', family: 4, port: upstreamPort });
    },
  });
  const port = await proxyPort(proxy);
  try {
    const echo = await new Promise((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1', () => socket.write('CONNECT recipe.example:443 HTTP/1.1\r\nHost: recipe.example:443\r\n\r\n'));
      socket.setTimeout(3000, () => reject(new Error('CONNECT tunnel timed out')));
      let response = '';
      socket.on('data', chunk => {
        response += chunk.toString();
        if (response.includes('\r\n\r\n')) {
          const [headers, remainder] = response.split('\r\n\r\n');
          if (!headers.includes('200 Connection Established')) return reject(new Error(headers));
          if (remainder.includes('probe')) { socket.end(); return resolve(remainder); }
          socket.write('probe');
        }
      });
      socket.on('error', reject);
    });
    assert.equal(connectedHost, '93.184.216.34');
    assert.equal(echo, 'probe');
  } finally {
    await close(proxy);
    await close(upstream);
  }
});
