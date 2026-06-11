// Proxy bootstrap: patches Node's https.request to route through proxy
import https from 'node:https';
import net from 'node:net';
import { URL } from 'node:url';

const PROXY_HOST = process.env.HTTPS_PROXY_HOST || '127.0.0.1';
const PROXY_PORT = parseInt(process.env.HTTPS_PROXY_PORT || '7890', 10);

const originalRequest = https.request.bind(https);

https.request = function(opts, ...args) {
  const options = typeof opts === 'string' || opts instanceof URL 
    ? (typeof opts === 'string' ? opts : opts.href)
    : { ...opts };
  
  // Only proxy HTTPS requests going to external hosts
  if (typeof options === 'string') {
    return originalRequest(opts, ...args);
  }
  
  const hostname = options.hostname || options.host || 'localhost';
  const port = options.port || 443;
  
  // Don't proxy localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return originalRequest(options, ...args);
  }
  
  // Connect through proxy
  const connectReq = net.connect({ host: PROXY_HOST, port: PROXY_PORT });
  
  return new Promise((resolve, reject) => {
    connectReq.on('connect', () => {
      connectReq.write(`CONNECT ${hostname}:${port} HTTP/1.1\r\nHost: ${hostname}:${port}\r\n\r\n`);
      
      let headerBuffer = '';
      connectReq.on('data', (chunk) => {
        headerBuffer += chunk.toString();
        if (headerBuffer.includes('\r\n\r\n')) {
          const match = headerBuffer.match(/^HTTP\/\d\.\d (\d+)/);
          const statusCode = match ? parseInt(match[1], 10) : 0;
          if (statusCode >= 200 && statusCode < 300) {
            // Tunnel established, upgrade to TLS
            const tlsSocket = require('tls').connect({
              socket: connectReq,
              servername: options.servername || hostname,
            });
            // Replace with original but on the tlsSocket
            const req = originalRequest({ ...options, createConnection: () => tlsSocket });
            resolve(req);
          } else {
            connectReq.destroy();
            reject(new Error(`Proxy CONNECT failed: ${statusCode}`));
          }
        }
      });
    });
    connectReq.on('error', reject);
    setTimeout(() => reject(new Error('Proxy connection timeout')), 15000);
  });
};

https.request[Symbol.for('nodejs.util.inspect.custom')] = originalRequest[Symbol.for('nodejs.util.inspect.custom')];
