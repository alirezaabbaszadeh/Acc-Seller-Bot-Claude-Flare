import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src';
import { encryptField } from '../src/crypto';

env.AES_KEY = 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=';
env.ADMIN_ID = '1';
env.BOT_TOKEN = 'TEST';

const SEND_PHOTO_URL = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`;
const SEND_MSG_URL = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;

// Stubs responses for Telegram API
function telegramFetch(url: string): Response {
  if (url.includes('/getFile')) {
    return new Response(JSON.stringify({ ok: true, result: { file_path: 'foo.jpg' } }), {
      headers: { 'content-type': 'application/json' },
    });
  }
  if (url.includes('/file/bot')) {
    return new Response('filedata');
  }
  return new Response('sent');
}

describe('photo upload flow', () => {
  const mockFetch = vi.fn(async (input: any) => telegramFetch(typeof input === 'string' ? input : input.url));

  beforeEach(async () => {
    vi.stubGlobal('fetch', mockFetch);
    const encUser = await encryptField('u', env.AES_KEY);
    const encPass = await encryptField('p', env.AES_KEY);
    const encSecret = await encryptField('s', env.AES_KEY);
    await env.DB.exec(`INSERT INTO products (id, price, username, password, secret, name, buyers) VALUES ('p1','10','${encUser}','${encPass}','${encSecret}',NULL,'[]')`);
    await env.DB.exec("INSERT INTO pending (user_id, product_id) VALUES (2, 'p1')");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockFetch.mockClear();
  });

  it('stores proof image in R2', async () => {
    const putSpy = vi.spyOn(env.PROOFS, 'put');
    const update = { message: { chat: { id: 2 }, photo: [{ file_id: 'f1' }] } };
    const req = new Request('http://example.com/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(update),
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await res.text()).toBe('OK');

    expect(putSpy).toHaveBeenCalledTimes(1);
    expect(putSpy.mock.calls[0][0]).toBe('f1');
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch.mock.calls[2][0]).toBe(SEND_PHOTO_URL);
    expect(mockFetch.mock.calls[3][0]).toBe(SEND_MSG_URL);
  });

  it('handles failed file fetch gracefully', async () => {
    mockFetch.mockImplementation((input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/getFile')) {
        return new Response(JSON.stringify({ ok: true, result: { file_path: 'foo.jpg' } }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/file/bot')) {
        return new Response('error', { status: 500 });
      }
      return new Response('sent');
    });
    const putSpy = vi.spyOn(env.PROOFS, 'put');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const update = { message: { chat: { id: 2 }, photo: [{ file_id: 'f2' }] } };
    const req = new Request('http://example.com/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(update),
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await res.text()).toBe('OK');

    expect(putSpy).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it('retries when sendPhoto fails', async () => {
    let photoCalls = 0;
    mockFetch.mockImplementation((input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/sendPhoto')) {
        photoCalls++;
        if (photoCalls === 1) return new Response('err', { status: 500 });
      }
      return telegramFetch(url);
    });
    const putSpy = vi.spyOn(env.PROOFS, 'put');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const update = { message: { chat: { id: 2 }, photo: [{ file_id: 'f3' }] } };
    const req = new Request('http://example.com/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(update),
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await res.text()).toBe('OK');

    expect(putSpy).toHaveBeenCalledTimes(1);
    expect(photoCalls).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(5);
    errorSpy.mockRestore();
  });

  it('retries when sendMessage fails', async () => {
    let msgCalls = 0;
    mockFetch.mockImplementation((input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/sendMessage')) {
        msgCalls++;
        if (msgCalls === 1) return new Response('err', { status: 500 });
      }
      return telegramFetch(url);
    });
    const putSpy = vi.spyOn(env.PROOFS, 'put');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const update = { message: { chat: { id: 2 }, photo: [{ file_id: 'f4' }] } };
    const req = new Request('http://example.com/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(update),
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await res.text()).toBe('OK');

    expect(putSpy).toHaveBeenCalledTimes(1);
    expect(msgCalls).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(5);
    errorSpy.mockRestore();
  });

  it('handles R2 put failure gracefully', async () => {
    vi.spyOn(env.PROOFS, 'put').mockRejectedValue(new Error('fail'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const update = { message: { chat: { id: 2 }, photo: [{ file_id: 'f5' }] } };
    const req = new Request('http://example.com/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(update),
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await res.text()).toBe('OK');

    // only getFile and file fetches
    expect(mockFetch).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });
});
