import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { socksConnect, parseUpstreamSocks } from '../socks.mjs';
import { createEgressProxy } from '../server.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(() => resolve()));

function createSocksServer({ replyCode = 0x00, chunked = false } = {}) {
  const requests = [];
  const server = net.createServer(socket => {
    let stage = 'greeting';
    let buffered = Buffer.alloc(0);
    socket.on('error', () => {});
    socket.on('data', chunk => {
      buffered = Buffer.concat([buffered, chunk]);
      if (stage === 'greeting' && buffered.length >= 3) {
        assert.deepEqual([...buffered.subarray(0, 3)], [0x05, 0x01, 0x00]);
        buffered = buffered.subarray(3);
        stage = 'request';
        socket.write(Buffer.from([0x05, 0x00]));
      }
      const addressLength = buffered[3] === 0x04 ? 16 : 4;
      if (stage === 'request' && buffered.length >= 4 + addressLength + 2) {
        stage = 'tunnel';
        const address = buffered.subarray(4, 4 + addressLength);
        const port = buffered.readUInt16BE(4 + addressLength);
        requests.push({ type: buffered[3], address: [...address], port });
        const reply = Buffer.from([0x05, replyCode, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
        if (replyCode !== 0x00) { socket.end(reply); return; }
        const echo = net.connect({ host: '127.0.0.1', port: server.echoPort });
        echo.on('error', () => socket.destroy());
        if (chunked) {
          socket.write(reply.subarray(0, 3));
          setTimeout(() => { socket.write(reply.subarray(3)); echo.pipe(socket); socket.pipe(echo); }, 20);
        } else {
          socket.write(reply);
          echo.pipe(socket);
          socket.pipe(echo);
        }
      }
    });
  });
  return { server, requests };
}

async function withSocks(options, run) {
  const echo = net.createServer(socket => socket.pipe(socket));
  const echoPort = await listen(echo);
  const { server, requests } = createSocksServer(options);
  server.echoPort = echoPort;
  const port = await listen(server);
  try { await run({ port, requests }); }
  finally { await close(server); await close(echo); }
}

const roundTrip = (socket, message) => new Promise((resolve, reject) => {
  socket.once('data', chunk => resolve(chunk.toString()));
  socket.once('error', reject);
  socket.write(message);
  socket.resume();
});

test('socksConnect tunnels an IPv4 target through the SOCKS5 server', async () => {
  await withSocks({}, async ({ port, requests }) => {
    const socket = await socksConnect({ proxyHost: '127.0.0.1', proxyPort: port, host: '93.184.216.34', port: 443 });
    try {
      assert.equal(await roundTrip(socket, 'ping'), 'ping');
      assert.deepEqual(requests, [{ type: 0x01, address: [93, 184, 216, 34], port: 443 }]);
    } finally { socket.destroy(); }
  });
});

test('socksConnect sends IPv6 addresses with ATYP 04', async () => {
  await withSocks({}, async ({ port, requests }) => {
    const socket = await socksConnect({ proxyHost: '127.0.0.1', proxyPort: port, host: '2606:4700::1111', port: 8443 });
    socket.destroy();
    assert.equal(requests[0].type, 0x04);
    assert.equal(requests[0].address.length, 16);
    assert.equal(requests[0].port, 8443);
  });
});

test('socksConnect handles replies split across reads', async () => {
  await withSocks({ chunked: true }, async ({ port }) => {
    const socket = await socksConnect({ proxyHost: '127.0.0.1', proxyPort: port, host: '93.184.216.34', port: 80 });
    try { assert.equal(await roundTrip(socket, 'split'), 'split'); }
    finally { socket.destroy(); }
  });
});

test('socksConnect rejects non-zero reply codes', async () => {
  await withSocks({ replyCode: 0x05 }, async ({ port }) => {
    await assert.rejects(socksConnect({ proxyHost: '127.0.0.1', proxyPort: port, host: '93.184.216.34', port: 443 }), /code 5/);
  });
});

test('socksConnect times out when the proxy never answers', async () => {
  const silent = net.createServer(socket => socket.resume());
  const port = await listen(silent);
  try {
    await assert.rejects(socksConnect({ proxyHost: '127.0.0.1', proxyPort: port, host: '93.184.216.34', port: 443, timeoutMs: 50 }), /timed out/);
  } finally { await close(silent); }
});

test('parseUpstreamSocks parses host:port and rejects malformed values', () => {
  assert.equal(parseUpstreamSocks(''), null);
  assert.deepEqual(parseUpstreamSocks('host.docker.internal:40000'), { host: 'host.docker.internal', port: 40000 });
  assert.throws(() => parseUpstreamSocks('nope'));
  assert.throws(() => parseUpstreamSocks('host:99999'));
});

const connectThroughProxy = (proxyPort, authority) => new Promise((resolve, reject) => {
  const socket = net.connect(proxyPort, '127.0.0.1', () => socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`));
  socket.setTimeout(3000, () => reject(new Error('timed out')));
  let response = '';
  socket.on('data', chunk => {
    response += chunk.toString();
    if (!response.includes('\r\n\r\n')) return;
    const [headers, remainder] = response.split('\r\n\r\n');
    if (!headers.includes('200')) { socket.destroy(); return resolve({ status: headers.split('\r\n')[0] }); }
    if (remainder.includes('probe')) { socket.destroy(); return resolve({ status: headers.split('\r\n')[0], echo: remainder }); }
    socket.write('probe');
  });
  socket.on('error', reject);
});

test('CONNECT is routed through the upstream SOCKS proxy to the pinned IP and still 403s private targets', async () => {
  await withSocks({}, async ({ port: socksPort, requests }) => {
    const proxy = createEgressProxy({
      upstreamSocks: { host: '127.0.0.1', port: socksPort },
      resolveHost: async host => host === 'recipe.example' ? [{ address: '93.184.216.34', family: 4 }] : null,
    });
    const proxyPort = await listen(proxy);
    try {
      const tunneled = await connectThroughProxy(proxyPort, 'recipe.example:443');
      assert.equal(tunneled.status, 'HTTP/1.1 200 Connection Established');
      assert.equal(tunneled.echo, 'probe');
      assert.deepEqual(requests, [{ type: 0x01, address: [93, 184, 216, 34], port: 443 }]);

      const blocked = await connectThroughProxy(proxyPort, '169.254.169.254:443');
      assert.equal(blocked.status, 'HTTP/1.1 403 Forbidden');
      assert.equal(requests.length, 1);
    } finally { await close(proxy); }
  });
});

test('plain HTTP is routed through the upstream SOCKS proxy', async () => {
  const origin = http.createServer((_request, response) => response.end('via socks'));
  const originPort = await listen(origin);
  const echoLess = createSocksServer();
  const requests = echoLess.requests;
  echoLess.server.echoPort = originPort;
  const socksPort = await listen(echoLess.server);
  const proxy = createEgressProxy({
    upstreamSocks: { host: '127.0.0.1', port: socksPort },
    resolveHost: async () => [{ address: '93.184.216.34', family: 4 }],
  });
  const proxyPort = await listen(proxy);
  try {
    const body = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port: proxyPort, path: `http://recipe.example:${originPort}/card`, agent: false }, response => {
        let value = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { value += chunk; });
        response.on('end', () => resolve(value));
      }).on('error', reject);
    });
    assert.equal(body, 'via socks');
    assert.deepEqual(requests, [{ type: 0x01, address: [93, 184, 216, 34], port: originPort }]);
  } finally {
    await close(proxy);
    await close(echoLess.server);
    await close(origin);
  }
});
