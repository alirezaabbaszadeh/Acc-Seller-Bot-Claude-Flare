import type { TelegramUpdate, CommandHandler } from "./telegram-utils";
import type { Env } from "./env";
import { tr, type Lang } from "./translations";
import { authenticator } from "otplib";
import {
  loadData,
  saveData,
  setLanguage,
  listProducts,
  getProduct,
  upsertProduct,
  updateProductField,
  deleteProduct,
  addBuyer,
  removeBuyer,
  clearBuyers,
  listPending,
  addPending,
  removePending,
  getPendingForUser
} from "./data";
import {
  userLang,
  sendMessage,
  sendPhoto,
  productKeyboard,
  codeKeyboard,
  buildBackMenu,
  buildMainMenu,
  buildAdminMenu,
  buildProductsMenu,
  SUPPORTED_LANGS,
  isAdmin
} from "./telegram-utils";

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

export async function startEditFlow(env: Env, chatId: number, pid: string, field: string, lang: Lang) {
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


