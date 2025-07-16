import { env } from 'cloudflare:test';
import { beforeEach } from 'vitest';

// Provide defaults required by the worker
env.BOT_TOKEN ??= 'TEST';
env.ADMIN_ID ??= '1';
env.ADMIN_PHONE ??= '+10000000000';
env.AES_KEY ??= 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=';

// Ensure D1 is cleared between tests
beforeEach(async () => {
  const stmts = [
    'CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, price TEXT NOT NULL, username TEXT NOT NULL, password TEXT NOT NULL, secret TEXT NOT NULL, name TEXT, buyers TEXT NOT NULL DEFAULT "[]")',
    'CREATE TABLE IF NOT EXISTS pending (user_id INTEGER NOT NULL, product_id TEXT NOT NULL, PRIMARY KEY (user_id, product_id))',
    'CREATE TABLE IF NOT EXISTS languages (user_id INTEGER PRIMARY KEY, lang TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS pending_add (user_id INTEGER PRIMARY KEY, step TEXT NOT NULL, data TEXT NOT NULL DEFAULT "{}")',
    'CREATE TABLE IF NOT EXISTS pending_edit (user_id INTEGER PRIMARY KEY, product_id TEXT NOT NULL, field TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS proofs (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, product_id TEXT NOT NULL, data TEXT NOT NULL)'
  ];
  for (const stmt of stmts) {
    await env.DB.exec(stmt);
  }
  await env.DB.exec('DELETE FROM products; DELETE FROM pending; DELETE FROM languages; DELETE FROM pending_add; DELETE FROM pending_edit; DELETE FROM proofs');
});
