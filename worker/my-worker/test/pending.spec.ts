import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src';
import { tr } from '../src/translations';
import { encryptField } from '../src/crypto';

env.AES_KEY = 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=';
env.ADMIN_ID = '1';
env.BOT_TOKEN = 'TEST';

const TELEGRAM_URL = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;

describe('pending command', () => {
  const mockFetch = vi.fn(async () => new Response('sent'));

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockFetch.mockClear();
  });

  it('lists pending purchases from the database', async () => {
    const encUser = await encryptField('u', env.AES_KEY);
    const encPass = await encryptField('p', env.AES_KEY);
    const encSecret = await encryptField('s', env.AES_KEY);
    await env.DB.exec(`INSERT INTO products (id, price, username, password, secret, name, buyers) VALUES ('p1','10','${encUser}','${encPass}','${encSecret}',NULL,'[]')`);
    await env.DB.exec("INSERT INTO pending (user_id, product_id) VALUES (2, 'p1')");

    const update = { message: { chat: { id: 1 }, text: '/pending' } };
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
    const expected = tr('pending_entry', 'en').replace('{user_id}', '2').replace('{product_id}', 'p1');
    expect(body.text).toBe(expected);
    expect(mockFetch.mock.calls[0][0]).toBe(TELEGRAM_URL);
  });
});
