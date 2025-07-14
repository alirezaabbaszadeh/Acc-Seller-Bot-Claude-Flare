import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src';
import { encryptField } from '../src/crypto';
import { tr } from '../src/translations';

env.AES_KEY = 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=';
env.ADMIN_ID = '1';
env.BOT_TOKEN = 'TEST';

const TELEGRAM_URL = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;

describe('interactive edit buttons flow', () => {
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
    const encUser = await encryptField('u', env.AES_KEY);
    const encPass = await encryptField('p', env.AES_KEY);
    const encSecret = await encryptField('s', env.AES_KEY);
    await env.DB.exec(`INSERT INTO products (id, price, username, password, secret, name, buyers) VALUES ('p1','1','${encUser}','${encPass}','${encSecret}',NULL,'[]')`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockFetch.mockClear();
  });

  it('selects product and field then updates value', async () => {
    // open edit product menu
    let update: any = { callback_query: { id: '1', data: 'adminmenu:editproduct', from: { id: 1 }, message: { chat: { id: 1 } } } };
    let req = new Request('http://example.com/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(update) });
    let ctx = createExecutionContext();
    await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    let body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toBe(tr('select_product_edit', 'en'));
    expect(body.reply_markup.inline_keyboard[0][0].callback_data).toBe('editprod:p1');
    mockFetch.mockClear();

    // choose product
    update = { callback_query: { id: '2', data: 'editprod:p1', from: { id: 1 }, message: { chat: { id: 1 } } } };
    req = new Request('http://example.com/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(update) });
    ctx = createExecutionContext();
    await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toBe(tr('select_field_edit', 'en'));
    expect(body.reply_markup.inline_keyboard[0][0].callback_data).toBe('editfield:p1:price');
    mockFetch.mockClear();

    // choose field
    update = { callback_query: { id: '3', data: 'editfield:p1:price', from: { id: 1 }, message: { chat: { id: 1 } } } };
    req = new Request('http://example.com/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(update) });
    ctx = createExecutionContext();
    await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toBe(tr('enter_new_value', 'en'));
    mockFetch.mockClear();

    // send new value
    update = { message: { chat: { id: 1 }, text: '2' } };
    req = new Request('http://example.com/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(update) });
    ctx = createExecutionContext();
    await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toBe(tr('product_updated', 'en'));

    const row = await env.DB.prepare('SELECT price FROM products WHERE id=?1').bind('p1').first<any>();
    expect(row?.price).toBe('2');
  });
});

