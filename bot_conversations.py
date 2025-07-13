from telegram import ReplyKeyboardMarkup, ReplyKeyboardRemove
from telegram.ext import ConversationHandler

from bot import ADMIN_ID, data, storage, ensure_lang
from botlib.translations import tr

ASK_ID, ASK_PRICE, ASK_USERNAME, ASK_PASSWORD, ASK_SECRET, ASK_NAME = range(6)
CANCEL_TEXT = "Cancel"


async def addproduct_menu(update, context):
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data["lang"]
    message = getattr(update, "message", None)
    if message is None:
        message = update.callback_query.message
        await update.callback_query.answer()
    if update.effective_user.id != ADMIN_ID:
        await message.reply_text(tr("unauthorized", lang))
        return ConversationHandler.END
    context.user_data["new_product"] = {}
    await message.reply_text(
        tr("ask_product_id", lang),
        reply_markup=ReplyKeyboardMarkup(
            [[tr("cancel_button", lang)]], one_time_keyboard=True
        ),
    )
    return ASK_ID


async def addproduct_id(update, context):
    lang = context.user_data["lang"]
    cancel_text = tr("cancel_button", lang)
    if update.message.text in (CANCEL_TEXT, cancel_text, tr("back_button", lang)):
        return await addproduct_cancel(update, context)
    context.user_data["pid"] = update.message.text
    context.user_data["new_product"]["pid"] = update.message.text
    await update.message.reply_text(
        tr("ask_product_price", lang),
        reply_markup=ReplyKeyboardMarkup([[cancel_text]], one_time_keyboard=True),
    )
    return ASK_PRICE


async def addproduct_price(update, context):
    lang = context.user_data["lang"]
    cancel_text = tr("cancel_button", lang)
    if update.message.text in (CANCEL_TEXT, cancel_text, tr("back_button", lang)):
        return await addproduct_cancel(update, context)
    context.user_data["price"] = update.message.text
    context.user_data["new_product"]["price"] = update.message.text
    await update.message.reply_text(
        tr("ask_product_username", lang),
        reply_markup=ReplyKeyboardMarkup([[cancel_text]], one_time_keyboard=True),
    )
    return ASK_USERNAME


async def addproduct_username(update, context):
    lang = context.user_data["lang"]
    cancel_text = tr("cancel_button", lang)
    if update.message.text in (CANCEL_TEXT, cancel_text, tr("back_button", lang)):
        return await addproduct_cancel(update, context)
    context.user_data["username"] = update.message.text
    context.user_data["new_product"]["username"] = update.message.text
    await update.message.reply_text(
        tr("ask_product_password", lang),
        reply_markup=ReplyKeyboardMarkup([[cancel_text]], one_time_keyboard=True),
    )
    return ASK_PASSWORD


async def addproduct_password(update, context):
    lang = context.user_data["lang"]
    cancel_text = tr("cancel_button", lang)
    if update.message.text in (CANCEL_TEXT, cancel_text, tr("back_button", lang)):
        return await addproduct_cancel(update, context)
    context.user_data["password"] = update.message.text
    context.user_data["new_product"]["password"] = update.message.text
    await update.message.reply_text(
        tr("ask_product_secret", lang),
        reply_markup=ReplyKeyboardMarkup([[cancel_text]], one_time_keyboard=True),
    )
    return ASK_SECRET


async def addproduct_secret(update, context):
    lang = context.user_data["lang"]
    cancel_text = tr("cancel_button", lang)
    if update.message.text in (CANCEL_TEXT, cancel_text, tr("back_button", lang)):
        return await addproduct_cancel(update, context)
    context.user_data["secret"] = update.message.text
    context.user_data["new_product"]["secret"] = update.message.text
    await update.message.reply_text(
        tr("ask_product_name", lang),
        reply_markup=ReplyKeyboardMarkup([[cancel_text]], one_time_keyboard=True),
    )
    return ASK_NAME


async def addproduct_name(update, context):
    lang = context.user_data["lang"]
    cancel_text = tr("cancel_button", lang)
    if update.message.text in (CANCEL_TEXT, cancel_text, tr("back_button", lang)):
        return await addproduct_cancel(update, context)
    name = update.message.text
    pid = context.user_data["pid"]
    data["products"][pid] = {
        "price": context.user_data["price"],
        "username": context.user_data["username"],
        "password": context.user_data["password"],
        "secret": context.user_data["secret"],
        "buyers": [],
    }
    if name and name != "-":
        data["products"][pid]["name"] = name
        context.user_data["new_product"]["name"] = name
    await storage.save(data)
    context.user_data.pop("new_product", None)
    await update.message.reply_text(tr("product_added", lang), reply_markup=ReplyKeyboardRemove())
    return ConversationHandler.END


async def addproduct_cancel(update, context):
    lang = context.user_data.get("lang", "en")
    context.user_data.pop("new_product", None)
    await update.message.reply_text(
        tr("operation_cancelled", lang), reply_markup=ReplyKeyboardRemove()
    )
    return ConversationHandler.END
