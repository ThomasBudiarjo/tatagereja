import { gzipSync } from 'bun';
import { stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { brotliCompressSync, constants as zlib } from 'node:zlib';

/*
 * HTTP efficiency for the API and the bundled web app: compressed JSON, precompressed static
 * files, long-lived caching of fingerprinted assets and conditional requests (ETag).
 */

/** Smaller bodies are sent as they are: compressing them saves less than it costs. */
export const COMPRESS_MIN_BYTES = 1024;

type Encoding = 'br' | 'gzip';

/** The best encoding the client accepts (`br` before `gzip`), honouring `q=0`. */
export function acceptedEncoding(header: string | null): Encoding | null {
  if (!header) return null;
  const accepted = new Map<string, number>();
  for (const part of header.toLowerCase().split(',')) {
    const [name = '', ...params] = part.trim().split(';');
    const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
    accepted.set(name.trim(), q ? Number(q.slice(2)) || 0 : 1);
  }
  const allows = (name: Encoding) => (accepted.get(name) ?? accepted.get('*') ?? 0) > 0;
  if (allows('br')) return 'br';
  if (allows('gzip')) return 'gzip';
  return null;
}

/**
 * Compresses a dynamic body. Brotli at quality 4 is faster than gzip -6 and still smaller;
 * the build's static files use the slowest, smallest settings instead (precompressed).
 */
export function compressBody(body: Uint8Array, encoding: Encoding): Uint8Array {
  if (encoding === 'br') {
    return brotliCompressSync(body, {
      params: {
        [zlib.BROTLI_PARAM_QUALITY]: 4,
        [zlib.BROTLI_PARAM_SIZE_HINT]: body.byteLength,
      },
    });
  }
  return gzipSync(body as Uint8Array<ArrayBuffer>, { level: 6 });
}

/** A weak validator of a body: equal bodies give equal tags. */
export const etagOf = (body: Uint8Array | string): string => `W/"${Bun.hash(body).toString(36)}"`;

/** Whether the request's `If-None-Match` names the current tag (or `*`). */
export function matchesEtag(request: Request, etag: string): boolean {
  const header = request.headers.get('if-none-match');
  if (!header) return false;
  const weak = (tag: string) => tag.trim().replace(/^W\//, '');
  return header.split(',').some((tag) => tag.trim() === '*' || weak(tag) === weak(etag));
}

const encoder = new TextEncoder();

/**
 * The final API response for a handler's value: JSON or text, a weak ETag on successful GETs
 * (answered with 304 when the client already has it), and compression when the client accepts
 * it and the body is worth it. Other values (files, streams, responses) are left to Elysia.
 */
export function finalizeResponse(
  request: Request,
  value: unknown,
  set: { status?: number | string; headers: Record<string, string | number | undefined> },
): Response | undefined {
  if (
    value === undefined ||
    value === null ||
    value instanceof Response ||
    value instanceof Blob ||
    value instanceof ArrayBuffer ||
    value instanceof ReadableStream ||
    ArrayBuffer.isView(value) ||
    (typeof value !== 'object' && typeof value !== 'string')
  ) {
    return undefined;
  }
  const headers = new Headers();
  for (const [name, header] of Object.entries(set.headers)) {
    if (header !== undefined) headers.set(name, String(header));
  }
  let text: string;
  if (typeof value === 'string') {
    text = value;
    if (!headers.has('content-type')) headers.set('content-type', 'text/plain; charset=utf-8');
  } else {
    text = JSON.stringify(value);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json; charset=utf-8');
    }
  }
  const status = typeof set.status === 'number' ? set.status : 200;
  let body: Uint8Array = encoder.encode(text);

  if (request.method === 'GET' && status === 200) {
    const etag = etagOf(body);
    headers.set('etag', etag);
    if (matchesEtag(request, etag)) {
      headers.delete('content-type');
      return new Response(null, { status: 304, headers });
    }
  }

  headers.append('vary', 'Accept-Encoding');
  const encoding =
    body.byteLength >= COMPRESS_MIN_BYTES
      ? acceptedEncoding(request.headers.get('accept-encoding'))
      : null;
  if (encoding) {
    body = compressBody(body, encoding);
    headers.set('content-encoding', encoding);
  }
  return new Response(body as Uint8Array<ArrayBuffer>, { status, headers });
}

/** Extensions of files the build precompresses (scripts/precompress in the web build). */
const PRECOMPRESSED = /\.(?:js|mjs|css|html|svg|json|webmanifest|txt|xml|map|wasm)$/;

/**
 * Serves the built web app from `dist`:
 *  - fingerprinted files under `assets/` are cached for a year (`immutable`);
 *  - everything else, and `index.html` for client-side routes, revalidates on every load
 *    (`no-cache`) with an ETag and Last-Modified, answering 304 when unchanged;
 *  - a `.br` or `.gz` twin written by the build is sent when the client accepts it.
 * Paths are resolved inside `dist` only; anything else falls back to `index.html`.
 */
export function createStaticHandler(distDir: string) {
  const dist = resolve(distDir);
  const indexFile = join(dist, 'index.html');

  const fileFor = async (pathname: string) => {
    const relative = pathname.replace(/^\/+/, '');
    if (relative) {
      const target = resolve(dist, relative);
      if (target.startsWith(dist + sep)) {
        const info = await stat(target).catch(() => null);
        if (info?.isFile()) return { path: target, relative, info };
      }
    }
    const info = await stat(indexFile).catch(() => null);
    return info ? { path: indexFile, relative: 'index.html', info } : null;
  };

  return async (request: Request, pathname: string): Promise<Response> => {
    const file = await fileFor(pathname);
    if (!file) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    const type = Bun.file(file.path).type;
    headers.set('content-type', type);
    const immutable = file.relative.startsWith('assets/');
    headers.set('cache-control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
    const etag = `W/"${file.info.size.toString(36)}-${Math.floor(file.info.mtimeMs).toString(36)}"`;
    headers.set('etag', etag);
    headers.set('last-modified', file.info.mtime.toUTCString());

    const since = request.headers.get('if-modified-since');
    const notModified = request.headers.has('if-none-match')
      ? matchesEtag(request, etag)
      : !!since && Math.floor(file.info.mtimeMs / 1000) <= Math.floor(Date.parse(since) / 1000);
    if (notModified) {
      headers.delete('content-type');
      return new Response(null, { status: 304, headers });
    }

    let path = file.path;
    if (PRECOMPRESSED.test(file.relative)) {
      headers.set('vary', 'Accept-Encoding');
      const encoding = acceptedEncoding(request.headers.get('accept-encoding'));
      if (encoding) {
        const twin = `${file.path}.${encoding === 'br' ? 'br' : 'gz'}`;
        const twinInfo = await stat(twin).catch(() => null);
        if (twinInfo?.isFile()) {
          path = twin;
          headers.set('content-encoding', encoding);
        }
      }
    }
    return new Response(Bun.file(path), { headers });
  };
}
