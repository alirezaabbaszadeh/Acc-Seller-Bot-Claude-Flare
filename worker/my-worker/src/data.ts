import type { Env } from './env';
import { type Data, encryptField, decryptField } from './crypto';

/**
 * Load all bot data from the database.
 */
export async function loadData(env: Env): Promise<Data> {
	const data: Data = { products: {}, pending: [], pending_add: [], pending_edit: [], languages: {} };

	const prodRes = await env.DB.prepare('SELECT * FROM products').all();
	for (const row of prodRes.results as any[]) {
		const buyers = row.buyers ? JSON.parse(row.buyers) : [];
		data.products[row.id] = {
			price: row.price,
                        username: await decryptField(row.username, env.AES_KEY),
                        password: await decryptField(row.password, env.AES_KEY),
                        secret: await decryptField(row.secret, env.AES_KEY),
			buyers,
		};
		if (row.name) data.products[row.id].name = row.name;
	}

	const pendRes = await env.DB.prepare('SELECT user_id, product_id FROM pending').all();
	data.pending = (pendRes.results as any[]).map((r) => ({
		user_id: r.user_id,
		product_id: r.product_id,
	}));

	const addRes = await env.DB.prepare('SELECT user_id, step, data FROM pending_add').all();
	data.pending_add = (addRes.results as any[]).map((r) => ({
		user_id: r.user_id,
		step: r.step,
		data: r.data ? JSON.parse(r.data) : {},
	}));

	const editRes = await env.DB.prepare('SELECT user_id, product_id, field FROM pending_edit').all();
	data.pending_edit = (editRes.results as any[]).map((r) => ({
		user_id: r.user_id,
		product_id: r.product_id,
		field: r.field,
	}));

	const langRes = await env.DB.prepare('SELECT user_id, lang FROM languages').all();
	for (const row of langRes.results as any[]) {
		data.languages[String(row.user_id)] = row.lang;
	}

	return data;
}

/**
 * Persist the bot data back to the database.
 */
export async function saveData(env: Env, data: Data): Promise<void> {
	const statements: D1PreparedStatement[] = [];

	const currentProd = await env.DB.prepare('SELECT id FROM products').all();
	const prodIds = new Set((currentProd.results as any[]).map((r) => r.id as string));

	for (const [id, product] of Object.entries(data.products)) {
		prodIds.delete(id);
                const encUser = await encryptField(product.username, env.AES_KEY);
                const encPass = await encryptField(product.password, env.AES_KEY);
                const encSecret = await encryptField(product.secret, env.AES_KEY);
		const buyers = JSON.stringify(product.buyers || []);
		statements.push(
			env.DB.prepare(
				'INSERT INTO products (id, price, username, password, secret, name, buyers) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ' +
					'ON CONFLICT(id) DO UPDATE SET price=excluded.price, username=excluded.username, password=excluded.password, secret=excluded.secret, name=excluded.name, buyers=excluded.buyers',
			).bind(id, product.price, encUser, encPass, encSecret, product.name ?? null, buyers),
		);
	}

	for (const id of prodIds) {
		statements.push(env.DB.prepare('DELETE FROM products WHERE id=?1').bind(id));
	}

	const currentPending = await env.DB.prepare('SELECT user_id, product_id FROM pending').all();
	const pendingKeys = new Set((currentPending.results as any[]).map((r) => `${r.user_id}|${r.product_id}`));

	for (const pending of data.pending) {
		pendingKeys.delete(`${pending.user_id}|${pending.product_id}`);
		statements.push(
			env.DB.prepare('INSERT OR REPLACE INTO pending (user_id, product_id) VALUES (?1, ?2)').bind(pending.user_id, pending.product_id),
		);
	}

	for (const key of pendingKeys) {
		const [uid, pid] = key.split('|');
		statements.push(env.DB.prepare('DELETE FROM pending WHERE user_id=?1 AND product_id=?2').bind(Number(uid), pid));
	}

	const currentAdd = await env.DB.prepare('SELECT user_id FROM pending_add').all();
	const addIds = new Set((currentAdd.results as any[]).map((r) => r.user_id as number));

	for (const add of data.pending_add) {
		addIds.delete(add.user_id);
		statements.push(
			env.DB.prepare(
				'INSERT INTO pending_add (user_id, step, data) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET step=excluded.step, data=excluded.data',
			).bind(add.user_id, add.step, JSON.stringify(add.data)),
		);
	}

	for (const uid of addIds) {
		statements.push(env.DB.prepare('DELETE FROM pending_add WHERE user_id=?1').bind(uid));
	}

	const currentEdit = await env.DB.prepare('SELECT user_id FROM pending_edit').all();
	const editIds = new Set((currentEdit.results as any[]).map((r) => r.user_id as number));

	for (const edit of data.pending_edit) {
		editIds.delete(edit.user_id);
		statements.push(
			env.DB.prepare(
				'INSERT INTO pending_edit (user_id, product_id, field) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET product_id=excluded.product_id, field=excluded.field',
			).bind(edit.user_id, edit.product_id, edit.field),
		);
	}

	for (const uid of editIds) {
		statements.push(env.DB.prepare('DELETE FROM pending_edit WHERE user_id=?1').bind(uid));
	}

	const currentLang = await env.DB.prepare('SELECT user_id FROM languages').all();
	const langIds = new Set((currentLang.results as any[]).map((r) => r.user_id as number));

	for (const [uid, lang] of Object.entries(data.languages)) {
		const idNum = Number(uid);
		langIds.delete(idNum);
		statements.push(
			env.DB.prepare('INSERT INTO languages (user_id, lang) VALUES (?1, ?2) ON CONFLICT(user_id) DO UPDATE SET lang=excluded.lang').bind(
				idNum,
				lang,
			),
		);
	}

	for (const uid of langIds) {
		statements.push(env.DB.prepare('DELETE FROM languages WHERE user_id=?1').bind(uid));
	}

	await env.DB.batch(statements);
}
