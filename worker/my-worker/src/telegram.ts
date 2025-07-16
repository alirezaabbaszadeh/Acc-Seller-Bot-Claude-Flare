import type { Env } from './env';
import { tr, type Lang } from './translations';
import type { Data } from './crypto';
import { authenticator } from 'otplib';
import { loadData, saveData, getLanguage, setLanguage, listProducts, getProduct, upsertProduct, updateProductField, deleteProduct, addBuyer, removeBuyer, clearBuyers, listPending, addPending, removePending, getPendingForUser } from './data';

async function userLang(env: Env, userId: number): Promise<Lang> {
  return (await getLanguage(env, userId)) as Lang ?? 'en';
}

const SUPPORTED_LANGS = new Set<Lang>(['en', 'fa']);

function isAdmin(env: Env, userId: number): boolean {
  return String(userId) === env.ADMIN_ID;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface TelegramMessage {
  chat: { id: number };
  text?: string;
  photo?: { file_id: string }[];
}

export interface TelegramCallbackQuery {
  id: string;
  data: string;
  message?: { chat: { id: number } };
  from: { id: number };
}

export interface TelegramUpdate {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export type CommandHandler = (update: TelegramUpdate, env: Env) => Promise<void>;
export type CallbackHandler = (update: TelegramUpdate, env: Env) => Promise<void>;

export async function sendMessage(env: Env, chatId: number, text: string, replyMarkup?: unknown): Promise<Response> {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }),
  });
}

