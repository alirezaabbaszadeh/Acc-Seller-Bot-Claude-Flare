import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src';
import { tr } from '../src/translations';
import { loadData } from '../src/data';

env.AES_KEY = 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=';
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
      'CREATE TABLE IF NOT EXISTS languages (user_id INTEGER PRIMARY KEY, lang TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS pending_add (user_id INTEGER PRIMARY KEY, step TEXT NOT NULL, data TEXT NOT NULL DEFAULT "{}")',
      'CREATE TABLE IF NOT EXISTS pending_edit (user_id INTEGER PRIMARY KEY, product_id TEXT NOT NULL, field TEXT NOT NULL)'
    ];
    for (const stmt of stmts) {
      await env.DB.exec(stmt);
    }
    await env.DB.exec('DELETE FROM products; DELETE FROM pending; DELETE FROM languages; DELETE FROM pending_add; DELETE FROM pending_edit');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockFetch.mockClear();
  });

  it('handles /addproduct message and updates the database', async () => {
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

    const data = await loadData(env);
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

    const data = await loadData(env);
    expect(data.products).toEqual({});
  });
});

