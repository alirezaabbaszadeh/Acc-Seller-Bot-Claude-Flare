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

interface Env {
    ADMIN_ID: string
    ADMIN_PHONE: string
    FERNET_KEY: string
}

export default {
        async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
                const url = new URL(request.url);
                switch (url.pathname) {
                        case '/message':
                                return new Response(`Hello, ${env.ADMIN_ID}!`);
			case '/random':
				return new Response(crypto.randomUUID());
			default:
				return new Response('Not Found', { status: 404 });
		}
	},
} satisfies ExportedHandler<Env>;
