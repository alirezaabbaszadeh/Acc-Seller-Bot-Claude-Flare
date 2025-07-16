import { startEditFlow } from "./telegram-commands";
import type { Env } from "./env";
import { tr, type Lang } from "./translations";
import { loadData, saveData } from "./data";
import {
  userLang,
  sendMessage,
  productKeyboard,
  codeKeyboard,
  buildBackMenu,
  buildMainMenu,
  buildAdminMenu,
  buildProductsMenu,
  isAdmin,
  InlineKeyboardButton,
  CallbackHandler,
  TelegramUpdate
} from "./telegram-utils";

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


