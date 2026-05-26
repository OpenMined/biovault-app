import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { dataHowToPageHtml, landingPageHtml } from './prepare-cloudflare-web-assets.mjs';

const shareAssetsDir = resolve(process.cwd(), 'assets/share');
const guideAssetsDir = resolve(process.cwd(), 'assets/guides');
const IMAGE_CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
};

const listenHost = process.env.DEV_WEB_HOST ?? '0.0.0.0';
const publicHost = process.env.DEV_WEB_DOMAIN ?? 'dev-app.biovault.net';
const tlsCertPath = process.env.DEV_WEB_TLS_CERT;
const tlsKeyPath = process.env.DEV_WEB_TLS_KEY;
const useHttps = Boolean(tlsCertPath && tlsKeyPath);
const protocol = useHttps ? 'https' : 'http';
const port = Number(process.env.DEV_WEB_PORT ?? (useHttps ? '443' : '80'));
const expoPort = Number(process.env.EXPO_WEB_PORT ?? '8081');
const expoHost = process.env.EXPO_WEB_HOST ?? 'localhost';
const publicOrigin = `${protocol}://${publicHost}${(protocol === 'https' && port === 443) || (protocol === 'http' && port === 80) ? '' : `:${port}`}`;
const DEV_NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
  'Surrogate-Control': 'no-store',
};
const EXPECTED_SOCKET_ERROR_CODES = new Set(['EPIPE', 'ECONNRESET', 'ERR_STREAM_WRITE_AFTER_END']);

const isExpectedSocketError = (error) =>
  EXPECTED_SOCKET_ERROR_CODES.has(error?.code) ||
  /socket has been ended|write after end/i.test(error?.message ?? '');

const logUnexpectedSocketError = (label, error) => {
  if (!isExpectedSocketError(error)) {
    console.warn(`[dev-web] ${label}: ${error?.message ?? String(error)}`);
  }
};

const destroyQuietly = (stream) => {
  if (!stream.destroyed) {
    stream.destroy();
  }
};

const handleRequest = (request, response) => {
  const url = new URL(request.url ?? '/', `${protocol}://${publicHost}:${port}`);

  if (url.pathname === '/') {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      ...DEV_NO_STORE_HEADERS,
    });
    response.end(landingPageHtml({
      metricsScriptCacheBust: Date.now(),
      metricsSiteId: process.env.BIOVAULT_METRICS_SITE_ID ?? '4',
      origin: publicOrigin,
    }));
    return;
  }

  if (url.pathname === '/data-how-to') {
    response.writeHead(308, { Location: '/data-how-to/' });
    response.end();
    return;
  }

  if (url.pathname === '/data-how-to/') {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      ...DEV_NO_STORE_HEADERS,
    });
    response.end(dataHowToPageHtml({
      metricsScriptCacheBust: Date.now(),
      metricsSiteId: process.env.BIOVAULT_METRICS_SITE_ID ?? '4',
      origin: publicOrigin,
    }));
    return;
  }

  if (url.pathname.startsWith('/images/')) {
    const name = url.pathname.slice('/images/'.length);
    const filePath = join(shareAssetsDir, name);
    if (!name || name.includes('/') || name.includes('..') || !existsSync(filePath)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found\n');
      return;
    }
    response.writeHead(200, {
      'Content-Type': IMAGE_CONTENT_TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream',
      ...DEV_NO_STORE_HEADERS,
    });
    response.end(readFileSync(filePath));
    return;
  }

  if (url.pathname.startsWith('/guides/')) {
    const name = decodeURIComponent(url.pathname.slice('/guides/'.length));
    const filePath = join(guideAssetsDir, name);
    if (!name || name.includes('..') || name.includes('\0') || !existsSync(filePath)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found\n');
      return;
    }
    response.writeHead(200, {
      'Content-Type': IMAGE_CONTENT_TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream',
      ...DEV_NO_STORE_HEADERS,
    });
    response.end(readFileSync(filePath));
    return;
  }

  if (url.pathname === '/web') {
    response.writeHead(308, { Location: '/web/' });
    response.end();
    return;
  }

  proxyHttp(request, response);
};

const server = useHttps
  ? https.createServer(
      {
        cert: readFileSync(tlsCertPath),
        key: readFileSync(tlsKeyPath),
      },
      handleRequest,
    )
  : http.createServer(handleRequest);

