/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a
 * type definition for the `Env` object can be regenerated with
 * `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import type { Env } from './env';
import { validateEnv } from './env';
import type { TelegramUpdate } from './telegram-utils';
import { handlePhoto } from './telegram-utils';
import { commandHandlers, handlePendingAddMessage, handlePendingEditMessage } from './telegram-commands';
import { handleCallbackQuery } from './telegram-callbacks';
import { authenticator } from 'otplib';



export default {
        async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
                try {
                        validateEnv(env);
                } catch (err) {
                        return new Response((err as Error).message, { status: 500 });
                }
                const url = new URL(request.url);
                switch (url.pathname) {
                        case '/totp':
                                if (!env.TOTP_KEY) {
                                        return new Response('Not Found', { status: 404 });
                                }
                                const key = url.searchParams.get('key');
                                if (key !== env.TOTP_KEY) {
                                        return new Response('Unauthorized', { status: 401 });
                                }
                                const secret = url.searchParams.get('secret');
                                if (!secret) {
                                        return new Response('Bad Request', { status: 400 });
                                }
                                return new Response(authenticator.generate(secret));
                        case '/telegram':
                                if (request.method !== 'POST') {
                                        return new Response('Method Not Allowed', { status: 405 });
                                }
                                let update: TelegramUpdate;
                                try {
                                        update = await request.json();
                                } catch {
                                        return new Response('Bad Request', { status: 400 });
                                }
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
