import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src';

// Provide a fixed key for crypto operations
env.FERNET_KEY = 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=';

const sampleData = {
  products: {
    p1: { price: '1', username: 'user', password: 'pass', secret: 'sec', buyers: [] },
  },
  pending: [],
  languages: {},
};

describe('data encryption', () => {
  it('encrypts and decrypts product fields', async () => {
    const post = new Request('http://example.com/data', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sampleData),
    });
    const ctx = createExecutionContext();
    await worker.fetch(post, env, ctx);
    await waitOnExecutionContext(ctx);

    const stored = await env.DATA.get('state', 'json');
    const storedProduct = stored.products.p1;
    expect(storedProduct.username).not.toBe('user');
    expect(storedProduct.password).not.toBe('pass');
    expect(storedProduct.secret).not.toBe('sec');

    const getReq = new Request('http://example.com/data');
    const ctx2 = createExecutionContext();
    const resp = await worker.fetch(getReq, env, ctx2);
    await waitOnExecutionContext(ctx2);
    const loaded = await resp.json();
    expect(loaded).toEqual(sampleData);
  });
});
