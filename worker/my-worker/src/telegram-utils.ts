import type { Env } from './env';
import { tr, type Lang } from './translations';
import { getLanguage, getPendingForUser } from './data';
import { bytesToB64 } from './crypto';

export async function userLang(env: Env, userId: number): Promise<Lang> {
  return (await getLanguage(env, userId)) as Lang ?? 'en';
}

export const SUPPORTED_LANGS = new Set<Lang>(['en', 'fa']);

export function isAdmin(env: Env, userId: number): boolean {
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

export async function sendMessage(
  env: Env,
  chatId: number,
  text: string,
  replyMarkup?: unknown,
): Promise<Response> {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
  const options: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }),
  };
  let res = await fetch(url, options);
  if (!res.ok) {
    console.error('Failed to send message', res.status, res.statusText);
    res = await fetch(url, options);
    if (!res.ok) {
      console.error('Retry sendMessage failed', res.status, res.statusText);
    }
  }
  return res;
}

export async function sendPhoto(
  env: Env,
  chatId: number,
  fileId: string,
  caption: string,
): Promise<Response> {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendPhoto`;
  const options: RequestInit = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, photo: fileId, caption }),
  };
  let res = await fetch(url, options);
  if (!res.ok) {
    console.error('Failed to send photo', res.status, res.statusText);
    res = await fetch(url, options);
    if (!res.ok) {
      console.error('Retry sendPhoto failed', res.status, res.statusText);
    }
  }
  return res;
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
  try {
    const data = bytesToB64(new Uint8Array(await fileRes.arrayBuffer()));
    await env.DB.prepare(
      'INSERT INTO proofs (id, user_id, product_id, data) VALUES (?1, ?2, ?3, ?4)'
    ).bind(fileId, chatId, pending.product_id, data).run();
  } catch (err) {
    console.error('Failed to store proof in D1', err);
    return;
  }
  await sendPhoto(
    env,
    Number(env.ADMIN_ID),
    fileId,
    `/approve ${chatId} ${pending.product_id}`
  );
  const lang = await userLang(env, chatId);
  await sendMessage(env, chatId, tr('payment_submitted', lang));
}

