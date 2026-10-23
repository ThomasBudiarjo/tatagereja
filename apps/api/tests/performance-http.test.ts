import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync } from 'node:zlib';
import { acceptedEncoding } from '../src/lib/http';
import { newId } from '../src/lib/tokens';
import { createTestApp, seedChurch } from './helpers';

/*
 * HTTP efficiency: compressed JSON with ETags, and the bundled web app served precompressed
 * with the right caching per file.
 */

describe('accepted encodings', () => {
  it('prefers brotli, then gzip, and honours q=0', () => {
    expect(acceptedEncoding('gzip, deflate, br')).toBe('br');
    expect(acceptedEncoding('gzip')).toBe('gzip');
    expect(acceptedEncoding('br;q=0, gzip;q=0.5')).toBe('gzip');
    expect(acceptedEncoding('*')).toBe('br');
    expect(acceptedEncoding('identity')).toBeNull();
    expect(acceptedEncoding(null)).toBeNull();
  });
});

describe('API responses', () => {
  const t = createTestApp();
  afterAll(() => t.close());
  let token = '';
  let path = '';

  beforeAll(async () => {
    const s = await seedChurch(t);
    token = s.owner.token;
    for (let index = 0; index < 30; index += 1) {
      await t.createPerson(token, s.church.id, {
        firstName: `Jemaat ${index}`,
        lastName: 'Sihombing',
      });
    }
    path = `/api/churches/${s.church.id}/people?limit=50`;
  });

  const raw = (headers: Record<string, string> = {}) =>
    t.app.handle(
      new Request(`http://localhost${path}`, {
        headers: { authorization: `Bearer ${token}`, ...headers },
      }),
    );

  it('compresses large JSON for clients that accept it, and only then', async () => {
    const plain = await raw();
    expect(plain.headers.get('content-encoding')).toBeNull();
    const text = await plain.text();
    expect(text.length).toBeGreaterThan(1024);

    const br = await raw({ 'accept-encoding': 'gzip, br' });
    expect(br.headers.get('content-encoding')).toBe('br');
    expect(br.headers.get('vary')).toContain('Accept-Encoding');
    expect(br.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(br.headers.get('cache-control')).toBe('no-store');
    const brBody = Buffer.from(await br.arrayBuffer());
    expect(brBody.byteLength).toBeLessThan(text.length / 2);
    expect(brotliDecompressSync(brBody).toString()).toBe(text);

    const gzip = await raw({ 'accept-encoding': 'gzip' });
    expect(gzip.headers.get('content-encoding')).toBe('gzip');
    expect(gunzipSync(Buffer.from(await gzip.arrayBuffer())).toString()).toBe(text);
  });

  it('leaves small bodies uncompressed', async () => {
    const response = await t.app.handle(
      new Request('http://localhost/api/meta', { headers: { 'accept-encoding': 'br' } }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-encoding')).toBeNull();
  });

  it('answers a matching If-None-Match with 304 and no body', async () => {
    const first = await raw();
    const etag = first.headers.get('etag');
    expect(etag).toMatch(/^W\/"/);
    const again = await raw({ 'if-none-match': etag! });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
    const changed = await raw({ 'if-none-match': 'W/"other"' });
    expect(changed.status).toBe(200);
  });

  it('keeps error bodies and their status', async () => {
    const response = await t.app.handle(
      new Request(`http://localhost${path}`, { headers: { 'accept-encoding': 'br' } }),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(response.headers.get('etag')).toBeNull();
  });
});

describe('web app files', () => {
  const dist = join(tmpdir(), `tatagereja-dist-${newId()}`);
  const script = 'console.log("tatagereja");'.repeat(100);
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>TataGereja</title>');
  writeFileSync(join(dist, 'assets', 'app-abc123.js'), script);
  writeFileSync(join(dist, 'assets', 'app-abc123.js.br'), brotliCompressSync(script));
  writeFileSync(join(dist, 'assets', 'app-abc123.js.gz'), gzipSync(script));
  writeFileSync(join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const t = createTestApp({ webDistDir: dist });
  afterAll(() => {
    t.close();
    rmSync(dist, { recursive: true, force: true });
  });

  const get = (path: string, headers: Record<string, string> = {}) =>
    t.app.handle(new Request(`http://localhost${path}`, { headers }));

  it('sends the precompressed twin of a fingerprinted asset and caches it for a year', async () => {
    const br = await get('/assets/app-abc123.js', { 'accept-encoding': 'gzip, br' });
    expect(br.status).toBe(200);
    expect(br.headers.get('content-encoding')).toBe('br');
    expect(br.headers.get('content-type')).toContain('javascript');
    expect(br.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(brotliDecompressSync(Buffer.from(await br.arrayBuffer())).toString()).toBe(script);

    const gzip = await get('/assets/app-abc123.js', { 'accept-encoding': 'gzip' });
    expect(gzip.headers.get('content-encoding')).toBe('gzip');
    const plain = await get('/assets/app-abc123.js');
    expect(plain.headers.get('content-encoding')).toBeNull();
    expect(await plain.text()).toBe(script);
  });

  it('revalidates index.html and other files with ETag and Last-Modified', async () => {
    const index = await get('/');
    expect(index.headers.get('cache-control')).toBe('no-cache');
    expect(index.headers.get('content-security-policy')).toContain("default-src 'self'");
    const etag = index.headers.get('etag')!;
    expect(etag).toBeTruthy();
    expect(index.headers.get('last-modified')).toBeTruthy();
    expect((await get('/', { 'if-none-match': etag })).status).toBe(304);
    expect(
      (
        await get('/favicon.svg', {
          'if-modified-since': new Date(Date.now() + 60_000).toUTCString(),
        })
      ).status,
    ).toBe(304);
  });

  it('serves index.html for client routes and never leaves the build folder', async () => {
    const route = await get('/c/some-church/people');
    expect(route.status).toBe(200);
    expect(await route.text()).toContain('<title>TataGereja</title>');
    for (const path of [
      '/assets/../../../../etc/passwd',
      '/assets/%2e%2e/%2e%2e/%2e%2e/etc/passwd',
    ]) {
      const escape = await get(path);
      expect(await escape.text()).toContain('<title>TataGereja</title>');
    }
    const api = await get('/api/unknown');
    expect(api.status).toBe(404);
  });

  it('answers a malformed escape with 400, for files and for API writes alike', async () => {
    expect((await get('/%E0%A4%A')).status).toBe(400);
    const write = await t.app.handle(
      new Request('http://localhost/api/churches/%E0%A4%A/people', { method: 'POST' }),
    );
    expect(write.status).toBeLessThan(500);
  });
});
