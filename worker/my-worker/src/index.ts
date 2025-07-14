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
import { commandHandlers, handleCallbackQuery, handlePhoto, handlePendingAddMessage, handlePendingEditMessage, type TelegramUpdate } from './telegram';
import { authenticator } from 'otplib';
import type { Data } from './crypto';
import { loadData, saveData } from './data';



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
                                                } else if (await handlePendingEditMessage(update, env)) {
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
