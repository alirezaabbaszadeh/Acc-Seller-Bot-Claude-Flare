import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src';
import { tr } from '../src/translations';

env.AES_KEY = 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=';
env.ADMIN_ID = '1';
env.BOT_TOKEN = 'TEST';

const TELEGRAM_URL = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;

describe('interactive addproduct flow', () => {
  const mockFetch = vi.fn(async () => new Response('sent'));

  beforeEach(async () => {
    vi.stubGlobal('fetch', mockFetch);
    const stmts = [
      'CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, price TEXT NOT NULL, username TEXT NOT NULL, password TEXT NOT NULL, secret TEXT NOT NULL, name TEXT, buyers TEXT NOT NULL DEFAULT "[]")',
      'CREATE TABLE IF NOT EXISTS pending (user_id INTEGER NOT NULL, product_id TEXT NOT NULL, PRIMARY KEY (user_id, product_id))',
      'CREATE TABLE IF NOT EXISTS languages (user_id INTEGER PRIMARY KEY, lang TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS pending_add (user_id INTEGER PRIMARY KEY, step TEXT NOT NULL, data TEXT NOT NULL DEFAULT "{}")'
    ];
    for (const stmt of stmts) {
      await env.DB.exec(stmt);
    }
    await env.DB.exec('DELETE FROM products; DELETE FROM pending; DELETE FROM languages; DELETE FROM pending_add');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockFetch.mockClear();
  });

  it('stores product after multi-step conversation', async () => {
    // start conversation
    let update: any = { message: { chat: { id: 1 }, text: '/addproduct' } };
    let req = new Request('http://example.com/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(update)
    });
    let ctx = createExecutionContext();
    await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    let body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toBe(tr('ask_product_id', 'en'));
    mockFetch.mockClear();

    // send id
    update = { message: { chat: { id: 1 }, text: 'p1' } };
    req = new Request('http://example.com/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(update)
    });
    ctx = createExecutionContext();
    await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toBe(tr('ask_product_price', 'en'));
    mockFetch.mockClear();

    // price
    update = { message: { chat: { id: 1 }, text: '10' } };
    req = new Request('http://example.com/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(update) });
    ctx = createExecutionContext();
    await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toBe(tr('ask_product_username', 'en'));
    mockFetch.mockClear();

    // username
    update = { message: { chat: { id: 1 }, text: 'user' } };
    req = new Request('http://example.com/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(update) });
    ctx = createExecutionContext();
    await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toBe(tr('ask_product_password', 'en'));
    mockFetch.mockClear();

    // password
    update = { message: { chat: { id: 1 }, text: 'pass' } };
    req = new Request('http://example.com/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(update) });
    ctx = createExecutionContext();
    await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toBe(tr('ask_product_secret', 'en'));
    mockFetch.mockClear();

    // secret
    update = { message: { chat: { id: 1 }, text: 'sec' } };
    req = new Request('http://example.com/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(update) });
    ctx = createExecutionContext();
    await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toBe(tr('ask_product_name', 'en'));
    mockFetch.mockClear();

    // name
    update = { message: { chat: { id: 1 }, text: 'TestProd' } };
    req = new Request('http://example.com/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(update) });
    ctx = createExecutionContext();
    await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toBe(tr('product_added', 'en'));

    const row = await env.DB.prepare('SELECT price FROM products WHERE id=?1').bind('p1').first<any>();
    expect(row?.price).toBe('10');
  });
});
