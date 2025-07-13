import type { Env } from './env';

export interface TelegramMessage {
  chat: { id: number };
  text?: string;
}

export interface TelegramUpdate {
  message?: TelegramMessage;
}

export type CommandHandler = (update: TelegramUpdate, env: Env) => Promise<void>;

export async function sendMessage(env: Env, chatId: number, text: string, replyMarkup?: unknown): Promise<Response> {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }),
  });
}

export async function handleStart(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  await sendMessage(env, chatId, 'Start command stub');
}

export async function handleAddProduct(update: TelegramUpdate, env: Env): Promise<void> {
  const chatId = update.message?.chat.id;
  if (!chatId) return;
  await sendMessage(env, chatId, 'Add product command stub');
}

export const commandHandlers: Record<string, CommandHandler> = {
  '/start': handleStart,
  '/addproduct': handleAddProduct,
};