server.on('upgrade', (request, socket, head) => {
  const upstream = net.connect(expoPort, expoHost, () => {
    try {
      if (socket.destroyed || upstream.destroyed) return;
      upstream.write(`${request.method} ${request.url ?? '/'} HTTP/${request.httpVersion}\r\n`);
      const headers = {
        ...request.headers,
        host: `${expoHost}:${expoPort}`,
        origin: `http://${expoHost}:${expoPort}`,
      };
      for (const [name, value] of Object.entries(headers)) {
        if (Array.isArray(value)) {
          for (const item of value) upstream.write(`${name}: ${item}\r\n`);
        } else if (value !== undefined) {
          upstream.write(`${name}: ${value}\r\n`);
        }
      }
      upstream.write('\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    } catch (error) {
      logUnexpectedSocketError('upgrade proxy write failed', error);
      destroyQuietly(upstream);
      destroyQuietly(socket);
    }
  });

  socket.on('error', (error) => {
    logUnexpectedSocketError('client socket error', error);
    destroyQuietly(upstream);
  });
  upstream.on('error', (error) => {
    logUnexpectedSocketError('upstream socket error', error);
    destroyQuietly(socket);
  });
  socket.on('close', () => destroyQuietly(upstream));
  upstream.on('close', () => destroyQuietly(socket));
});

server.listen(port, listenHost, () => {
  console.log(`[dev-web] root landing page: ${publicOrigin}/`);
  console.log(`[dev-web] Expo web app:      ${publicOrigin}/web/`);
  console.log(`[dev-web] proxying to Expo:  http://${expoHost}:${expoPort}/`);
});

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`[dev-web] Cannot listen on ${listenHost}:${port}; the port is already in use.`);
  } else if (error?.code === 'EACCES') {
    console.error(`[dev-web] Cannot listen on ${listenHost}:${port}; permission was denied.`);
  } else {
    console.error(`[dev-web] Failed to start: ${error?.message ?? String(error)}`);
  }
  process.exit(1);
});

function proxyHttp(clientRequest, clientResponse) {
  const headers = {
    ...clientRequest.headers,
    'cache-control': 'no-cache',
    host: `${expoHost}:${expoPort}`,
    origin: `http://${expoHost}:${expoPort}`,
    pragma: 'no-cache',
    referer: `http://${expoHost}:${expoPort}/`,
    'accept-encoding': 'identity',
  };
  const upstream = http.request(
    {
      hostname: expoHost,
      port: expoPort,
      method: clientRequest.method,
      path: clientRequest.url,
      headers,
    },
    (upstreamResponse) => {
      const responseHeaders = {
        ...upstreamResponse.headers,
        ...DEV_NO_STORE_HEADERS,
      };
      delete responseHeaders.etag;
      if (!shouldRewriteResponse(upstreamResponse)) {
        clientResponse.writeHead(
          upstreamResponse.statusCode ?? 502,
          upstreamResponse.statusMessage,
          responseHeaders,
        );
        upstreamResponse.pipe(clientResponse);
        return;
      }

      const chunks = [];
      upstreamResponse.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      upstreamResponse.on('end', () => {
        const rewritten = rewriteDevServerUrls(Buffer.concat(chunks).toString('utf8'));
        delete responseHeaders['content-length'];
        delete responseHeaders['Content-Length'];
        delete responseHeaders['content-encoding'];
        delete responseHeaders['Content-Encoding'];
        clientResponse.writeHead(
          upstreamResponse.statusCode ?? 502,
          upstreamResponse.statusMessage,
          responseHeaders,
        );
        clientResponse.end(rewritten);
      });
      upstreamResponse.on('error', (error) => {
        logUnexpectedSocketError('upstream response error', error);
        destroyQuietly(clientResponse);
      });
    },
  );

  upstream.on('error', (error) => {
    logUnexpectedSocketError('upstream request error', error);
    if (!clientResponse.headersSent) {
      clientResponse.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    clientResponse.end(`Expo dev server is not reachable on ${expoHost}:${expoPort}\n${error.message}\n`);
  });
  clientRequest.on('error', (error) => {
    logUnexpectedSocketError('client request error', error);
    destroyQuietly(upstream);
  });
  clientResponse.on('error', (error) => {
    logUnexpectedSocketError('client response error', error);
    destroyQuietly(upstream);
  });

  clientRequest.pipe(upstream);
}

function shouldRewriteResponse(upstreamResponse) {
  const contentType = String(upstreamResponse.headers['content-type'] ?? '').toLowerCase();
  if (!contentType || contentType.includes('text/event-stream')) return false;
  return (
    contentType.includes('javascript') ||
    contentType.includes('json') ||
    contentType.includes('text/') ||
    contentType.includes('application/x-metro')
  );
}

function rewriteDevServerUrls(text) {
  const hosts = new Set([
    `http://${expoHost}:${expoPort}`,
    `http://localhost:${expoPort}`,
    `http://127.0.0.1:${expoPort}`,
  ]);
  let rewritten = text;
  for (const host of hosts) {
    rewritten = rewritten.split(host).join(publicOrigin);
  }
  return rewritten;
}
