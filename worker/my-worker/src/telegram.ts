import type { Env } from './env';
import { tr, type Lang } from './translations';

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
  await sendMessage(env, chatId, tr('welcome', 'en'));
}

export async function handleAddProduct(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  await sendMessage(env, chatId, 'Add product command stub');
}

export async function handlePending(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  await sendMessage(env, chatId, 'Pending command stub');
}

export async function handleStats(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  await sendMessage(env, chatId, 'Stats command stub');
}

export async function handleBuyers(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  await sendMessage(env, chatId, 'Buyers command stub');
}

export const commandHandlers: Record<string, CommandHandler> = {
  '/start': handleStart,
  '/addproduct': handleAddProduct,
  '/pending': handlePending,
  '/stats': handleStats,
  '/buyers': handleBuyers,
};

// --- Callback handlers ---

export async function menuCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  await sendMessage(env, chatId, 'Menu callback stub');
}

export async function buyCallback(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.callback_query?.message?.chat.id;
  if (!chatId) return;
  await sendMessage(env, chatId, 'Buy callback stub');
}

export const callbackHandlers: Record<string, CallbackHandler> = {
  'menu': menuCallback,
  'buy': buyCallback,
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
