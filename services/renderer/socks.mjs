import net from 'node:net';
import ipaddr from 'ipaddr.js';

const CONNECT_TIMEOUT_MS = 10000;

function parseUpstreamSocks(value) {
  if (!value) return null;
  const separator = value.lastIndexOf(':');
  const host = value.slice(0, separator);
  const port = Number(value.slice(separator + 1));
  if (separator < 1 || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid RENDERER_UPSTREAM_SOCKS: ${value}`);
  return { host, port };
}

function connectRequest(host, port) {
  const parsed = ipaddr.parse(host);
  const addressType = parsed.kind() === 'ipv4' ? 0x01 : 0x04;
  return Buffer.from([0x05, 0x01, 0x00, addressType, ...parsed.toByteArray(), port >> 8, port & 0xff]);
}

function replyLength(buffer) {
  if (buffer.length < 4) return null;
  if (buffer[3] === 0x01) return 10;
  if (buffer[3] === 0x04) return 22;
  if (buffer[3] === 0x03) return buffer.length < 5 ? null : 7 + buffer[4];
  return 0;
}

function socksConnect({ proxyHost, proxyPort, host, port, timeoutMs = CONNECT_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: proxyHost, port: proxyPort });
    let stage = 'greeting';
    let buffered = Buffer.alloc(0);

    const fail = error => {
      clearTimeout(timer);
      socket.destroy();
      reject(error);
    };

    const onData = chunk => {
      buffered = Buffer.concat([buffered, chunk]);

      if (stage === 'greeting') {
        if (buffered.length < 2) return;
        if (buffered[0] !== 0x05 || buffered[1] !== 0x00) return fail(new Error('SOCKS5 handshake rejected'));
        buffered = buffered.subarray(2);
        stage = 'reply';
        socket.write(connectRequest(host, port));
      }

      if (stage === 'reply') {
        const length = replyLength(buffered);
        if (length === null || buffered.length < (length || 4)) return;
        if (buffered[0] !== 0x05 || buffered[1] !== 0x00 || length === 0) return fail(new Error(`SOCKS5 connect failed (code ${buffered[1]})`));

        stage = 'done';
        clearTimeout(timer);
        socket.off('data', onData);
        socket.off('error', fail);
        socket.pause();
        const remainder = buffered.subarray(length);
        if (remainder.length) socket.unshift(remainder);
        resolve(socket);
      }
    };

    const timer = setTimeout(() => fail(new Error('SOCKS5 connect timed out')), timeoutMs);
    socket.once('connect', () => socket.write(Buffer.from([0x05, 0x01, 0x00])));
    socket.on('data', onData);
    socket.on('error', fail);
    socket.on('close', () => { if (stage !== 'done') fail(new Error('SOCKS5 connection closed')); });
  });
}

export { socksConnect, parseUpstreamSocks };
