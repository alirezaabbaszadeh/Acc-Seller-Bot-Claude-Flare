import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { loadData, saveData } from '../src/data';

// Provide a fixed key for crypto operations
env.AES_KEY = 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=';

const sampleData = {
  products: {
    p1: { price: '1', username: 'user', password: 'pass', secret: 'sec', buyers: [] },
  },
  pending: [],
  pending_add: [],
  pending_edit: [],
  languages: {},
};

describe('data encryption', () => {
  beforeEach(async () => {
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

  it('encrypts and decrypts product fields', async () => {
    await saveData(env, sampleData);

    const row = await env.DB.prepare('SELECT username, password, secret FROM products WHERE id=?1').bind('p1').first<any>();
    if (!row) throw new Error('row not found');
    expect(row.username).not.toBe('user');
    expect(row.password).not.toBe('pass');
    expect(row.secret).not.toBe('sec');

    const loaded = await loadData(env);
    expect(loaded).toEqual(sampleData);
  });
});
