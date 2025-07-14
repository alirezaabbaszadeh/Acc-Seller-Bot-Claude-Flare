/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import type { Env } from './env';
import { commandHandlers, handleCallbackQuery, handlePhoto, handlePendingAddMessage, type TelegramUpdate } from './telegram';
import { authenticator } from 'otplib';
import { type Data, encryptField, decryptField } from './crypto';


async function loadData(env: Env): Promise<Data> {
    const data: Data = { products: {}, pending: [], pending_add: [], languages: {} };

    const prodRes = await env.DB.prepare('SELECT * FROM products').all();
    for (const row of prodRes.results as any[]) {
        const buyers = row.buyers ? JSON.parse(row.buyers) : [];
        data.products[row.id] = {
            price: row.price,
            username: await decryptField(row.username, env.AES_KEY || env.FERNET_KEY),
            password: await decryptField(row.password, env.AES_KEY || env.FERNET_KEY),
            secret: await decryptField(row.secret, env.AES_KEY || env.FERNET_KEY),
            buyers,
        };
        if (row.name) data.products[row.id].name = row.name;
    }

    const pendRes = await env.DB.prepare(
        'SELECT user_id, product_id FROM pending'
    ).all();
    data.pending = (pendRes.results as any[]).map((r) => ({
        user_id: r.user_id,
        product_id: r.product_id,
    }));

    const addRes = await env.DB.prepare(
        'SELECT user_id, step, data FROM pending_add'
    ).all();
    data.pending_add = (addRes.results as any[]).map((r) => ({
        user_id: r.user_id,
        step: r.step,
        data: r.data ? JSON.parse(r.data) : {}
    }));

    const langRes = await env.DB.prepare(
        'SELECT user_id, lang FROM languages'
    ).all();
    for (const row of langRes.results as any[]) {
        data.languages[String(row.user_id)] = row.lang;
    }

    return data;
}

async function saveData(env: Env, data: Data): Promise<void> {
    const statements = [
        env.DB.prepare('DELETE FROM products'),
        env.DB.prepare('DELETE FROM pending'),
        env.DB.prepare('DELETE FROM languages'),
        env.DB.prepare('DELETE FROM pending_add'),
    ];

    for (const [id, product] of Object.entries(data.products)) {
        const key = env.AES_KEY || env.FERNET_KEY;
        const encUser = await encryptField(product.username, key);
        const encPass = await encryptField(product.password, key);
        const encSecret = await encryptField(product.secret, key);
        const buyers = JSON.stringify(product.buyers || []);
        statements.push(
            env.DB.prepare(
                'INSERT INTO products (id, price, username, password, secret, name, buyers) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)'
            ).bind(id, product.price, encUser, encPass, encSecret, product.name ?? null, buyers)
        );
    }

    for (const pending of data.pending) {
        statements.push(
            env.DB.prepare(
                'INSERT INTO pending (user_id, product_id) VALUES (?1, ?2)'
            ).bind(pending.user_id, pending.product_id)
        );
    }

    for (const add of data.pending_add) {
        statements.push(
            env.DB.prepare(
                'INSERT INTO pending_add (user_id, step, data) VALUES (?1, ?2, ?3)'
            ).bind(add.user_id, add.step, JSON.stringify(add.data))
        );
    }

    for (const [uid, lang] of Object.entries(data.languages)) {
        statements.push(
            env.DB.prepare(
                'INSERT INTO languages (user_id, lang) VALUES (?1, ?2)'
            ).bind(Number(uid), lang)
        );
    }

    await env.DB.batch(statements);
}

export default {
        async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
                const url = new URL(request.url);
                switch (url.pathname) {
                        case '/data':
                                if (request.method === 'GET') {
                                        const data = await loadData(env);
                                        return new Response(JSON.stringify(data), {
                                                headers: { 'content-type': 'application/json' },
                                        });
                                } else if (request.method === 'POST') {
                                        const payload: Data = await request.json();
                                        await saveData(env, payload);
                                        return new Response('OK');
                                }
                                return new Response('Method Not Allowed', { status: 405 });
                        case '/totp':
                                const secret = url.searchParams.get('secret');
                                if (!secret) {
                                        return new Response('Bad Request', { status: 400 });
                                }
                                return new Response(authenticator.generate(secret));
                        case '/telegram':
                                if (request.method !== 'POST') {
                                        return new Response('Method Not Allowed', { status: 405 });
                                }
                                const update: TelegramUpdate = await request.json();
                                const text = update.message?.text;
                                if (text) {
                                        const command = text.split(/\s+/)[0] as keyof typeof commandHandlers;
                                        const handler = commandHandlers[command];
                                        if (handler) {
                                                await handler(update, env);
                                        } else {
                                                if (await handlePendingAddMessage(update, env)) {
                                                        // handled
                                                }
                                        }
                                } else if (update.message?.photo) {
                                        await handlePhoto(update, env);
                                } else if (update.callback_query) {
                                        await handleCallbackQuery(update, env);
                                }
                                return new Response('OK');
                        default:
                                return new Response('Not Found', { status: 404 });
                }
        },
} satisfies ExportedHandler<Env>;
