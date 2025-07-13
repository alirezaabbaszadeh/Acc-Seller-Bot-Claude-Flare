import type { Env } from './env';
import { tr, type Lang } from './translations';

interface Data {
  products: Record<string, Record<string, any>>;
  pending: { user_id: number; product_id: string }[];
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
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value),
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
    ['decrypt'],
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
    return await decryptData(stored as Data, env.FERNET_KEY);
  }
  return { products: {}, pending: [], languages: {} };
}

async function saveData(env: Env, data: Data): Promise<void> {
  const enc = await encryptData(data, env.FERNET_KEY);
  await env.DATA.put('state', JSON.stringify(enc));
}

async function userLang(env: Env, userId: number): Promise<Lang> {
  const data = await loadData(env);
  return (data.languages[userId.toString()] as Lang) ?? 'en';
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

export async function handleStart(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  await sendMessage(env, chatId, tr('welcome', lang));
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
    await sendMessage(env, chatId, tr('ask_product_id', lang));
    return;
  }
  if (args.length < 5) {
    await sendMessage(env, chatId, tr('addproduct_usage', lang));
    return;
  }
  const [pid, price, username, password, secret, ...nameParts] = args;
  const name = nameParts.join(' ');
  const data = await loadData(env);
  if (pid in data.products) {
    await sendMessage(env, chatId, tr('product_exists', lang));
    return;
  }
  data.products[pid] = { price, username, password, secret, buyers: [] };
  if (name) {
    data.products[pid].name = name;
  }
  await saveData(env, data);
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
  const data = await loadData(env);
  if (!data.pending.length) {
    await sendMessage(env, chatId, tr('no_pending', lang));
    return;
  }
  const lines = data.pending.map((p) =>
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
  const data = await loadData(env);
  const product = data.products[pid];
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
  const data = await loadData(env);
  const product = data.products[pid];
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
  const data = await loadData(env);
  data.languages[chatId.toString()] = code as Lang;
  await saveData(env, data);
  await sendMessage(env, chatId, tr('language_set', code as Lang));
}

export const commandHandlers: Record<string, CommandHandler> = {
  '/start': handleStart,
  '/addproduct': handleAddProduct,
  '/pending': handlePending,
  '/stats': handleStats,
  '/buyers': handleBuyers,
  '/setlang': handleSetLang,
};

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
  await sendMessage(env, chatId, tr('menu_callback_stub', lang));
}

export async function buyCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  await sendMessage(env, chatId, tr('buy_callback_stub', lang));
}

export async function codeCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  await sendMessage(env, chatId, tr('code_callback_stub', lang));
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
  await sendMessage(env, chatId, tr('admin_menu_callback_stub', lang));
}

export async function adminCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  await sendMessage(env, chatId, tr('admin_callback_stub', lang));
}

export async function editprodCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  await sendMessage(env, chatId, tr('edit_product_callback_stub', lang));
}

export async function editfieldCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  await sendMessage(env, chatId, tr('edit_field_callback_stub', lang));
}

export async function buyerlistCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  await sendMessage(env, chatId, tr('buyer_list_callback_stub', lang));
}

export async function clearbuyersCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  await sendMessage(env, chatId, tr('clear_buyers_callback_stub', lang));
}

export async function resendCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  await sendMessage(env, chatId, tr('resend_callback_stub', lang));
}

export async function deleteprodCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  await sendMessage(env, chatId, tr('delete_product_callback_stub', lang));
}

export async function statsCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  const lang = await userLang(env, chatId);
  await sendMessage(env, chatId, tr('stats_callback_stub', lang));
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
