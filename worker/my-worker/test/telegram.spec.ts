import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src';
import { tr } from '../src/translations';

env.FERNET_KEY = 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=';
env.ADMIN_ID = '1';
env.BOT_TOKEN = 'TEST';

const TELEGRAM_URL = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;

describe('POST /telegram', () => {
  const mockFetch = vi.fn(async () => new Response('sent'));

  beforeEach(async () => {
    vi.stubGlobal('fetch', mockFetch);
    const stmts = [
      'CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, price TEXT NOT NULL, username TEXT NOT NULL, password TEXT NOT NULL, secret TEXT NOT NULL, name TEXT, buyers TEXT NOT NULL DEFAULT "[]")',
      'CREATE TABLE IF NOT EXISTS pending (user_id INTEGER NOT NULL, product_id TEXT NOT NULL, PRIMARY KEY (user_id, product_id))',
      'CREATE TABLE IF NOT EXISTS languages (user_id INTEGER PRIMARY KEY, lang TEXT NOT NULL)'
    ];
    for (const stmt of stmts) {
      await env.DB.exec(stmt);
    }
    await env.DB.exec('DELETE FROM products; DELETE FROM pending; DELETE FROM languages');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockFetch.mockClear();
  });

  it('handles /addproduct message and updates KV', async () => {
    const update = {
      message: {
        chat: { id: 1 },
        text: '/addproduct p1 10 user pass sec TestProd',
      },
    };

    const req = new Request('http://example.com/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(update),
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await res.text()).toBe('OK');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(mockFetch.mock.calls[0][0]).toBe(TELEGRAM_URL);
    expect(body.text).toBe('Product added');

    const dataReq = new Request('http://example.com/data');
    const ctx2 = createExecutionContext();
    const resp2 = await worker.fetch(dataReq, env, ctx2);
    await waitOnExecutionContext(ctx2);
    const data = await resp2.json();
    expect(data.products.p1.price).toBe('10');
    expect(data.products.p1.username).toBe('user');
  });

  it('handles callback queries', async () => {
    const update = {
      callback_query: {
        id: 'cb1',
        data: 'menu:main',
        from: { id: 1 },
        message: { chat: { id: 1 } },
      },
    };

    const req = new Request('http://example.com/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(update),
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(await res.text()).toBe('OK');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toBe(tr('welcome', 'en'));

    const dataReq = new Request('http://example.com/data');
    const ctx2 = createExecutionContext();
    const resp2 = await worker.fetch(dataReq, env, ctx2);
    await waitOnExecutionContext(ctx2);
    const data = await resp2.json();
    expect(data.products).toEqual({});
  });
});