export async function sendPhoto(env: Env, chatId: number, fileId: string, caption: string): Promise<Response> {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`;
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, photo: fileId, caption }),
  });
}

// --- Inline keyboard builders ---

export function productKeyboard(pid: string, lang: Lang): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[{ text: tr('buy_button', lang), callback_data: `buy:${pid}` }]],
  };
}

export function codeKeyboard(pid: string, lang: Lang): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[{ text: tr('code_button', lang), callback_data: `code:${pid}` }]],
  };
}

export function buildBackMenu(lang: Lang): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[{ text: tr('menu_back', lang), callback_data: 'menu:main' }]],
  };
}

export function buildMainMenu(lang: Lang, isAdmin = false): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = [
    [{ text: tr('menu_products', lang), callback_data: 'menu:products' }],
    [{ text: tr('menu_contact', lang), callback_data: 'menu:contact' }],
    [{ text: tr('menu_help', lang), callback_data: 'menu:help' }],
    [{ text: tr('menu_language', lang), callback_data: 'menu:language' }],
  ];
  if (isAdmin) {
    rows.push([{ text: tr('menu_admin', lang), callback_data: 'menu:admin' }]);
  }
  return { inline_keyboard: rows };
}

export function buildAdminMenu(lang: Lang): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = [
    [{ text: tr('menu_pending', lang), callback_data: 'adminmenu:pending' }],
    [{ text: tr('menu_manage_products', lang), callback_data: 'adminmenu:manage' }],
    [{ text: tr('menu_stats', lang), callback_data: 'adminmenu:stats' }],
    [{ text: tr('menu_back', lang), callback_data: 'menu:main' }],
  ];
  return { inline_keyboard: rows };
}

export function buildProductsMenu(lang: Lang): InlineKeyboardMarkup {
  const rows: InlineKeyboardButton[][] = [
    [{ text: tr('menu_addproduct', lang), callback_data: 'adminmenu:addproduct' }],
    [{ text: tr('menu_editproduct', lang), callback_data: 'adminmenu:editproduct' }],
    [{ text: tr('menu_deleteproduct', lang), callback_data: 'adminmenu:deleteproduct' }],
    [{ text: tr('menu_stats', lang), callback_data: 'adminmenu:stats' }],
    [{ text: tr('menu_buyers', lang), callback_data: 'adminmenu:buyers' }],
    [{ text: tr('menu_clearbuyers', lang), callback_data: 'adminmenu:clearbuyers' }],
    [{ text: tr('menu_resend', lang), callback_data: 'adminmenu:resend' }],
    [{ text: tr('menu_back', lang), callback_data: 'menu:admin' }],
  ];
  return { inline_keyboard: rows };
}

export async function handleStart(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  await sendMessage(env, chatId, tr('welcome', lang));
}

export async function handleProducts(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  const products = Object.entries(await listProducts(env));
  if (!products.length) {
    await sendMessage(env, chatId, tr('no_products', lang));
    return;
  }
  for (const [pid, info] of products) {
    let text = `${pid}: ${info.price}`;
    if (info.name) text += `\n${info.name}`;
    await sendMessage(env, chatId, text, productKeyboard(pid, lang));
  }
}

export async function handleContact(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  const text = tr('admin_phone', lang).replace('{phone}', env.ADMIN_PHONE);
  await sendMessage(env, chatId, text);
}

export async function handleHelp(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  const userCmds = [
    tr('help_user_start', lang),
    tr('help_user_products', lang),
    tr('help_user_code', lang),
    tr('help_user_contact', lang),
    tr('help_user_setlang', lang),
    tr('help_user_help', lang),
  ];
  const adminCmds = [
    tr('help_admin_approve', lang),
    tr('help_admin_reject', lang),
    tr('help_admin_pending', lang),
    tr('help_admin_addproduct', lang),
    tr('help_admin_editproduct', lang),
    tr('help_admin_buyers', lang),
    tr('help_admin_deletebuyer', lang),
    tr('help_admin_clearbuyers', lang),
    tr('help_admin_resend', lang),
    tr('help_admin_stats', lang),
  ];
  const text =
    tr('help_user_header', lang) +
    '\n' +
    userCmds.join('\n') +
    '\n\n' +
    tr('help_admin_header', lang) +
    '\n' +
    adminCmds.join('\n');
  await sendMessage(env, chatId, text);
}

async function startAddFlow(env: Env, chatId: number, lang: Lang) {
  await env.DB.prepare(
    'INSERT OR REPLACE INTO pending_add (user_id, step, data) VALUES (?1, ?2, ?3)'
  ).bind(chatId, 'id', '{}').run();
  await sendMessage(env, chatId, tr('ask_product_id', lang));
}

async function continueAddFlow(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const row = await env.DB.prepare('SELECT step, data FROM pending_add WHERE user_id=?1').bind(chatId).first<any>();
  if (!row) return;
  const lang = await userLang(env, chatId);
  const text = update.message?.text || '';
  const data = row.data ? JSON.parse(row.data) : {};
  let nextStep = '';
  switch (row.step) {
    case 'id':
      data.pid = text;
      nextStep = 'price';
      await sendMessage(env, chatId, tr('ask_product_price', lang));
      break;
    case 'price':
      data.price = text;
      nextStep = 'username';
      await sendMessage(env, chatId, tr('ask_product_username', lang));
      break;
    case 'username':
      data.username = text;
      nextStep = 'password';
      await sendMessage(env, chatId, tr('ask_product_password', lang));
      break;
    case 'password':
      data.password = text;
      nextStep = 'secret';
      await sendMessage(env, chatId, tr('ask_product_secret', lang));
      break;
    case 'secret':
      data.secret = text;
      nextStep = 'name';
      await sendMessage(env, chatId, tr('ask_product_name', lang));
      break;
    case 'name':
      data.name = text;
      const all = await loadData(env);
      if (data.pid in all.products) {
        await sendMessage(env, chatId, tr('product_exists', lang));
      } else {
        all.products[data.pid] = {
          price: data.price,
          username: data.username,
          password: data.password,
          secret: data.secret,
          buyers: []
        };
        if (data.name && data.name !== '-') {
          all.products[data.pid].name = data.name;
        }
        await saveData(env, all);
        await sendMessage(env, chatId, tr('product_added', lang));
      }
      await env.DB.prepare('DELETE FROM pending_add WHERE user_id=?1').bind(chatId).run();
      return;
  }
  await env.DB.prepare('UPDATE pending_add SET step=?2, data=?3 WHERE user_id=?1')
    .bind(chatId, nextStep, JSON.stringify(data)).run();
}

async function startEditFlow(env: Env, chatId: number, pid: string, field: string, lang: Lang) {
  await env.DB.prepare(
    'INSERT OR REPLACE INTO pending_edit (user_id, product_id, field) VALUES (?1, ?2, ?3)'
  ).bind(chatId, pid, field).run();
  await sendMessage(env, chatId, tr('enter_new_value', lang));
}

async function continueEditFlow(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const row = await env.DB.prepare('SELECT product_id, field FROM pending_edit WHERE user_id=?1').bind(chatId).first<any>();
  if (!row) return;
  const lang = await userLang(env, chatId);
  const value = update.message?.text || '';
  const data = await loadData(env);
  const product = data.products[row.product_id];
  if (!product) {
    await sendMessage(env, chatId, tr('product_not_found', lang));
  } else if (!['price','username','password','secret','name'].includes(row.field)) {
    await sendMessage(env, chatId, tr('invalid_field', lang));
  } else {
    product[row.field] = value;
    await saveData(env, data);
    await sendMessage(env, chatId, tr('product_updated', lang));
  }
  await env.DB.prepare('DELETE FROM pending_edit WHERE user_id=?1').bind(chatId).run();
}

export async function handleAddProduct(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  if (!isAdmin(env, chatId)) {
    await sendMessage(env, chatId, tr('unauthorized', lang));
    return;
  }
  const text = update.message?.text || '';
  const args = text.split(/\s+/).slice(1);
  if (args.length === 0) {
    await startAddFlow(env, chatId, lang);
    return;
  }
  if (args.length < 5) {
    await sendMessage(env, chatId, tr('addproduct_usage', lang));
    return;
  }
  const [pid, price, username, password, secret, ...nameParts] = args;
  const name = nameParts.join(' ');
  const exists = await getProduct(env, pid);
  if (exists) {
    await sendMessage(env, chatId, tr('product_exists', lang));
    return;
  }
  await upsertProduct(env, pid, { price, username, password, secret, name: name || undefined, buyers: [] });
  await sendMessage(env, chatId, tr('product_added', lang));
}

export async function handlePending(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  if (!isAdmin(env, chatId)) {
    await sendMessage(env, chatId, tr('unauthorized', lang));
    return;
  }
  const pending = await listPending(env);
  if (!pending.length) {
    await sendMessage(env, chatId, tr('no_pending', lang));
    return;
  }
  const lines = pending.map((p) =>
    tr('pending_entry', lang)
      .replace('{user_id}', String(p.user_id))
      .replace('{product_id}', p.product_id),
  );
  await sendMessage(env, chatId, lines.join('\n'));
}

export async function handleStats(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  if (!isAdmin(env, chatId)) {
    await sendMessage(env, chatId, tr('unauthorized', lang));
    return;
  }
  const args = (update.message?.text || '').split(/\s+/).slice(1);
  const pid = args[0];
  if (!pid) {
    await sendMessage(env, chatId, tr('stats_usage', lang));
    return;
  }
  const product = await getProduct(env, pid);
  if (!product) {
    await sendMessage(env, chatId, tr('product_not_found', lang));
    return;
  }
  const buyers = product.buyers || [];
  const text = [
    tr('price_line', lang).replace('{price}', String(product.price)),
    tr('total_buyers_line', lang).replace('{count}', String(buyers.length)),
  ].join('\n');
  await sendMessage(env, chatId, text);
}

export async function handleBuyers(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  if (!isAdmin(env, chatId)) {
    await sendMessage(env, chatId, tr('unauthorized', lang));
    return;
  }
  const args = (update.message?.text || '').split(/\s+/).slice(1);
  const pid = args[0];
  if (!pid) {
    await sendMessage(env, chatId, tr('buyers_usage', lang));
    return;
  }
  const product = await getProduct(env, pid);
  if (!product) {
    await sendMessage(env, chatId, tr('product_not_found', lang));
    return;
  }
  const buyers = product.buyers || [];
  if (buyers.length) {
    await sendMessage(
      env,
      chatId,
      tr('buyers_list', lang).replace('{list}', buyers.join(', ')),
    );
  } else {
    await sendMessage(env, chatId, tr('no_buyers', lang));
  }
}

export async function handleSetLang(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const dataText = update.message?.text || '';
  const args = dataText.split(/\s+/).slice(1);
  const currentLang = await userLang(env, chatId);
  const code = args[0]?.toLowerCase();
  if (!code) {
    await sendMessage(env, chatId, tr('setlang_usage', currentLang));
    return;
  }
  if (!SUPPORTED_LANGS.has(code as Lang)) {
    await sendMessage(env, chatId, tr('unsupported_language', currentLang));
    return;
  }
  await setLanguage(env, chatId, code as Lang);
  await sendMessage(env, chatId, tr('language_set', code as Lang));
}

export async function handleApprove(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  if (!isAdmin(env, chatId)) {
    await sendMessage(env, chatId, tr('unauthorized', lang));
    return;
  }
  const args = (update.message?.text || '').split(/\s+/).slice(1);
  const userId = Number(args[0]);
  const pid = args[1];
  if (!userId || !pid) {
    await sendMessage(env, chatId, tr('approve_usage', lang));
    return;
  }
  const pending = await getPendingForUser(env, userId);
  if (!pending || pending.product_id !== pid) {
    await sendMessage(env, chatId, tr('pending_not_found', lang));
    return;
  }
  const product = await getProduct(env, pid);
  if (!product) {
    await sendMessage(env, chatId, tr('product_not_found', lang));
    return;
  }
  await removePending(env, userId, pid);
  await addBuyer(env, pid, userId);
  const msg = tr('credentials_msg', lang)
    .replace('{username}', product.username)
    .replace('{password}', product.password);
  await sendMessage(env, userId, msg);
  await sendMessage(env, userId, tr('use_code_button', lang), codeKeyboard(pid, lang));
  await sendMessage(env, chatId, tr('approved', lang));
}

export async function handleReject(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  if (!isAdmin(env, chatId)) {
    await sendMessage(env, chatId, tr('unauthorized', lang));
    return;
  }
  const args = (update.message?.text || '').split(/\s+/).slice(1);
  const userId = Number(args[0]);
  const pid = args[1];
  if (!userId || !pid) {
    await sendMessage(env, chatId, tr('reject_usage', lang));
    return;
  }
  const pending = await getPendingForUser(env, userId);
  if (!pending || pending.product_id !== pid) {
    await sendMessage(env, chatId, tr('pending_not_found', lang));
    return;
  }
  await removePending(env, userId, pid);
  await sendMessage(env, chatId, tr('rejected', lang));
}

export async function handleCode(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  const pid = (update.message?.text || '').split(/\s+/)[1];
  if (!pid) {
    await sendMessage(env, chatId, tr('code_usage', lang));
    return;
  }
  const product = await getProduct(env, pid);
  if (!product) {
    await sendMessage(env, chatId, tr('product_not_found', lang));
    return;
  }
  if (!(product.buyers || []).includes(chatId)) {
    await sendMessage(env, chatId, tr('not_purchased', lang));
    return;
  }
  const secret = product.secret;
  if (!secret) {
    await sendMessage(env, chatId, tr('no_secret', lang));
    return;
  }
  const code = authenticator.generate(secret);
  await sendMessage(env, chatId, tr('code_msg', lang).replace('{code}', code));
}

export async function handleEditProduct(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  if (!isAdmin(env, chatId)) {
    await sendMessage(env, chatId, tr('unauthorized', lang));
    return;
  }
  const args = (update.message?.text || '').split(/\s+/).slice(1);
  const pid = args[0];
  const field = args[1] as string;
  const value = args.slice(2).join(' ');
  if (!pid || !field || !value) {
    await sendMessage(env, chatId, tr('editproduct_usage', lang));
    return;
  }
  const product = await getProduct(env, pid);
  if (!product) {
    await sendMessage(env, chatId, tr('product_not_found', lang));
    return;
  }
  if (!['price', 'username', 'password', 'secret', 'name'].includes(field)) {
    await sendMessage(env, chatId, tr('invalid_field', lang));
    return;
  }
  await updateProductField(env, pid, field, value);
  await sendMessage(env, chatId, tr('product_updated', lang));
}

export async function handleDeleteProduct(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  if (!isAdmin(env, chatId)) {
    await sendMessage(env, chatId, tr('unauthorized', lang));
    return;
  }
  const pid = (update.message?.text || '').split(/\s+/)[1];
  if (!pid) {
    await sendMessage(env, chatId, tr('deleteproduct_usage', lang));
    return;
  }
  const product = await getProduct(env, pid);
  if (product) {
    await deleteProduct(env, pid);
    await sendMessage(env, chatId, tr('product_deleted', lang));
  } else {
    await sendMessage(env, chatId, tr('product_not_found', lang));
  }
}

export async function handleDeleteBuyer(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  if (!isAdmin(env, chatId)) {
    await sendMessage(env, chatId, tr('unauthorized', lang));
    return;
  }
  const args = (update.message?.text || '').split(/\s+/).slice(1);
  const pid = args[0];
  const uid = Number(args[1]);
  if (!pid || !uid) {
    await sendMessage(env, chatId, tr('deletebuyer_usage', lang));
    return;
  }
  const product = await getProduct(env, pid);
  if (!product) {
    await sendMessage(env, chatId, tr('product_not_found', lang));
    return;
  }
  const buyers = product.buyers || [];
  const index = buyers.indexOf(uid);
  if (index === -1) {
    await sendMessage(env, chatId, tr('buyer_not_found', lang));
    return;
  }
  await removeBuyer(env, pid, uid);
  await sendMessage(env, chatId, tr('buyer_removed', lang));
}

export async function handleClearBuyers(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  if (!isAdmin(env, chatId)) {
    await sendMessage(env, chatId, tr('unauthorized', lang));
    return;
  }
  const pid = (update.message?.text || '').split(/\s+/)[1];
  if (!pid) {
    await sendMessage(env, chatId, tr('clearbuyers_usage', lang));
    return;
  }
  const product = await getProduct(env, pid);
  if (!product) {
    await sendMessage(env, chatId, tr('product_not_found', lang));
    return;
  }
  await clearBuyers(env, pid);
  await sendMessage(env, chatId, tr('all_buyers_removed', lang));
}

export async function handleResend(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  if (!isAdmin(env, chatId)) {
    await sendMessage(env, chatId, tr('unauthorized', lang));
    return;
  }
  const args = (update.message?.text || '').split(/\s+/).slice(1);
  const pid = args[0];
  if (!pid) {
    await sendMessage(env, chatId, tr('resend_usage', lang));
    return;
  }
  const product = await getProduct(env, pid);
  if (!product) {
    await sendMessage(env, chatId, tr('product_not_found', lang));
    return;
  }
  let buyers = product.buyers || [];
  if (args.length > 1) {
    const uid = Number(args[1]);
    if (Number.isNaN(uid)) {
      await sendMessage(env, chatId, tr('invalid_user_id', lang));
      return;
    }
    buyers = buyers.includes(uid) ? [uid] : [];
  }
  if (!buyers.length) {
    await sendMessage(env, chatId, tr('no_buyers_send', lang));
    return;
  }
  const msg = tr('credentials_msg', lang)
    .replace('{username}', product.username)
    .replace('{password}', product.password);
  for (const uid of buyers) {
    await sendMessage(env, uid, msg);
    await sendMessage(env, uid, tr('use_code_button', lang), codeKeyboard(pid, lang));
  }
  await sendMessage(env, chatId, tr('credentials_resent', lang));
}

export async function handlePhoto(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const photos = update.message?.photo;
  if (!photos || !photos.length) return;
  const pending = await getPendingForUser(env, chatId);
  if (!pending) return;
  const fileId = photos[photos.length - 1].file_id;
  const fileInfoRes = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/getFile?file_id=${fileId}`
  );
  if (!fileInfoRes.ok) {
    console.error('Failed to fetch file info');
    return;
  }
  const fileInfo = (await fileInfoRes.json()) as any;
  const filePath = fileInfo.result.file_path;
  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`
  );
  if (!fileRes.ok || !fileRes.body) {
    console.error('Failed to fetch file');
    return;
  }
  await env.PROOFS.put(`${fileId}`, fileRes.body);
  await sendPhoto(
    env,
    Number(env.ADMIN_ID),
    fileId,
    `/approve ${chatId} ${pending.product_id}`
  );
  const lang = await userLang(env, chatId);
  await sendMessage(env, chatId, tr('payment_submitted', lang));
}

export const commandHandlers: Record<string, CommandHandler> = {
  '/start': handleStart,
  '/products': handleProducts,
  '/contact': handleContact,
  '/help': handleHelp,
  '/addproduct': handleAddProduct,
  '/pending': handlePending,
  '/stats': handleStats,
  '/buyers': handleBuyers,
  '/approve': handleApprove,
  '/reject': handleReject,
  '/code': handleCode,
  '/editproduct': handleEditProduct,
  '/deleteproduct': handleDeleteProduct,
  '/deletebuyer': handleDeleteBuyer,
  '/clearbuyers': handleClearBuyers,
  '/resend': handleResend,
  '/setlang': handleSetLang,
};

export async function handlePendingAddMessage(update: TelegramUpdate, env: Env): Promise<boolean> {
  const chatId = update.message?.chat.id;
  if (!chatId) return false;
  const row = await env.DB.prepare('SELECT step FROM pending_add WHERE user_id=?1').bind(chatId).first<any>();
  if (!row) return false;
  await continueAddFlow(update, env);
  return true;
}

export async function handlePendingEditMessage(update: TelegramUpdate, env: Env): Promise<boolean> {
  const chatId = update.message?.chat.id;
  if (!chatId) return false;
  const row = await env.DB.prepare('SELECT product_id FROM pending_edit WHERE user_id=?1').bind(chatId).first<any>();
  if (!row) return false;
  await continueEditFlow(update, env);
  return true;
}

// --- Callback handlers ---

export async function menuCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  const action = update.callback_query?.data.split(':')[1];
  if (action === 'language') {
    const buttons: InlineKeyboardButton[][] = [
      [{ text: tr('lang_en', lang), callback_data: 'language:en' }],
      [{ text: tr('lang_fa', lang), callback_data: 'language:fa' }],
      [{ text: tr('menu_back', lang), callback_data: 'menu:main' }],
    ];
    await sendMessage(env, chatId, tr('menu_language', lang), { inline_keyboard: buttons });
    return;
  }
  switch (action) {
    case 'main':
      await sendMessage(
        env,
        chatId,
        tr('welcome', lang),
        buildMainMenu(lang, isAdmin(env, chatId)),
      );
      break;
    case 'products': {
      const data = await loadData(env);
      const products = Object.entries(data.products);
      if (!products.length) {
        await sendMessage(env, chatId, tr('no_products', lang), buildBackMenu(lang));
        return;
      }
      for (const [pid, info] of products) {
        let text = `${pid}: ${info.price}`;
        if (info.name) text += `\n${info.name}`;
        await sendMessage(env, chatId, text, productKeyboard(pid, lang));
      }
      await sendMessage(env, chatId, tr('menu_back', lang), buildBackMenu(lang));
      break;
    }
    case 'contact':
      await sendMessage(
        env,
        chatId,
        tr('admin_phone', lang).replace('{phone}', env.ADMIN_PHONE),
        buildBackMenu(lang),
      );
      break;
    case 'help': {
      const userCmds = [
        tr('help_user_start', lang),
        tr('help_user_products', lang),
        tr('help_user_code', lang),
        tr('help_user_contact', lang),
        tr('help_user_setlang', lang),
        tr('help_user_help', lang),
      ];
      const adminCmds = [
        tr('help_admin_approve', lang),
        tr('help_admin_reject', lang),
        tr('help_admin_pending', lang),
        tr('help_admin_addproduct', lang),
        tr('help_admin_editproduct', lang),
        tr('help_admin_buyers', lang),
        tr('help_admin_deletebuyer', lang),
        tr('help_admin_clearbuyers', lang),
        tr('help_admin_resend', lang),
        tr('help_admin_stats', lang),
      ];
      const text =
        tr('help_user_header', lang) + '\n' + userCmds.join('\n') +
        '\n\n' + tr('help_admin_header', lang) + '\n' + adminCmds.join('\n');
      await sendMessage(env, chatId, text, buildBackMenu(lang));
      break;
    }
    case 'admin':
      if (!isAdmin(env, chatId)) {
        await sendMessage(env, chatId, tr('unauthorized', lang), buildBackMenu(lang));
        return;
      }
      await sendMessage(env, chatId, tr('menu_admin', lang), buildAdminMenu(lang));
      break;
  }
}

export async function buyCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  const pid = update.callback_query?.data.split(':')[1];
  if (!pid) return;
  const data = await loadData(env);
  if (!data.products[pid]) {
    await sendMessage(env, chatId, tr('product_not_found', lang));
    return;
  }
  data.pending.push({ user_id: chatId, product_id: pid });
  await saveData(env, data);
  await sendMessage(env, chatId, tr('send_proof', lang));
  await sendMessage(env, Number(env.ADMIN_ID), `/approve ${chatId} ${pid}`);
}

export async function codeCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  const pid = update.callback_query?.data.split(':')[1];
  const data = await loadData(env);
  const product = data.products[pid || ''];
  if (!product) {
    await sendMessage(env, chatId, tr('product_not_found', lang));
    return;
  }
  if (!(product.buyers || []).includes(chatId)) {
    await sendMessage(env, chatId, tr('not_purchased', lang));
    return;
  }
  const secret = product.secret;
  if (!secret) {
    await sendMessage(env, chatId, tr('no_secret', lang));
    return;
  }
  const code = authenticator.generate(secret);
  await sendMessage(env, chatId, tr('code_msg', lang).replace('{code}', code));
}

export async function languageMenuCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const dataStr = update.callback_query?.data || '';
  const parts = dataStr.split(':');
  const lang = await userLang(env, chatId);
  if (parts.length < 2) return;
  const langCode = parts[1] as Lang;
  if (!SUPPORTED_LANGS.has(langCode)) {
    await sendMessage(env, chatId, tr('unsupported_language', lang));
    return;
  }
  const data = await loadData(env);
  data.languages[chatId.toString()] = langCode;
  await saveData(env, data);
  await sendMessage(
    env,
    chatId,
    tr('language_set', langCode),
    buildMainMenu(langCode, isAdmin(env, chatId)),
  );
}

export async function adminMenuCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  if (!isAdmin(env, chatId)) {
    await sendMessage(env, chatId, tr('unauthorized', lang));
    return;
  }
  const action = update.callback_query?.data.split(':')[1];
  const data = await loadData(env);
  switch (action) {
    case 'pending':
      if (!data.pending.length) {
        await sendMessage(env, chatId, tr('no_pending', lang));
        return;
      }
      for (const p of data.pending) {
        const text = tr('pending_entry', lang)
          .replace('{user_id}', String(p.user_id))
          .replace('{product_id}', p.product_id);
        const buttons = [
          { text: tr('approve_button', lang), callback_data: `admin:approve:${p.user_id}:${p.product_id}` },
          { text: tr('reject_button', lang), callback_data: `admin:reject:${p.user_id}:${p.product_id}` },
        ];
        await sendMessage(env, chatId, text, { inline_keyboard: [buttons] });
      }
      break;
    case 'manage':
      await sendMessage(env, chatId, tr('menu_manage_products', lang), buildProductsMenu(lang));
      break;
    case 'addproduct':
      await sendMessage(env, chatId, tr('addproduct_usage', lang), { inline_keyboard: [[{ text: tr('menu_back', lang), callback_data: 'adminmenu:manage' }]] });
      break;
    case 'editproduct':
      if (!Object.keys(data.products).length) {
        await sendMessage(env, chatId, tr('no_products', lang), { inline_keyboard: [[{ text: tr('menu_back', lang), callback_data: 'adminmenu:manage' }]] });
        return;
      }
      {
        const buttons = Object.keys(data.products).map(pid => [{ text: pid, callback_data: `editprod:${pid}` }]);
        buttons.push([{ text: tr('menu_back', lang), callback_data: 'adminmenu:manage' }]);
        await sendMessage(env, chatId, tr('select_product_edit', lang), { inline_keyboard: buttons });
      }
      break;
    case 'deleteproduct':
      if (!Object.keys(data.products).length) {
        await sendMessage(env, chatId, tr('no_products', lang), { inline_keyboard: [[{ text: tr('menu_back', lang), callback_data: 'adminmenu:manage' }]] });
        return;
      }
      {
        const buttons = Object.keys(data.products).map(pid => [{ text: pid, callback_data: `delprod:${pid}` }]);
        buttons.push([{ text: tr('menu_back', lang), callback_data: 'adminmenu:manage' }]);
        await sendMessage(env, chatId, tr('select_product_delete', lang), { inline_keyboard: buttons });
      }
      break;
    case 'buyers':
      if (!Object.keys(data.products).length) {
        await sendMessage(env, chatId, tr('no_products', lang), { inline_keyboard: [[{ text: tr('menu_back', lang), callback_data: 'adminmenu:manage' }]] });
        return;
      }
      {
        const buttons = Object.keys(data.products).map(pid => [{ text: pid, callback_data: `buyerlist:${pid}` }]);
        buttons.push([{ text: tr('menu_back', lang), callback_data: 'adminmenu:manage' }]);
        await sendMessage(env, chatId, tr('select_product_buyers', lang), { inline_keyboard: buttons });
      }
      break;
    case 'clearbuyers':
      if (!Object.keys(data.products).length) {
        await sendMessage(env, chatId, tr('no_products', lang), { inline_keyboard: [[{ text: tr('menu_back', lang), callback_data: 'adminmenu:manage' }]] });
        return;
      }
      {
        const buttons = Object.keys(data.products).map(pid => [{ text: pid, callback_data: `adminclearbuyers:${pid}` }]);
        buttons.push([{ text: tr('menu_back', lang), callback_data: 'adminmenu:manage' }]);
        await sendMessage(env, chatId, tr('select_product_clearbuyers', lang), { inline_keyboard: buttons });
      }
      break;
    case 'resend':
      if (!Object.keys(data.products).length) {
        await sendMessage(env, chatId, tr('no_products', lang), { inline_keyboard: [[{ text: tr('menu_back', lang), callback_data: 'adminmenu:manage' }]] });
        return;
      }
      {
        const buttons = Object.keys(data.products).map(pid => [{ text: pid, callback_data: `adminresend:${pid}` }]);
        buttons.push([{ text: tr('menu_back', lang), callback_data: 'adminmenu:manage' }]);
        await sendMessage(env, chatId, tr('select_product_clearbuyers', lang), { inline_keyboard: buttons });
      }
      break;
    case 'stats':
      if (!Object.keys(data.products).length) {
        await sendMessage(env, chatId, tr('no_products', lang), { inline_keyboard: [[{ text: tr('menu_back', lang), callback_data: 'adminmenu:manage' }]] });
        return;
      }
      {
        const buttons = Object.keys(data.products).map(pid => [{ text: pid, callback_data: `adminstats:${pid}` }]);
        buttons.push([{ text: tr('menu_back', lang), callback_data: 'adminmenu:manage' }]);
        await sendMessage(env, chatId, tr('select_product_stats', lang), { inline_keyboard: buttons });
      }
      break;
  }
}

export async function adminCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  if (!isAdmin(env, chatId)) {
    await sendMessage(env, chatId, tr('unauthorized', lang));
    return;
  }
  const parts = update.callback_query?.data.split(':') || [];
  const action = parts[1];
  const data = await loadData(env);
  if (action === 'approve' || action === 'reject') {
    const userId = Number(parts[2]);
    const pid = parts[3];
    if (!userId || !pid) return;
    const index = data.pending.findIndex(p => p.user_id === userId && p.product_id === pid);
    if (index === -1) {
      await sendMessage(env, chatId, tr('pending_not_found', lang));
      return;
    }
    data.pending.splice(index, 1);
    if (action === 'approve') {
      const product = data.products[pid];
      const buyers = product.buyers || [];
      if (!buyers.includes(userId)) buyers.push(userId);
      product.buyers = buyers;
      await saveData(env, data);
      const msg = tr('credentials_msg', lang)
        .replace('{username}', product.username)
        .replace('{password}', product.password);
      await sendMessage(env, userId, msg);
      await sendMessage(env, userId, tr('use_code_button', lang), codeKeyboard(pid, lang));
      await sendMessage(env, chatId, tr('approved', lang));
    } else {
      await saveData(env, data);
      await sendMessage(env, chatId, tr('rejected', lang));
    }
    return;
  } else if (action === 'deletebuyer') {
    const pid = parts[2];
    const uid = Number(parts[3]);
    if (!pid || !uid) return;
    const product = data.products[pid];
    if (!product) {
      await sendMessage(env, chatId, tr('product_not_found', lang));
      return;
    }
    const idx = (product.buyers || []).indexOf(uid);
    if (idx !== -1) {
      product.buyers.splice(idx, 1);
      await saveData(env, data);
      await sendMessage(env, chatId, tr('buyer_removed', lang));
    } else {
      await sendMessage(env, chatId, tr('buyer_not_found', lang));
    }
  }
}

export async function editprodCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  if (!isAdmin(env, chatId)) {
    await sendMessage(env, chatId, tr('unauthorized', lang));
    return;
  }
  const pid = update.callback_query?.data.split(':')[1];
  const buttons = [
    [{ text: 'price', callback_data: `editfield:${pid}:price` }],
    [{ text: 'username', callback_data: `editfield:${pid}:username` }],
    [{ text: 'password', callback_data: `editfield:${pid}:password` }],
    [{ text: 'secret', callback_data: `editfield:${pid}:secret` }],
    [{ text: 'name', callback_data: `editfield:${pid}:name` }],
  ];
  await sendMessage(env, chatId, tr('select_field_edit', lang), { inline_keyboard: buttons });
}

export async function editfieldCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  const parts = update.callback_query?.data.split(':') || [];
  const pid = parts[1];
  const field = parts[2];
  await startEditFlow(env, chatId, pid, field, lang);
}

export async function buyerlistCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  if (!isAdmin(env, chatId)) {
    await sendMessage(env, chatId, tr('unauthorized', lang));
    return;
  }
  const pid = update.callback_query?.data.split(':')[1];
  const data = await loadData(env);
  const product = data.products[pid || ''];
  if (!product) {
    await sendMessage(env, chatId, tr('product_not_found', lang));
    return;
  }
  const buyers = product.buyers || [];
  if (!buyers.length) {
    await sendMessage(env, chatId, tr('no_buyers', lang));
    return;
  }
  for (const uid of buyers) {
    const btn = [{ text: tr('delete_button', lang), callback_data: `admin:deletebuyer:${pid}:${uid}` }];
    await sendMessage(env, chatId, String(uid), { inline_keyboard: [btn] });
  }
}

export async function clearbuyersCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  if (!isAdmin(env, chatId)) {
    await sendMessage(env, chatId, tr('unauthorized', lang));
    return;
  }
  const pid = update.callback_query?.data.split(':')[1];
  const data = await loadData(env);
  const product = data.products[pid || ''];
  if (!product) {
    await sendMessage(env, chatId, tr('product_not_found', lang));
    return;
  }
  product.buyers = [];
  await saveData(env, data);
  await sendMessage(env, chatId, tr('all_buyers_removed', lang));
}

export async function resendCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  if (!isAdmin(env, chatId)) {
    await sendMessage(env, chatId, tr('unauthorized', lang));
    return;
  }
  const parts = update.callback_query?.data.split(':') || [];
  if (parts.length === 2) {
    const pid = parts[1];
    const data = await loadData(env);
    const product = data.products[pid];
    if (!product) {
      await sendMessage(env, chatId, tr('product_not_found', lang));
      return;
    }
    const buyers = product.buyers || [];
    if (!buyers.length) {
      await sendMessage(env, chatId, tr('no_buyers', lang));
      return;
    }
    for (const uid of buyers) {
      const btn = [{ text: tr('resend_button', lang), callback_data: `adminresend:${pid}:${uid}` }];
      await sendMessage(env, chatId, String(uid), { inline_keyboard: [btn] });
    }
    return;
  }
  const pid = parts[1];
  const uid = Number(parts[2]);
  const data = await loadData(env);
  const product = data.products[pid];
  if (!product || !(product.buyers || []).includes(uid)) {
    await sendMessage(env, chatId, tr('buyer_not_found', lang));
    return;
  }
  const msg = tr('credentials_msg', lang)
    .replace('{username}', product.username)
    .replace('{password}', product.password);
  await sendMessage(env, uid, msg);
  await sendMessage(env, uid, tr('use_code_button', lang), codeKeyboard(pid, lang));
  await sendMessage(env, chatId, tr('credentials_resent', lang));
}

export async function deleteprodCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  if (!isAdmin(env, chatId)) {
    await sendMessage(env, chatId, tr('unauthorized', lang));
    return;
  }
  const parts = update.callback_query?.data.split(':') || [];
  const pid = parts[1];
  const data = await loadData(env);
  if (parts.length === 2) {
    if (!data.products[pid]) {
      await sendMessage(env, chatId, tr('product_not_found', lang));
      return;
    }
    const buttons = [
      [{ text: tr('delete_button', lang), callback_data: `delprod:${pid}:confirm` }],
      [{ text: tr('menu_back', lang), callback_data: 'adminmenu:deleteproduct' }],
    ];
    await sendMessage(env, chatId, tr('confirm_delete', lang).replace('{pid}', pid), { inline_keyboard: buttons });
    return;
  }
  if (parts[2] === 'confirm') {
    if (data.products[pid]) {
      delete data.products[pid];
      await saveData(env, data);
      await sendMessage(env, chatId, tr('product_deleted', lang));
    } else {
      await sendMessage(env, chatId, tr('product_not_found', lang));
    }
  }
}

export async function statsCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  const pid = update.callback_query?.data.split(':')[1];
  const data = await loadData(env);
  const product = data.products[pid || ''];
  if (!product) {
    await sendMessage(env, chatId, tr('product_not_found', lang));
    return;
  }
  const buyers = product.buyers || [];
  const text = [
    tr('price_line', lang).replace('{price}', String(product.price)),
    tr('total_buyers_line', lang).replace('{count}', String(buyers.length)),
  ].join('\n');
  await sendMessage(env, chatId, text);
}

export const callbackHandlers: Record<string, CallbackHandler> = {
  'menu': menuCallback,
  'buy': buyCallback,
  'code': codeCallback,
  'language': languageMenuCallback,
  'adminmenu': adminMenuCallback,
  'admin': adminCallback,
  'editprod': editprodCallback,
  'editfield': editfieldCallback,
  'buyerlist': buyerlistCallback,
  'adminclearbuyers': clearbuyersCallback,
  'adminresend': resendCallback,
  'delprod': deleteprodCallback,
  'adminstats': statsCallback,
};

export async function handleCallbackQuery(update: TelegramUpdate, env: Env): Promise<void> {
  const data = update.callback_query?.data;
  if (!data) return;
  const key = data.split(':')[0];
  const handler = callbackHandlers[key];
  if (handler) {
    await handler(update, env);
  }
}
