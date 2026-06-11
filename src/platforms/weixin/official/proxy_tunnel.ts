// HTTPS CONNECT proxy tunnel for environments where direct connections
// are not possible (e.g. DNS hijacking by local proxy software).
import net from 'node:net';
import tls from 'node:tls';

export interface ProxyConfig {
  host: string;
  port: number;
}

export function parseHttpsProxyFromEnv(): ProxyConfig | null {
  const raw = process.env.HTTPS_PROXY
    || process.env.https_proxy
    || process.env.HTTP_PROXY
    || process.env.http_proxy
    || '';
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname || '127.0.0.1';
    const port = Number(url.port) || 7890;
    if (!host) return null;
    return { host, port };
  } catch {
    return null;
  }
}

export function createProxyTunnel(
  proxy: ProxyConfig,
  targetHost: string,
  targetPort: number,
  timeoutMs: number,
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: proxy.host, port: proxy.port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Proxy CONNECT timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.on('connect', () => {
      socket.write(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n`);
    });

    let buffer = '';
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      if (buffer.includes('\r\n\r\n')) {
        const lines = buffer.split('\r\n');
        const statusLine = lines[0] || '';
        const match = statusLine.match(/^HTTP\/\d\.\d (\d+)/);
        const statusCode = match ? parseInt(match[1], 10) : 0;

        if (statusCode >= 200 && statusCode < 300) {
          clearTimeout(timer);
          socket.removeAllListeners('data');
          socket.removeAllListeners('error');
          resolve(socket);
        } else {
          clearTimeout(timer);
          socket.destroy();
          reject(new Error(`Proxy CONNECT failed: HTTP ${statusCode}`));
        }
      }
    });

    socket.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export function upgradeToTls(
  socket: net.Socket,
  servername: string,
): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect({ socket, servername, rejectUnauthorized: false });
    tlsSocket.on('secureConnect', () => resolve(tlsSocket));
    tlsSocket.on('error', reject);
  });
}
