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
import { commandHandlers, handleCallbackQuery, type TelegramUpdate } from './telegram';
import { authenticator } from 'otplib';

interface Data {
    products: Record<string, Record<string, unknown>>;
    pending: unknown[];
    languages: Record<string, string>;
}

function b64ToBytes(b64: string): Uint8Array {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToB64(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes));
}

async function encryptField(value: string, keyB64: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw',
        b64ToBytes(keyB64),
        'AES-GCM',
        false,
        ['encrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(value)
    );
    const out = new Uint8Array(iv.length + cipher.byteLength);
    out.set(iv, 0);
    out.set(new Uint8Array(cipher), iv.length);
    return bytesToB64(out);
}

async function decryptField(value: string, keyB64: string): Promise<string> {
    const data = b64ToBytes(value);
    const iv = data.slice(0, 12);
    const cipher = data.slice(12);
    const key = await crypto.subtle.importKey(
        'raw',
        b64ToBytes(keyB64),
        'AES-GCM',
        false,
        ['decrypt']
    );
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new TextDecoder().decode(plain);
}

async function encryptData(data: Data, key: string): Promise<Data> {
    const result: Data = structuredClone(data);
    for (const product of Object.values(result.products || {})) {
        for (const field of ['username', 'password', 'secret'] as const) {
            const value = product[field];
            if (typeof value === 'string') {
                product[field] = await encryptField(value, key);
            }
        }
    }
    return result;
}

async function decryptData(data: Data, key: string): Promise<Data> {
    const result: Data = structuredClone(data);
    for (const product of Object.values(result.products || {})) {
        for (const field of ['username', 'password', 'secret'] as const) {
            const value = product[field];
            if (typeof value === 'string') {
                try {
                    product[field] = await decryptField(value, key);
                } catch {
                    product[field] = '';
                }
            }
        }
    }
    return result;
}

async function loadData(env: Env): Promise<Data> {
    const stored = await env.DATA.get('state', 'json');
    if (stored) {
        return decryptData(stored as Data, env.FERNET_KEY);
    }
    return { products: {}, pending: [], languages: {} };
}

async function saveData(env: Env, data: Data): Promise<void> {
    const encrypted = await encryptData(data, env.FERNET_KEY);
    await env.DATA.put('state', JSON.stringify(encrypted));
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
                        case '/message':
                                return new Response('Hello, World!');
                        case '/random':
                                return new Response(crypto.randomUUID());
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
                                        }
                                } else if (update.callback_query) {
                                        await handleCallbackQuery(update, env);
                                }
                                return new Response('OK');
                        default:
                                return new Response('Not Found', { status: 404 });
                }
        },
} satisfies ExportedHandler<Env>;
