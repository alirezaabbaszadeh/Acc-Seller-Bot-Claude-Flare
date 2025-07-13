# Telegram bot for managing product sales with TOTP support
import logging
from functools import wraps
import os
import sys
from pathlib import Path
import asyncio

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
    CallbackQueryHandler,
    ConversationHandler,
)
import pyotp
from botlib.translations import tr
from botlib.storage import JSONStorage

# Languages that can be used with /setlang
SUPPORTED_LANGS = {"en", "fa"}

logger = logging.getLogger("accounts_bot")
logging.basicConfig(
    format="%(asctime)s %(name)s %(levelname)s: %(message)s",
    level=logging.INFO,
)

# Data file path can be overridden via DATA_FILE env var
DEFAULT_DATA_FILE = Path(__file__).resolve().parent / 'data.json'
DATA_FILE = Path(os.environ.get('DATA_FILE', DEFAULT_DATA_FILE))
try:
    ADMIN_ID = int(os.environ["ADMIN_ID"])
except KeyError:
    logger.error("ADMIN_ID environment variable not set")
    raise SystemExit("ADMIN_ID environment variable not set")
except ValueError as e:
    logger.error("ADMIN_ID must be an integer")
    raise SystemExit("ADMIN_ID must be an integer") from e

ADMIN_PHONE = os.environ.get("ADMIN_PHONE")  # manager contact number
if not ADMIN_PHONE:
    logger.error("ADMIN_PHONE environment variable not set")
    raise SystemExit("ADMIN_PHONE environment variable not set")

FERNET_KEY = os.environ.get("FERNET_KEY")
if not FERNET_KEY:
    logger.error("FERNET_KEY environment variable not set")
    raise SystemExit("FERNET_KEY environment variable not set")


storage = JSONStorage(DATA_FILE, FERNET_KEY.encode())
data = asyncio.run(storage.load())
data.setdefault('languages', {})


def user_lang(user_id: int) -> str:
    """Return stored language for a user, defaulting to 'en'."""
    return data.get('languages', {}).get(str(user_id), 'en')


def ensure_lang(context: ContextTypes.DEFAULT_TYPE, user_id: int) -> None:
    """Ensure ``context.user_data['lang']`` is set for the user."""
    context.user_data.setdefault('lang', user_lang(user_id))


def log_command(func):
    """Log user ID and command text before executing a handler."""
    @wraps(func)
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE, *args, **kwargs):
        user_id = update.effective_user.id if update.effective_user else None
        command = None
        if update.message:
            command = getattr(update.message, "text", None)
        elif update.callback_query:
            command = update.callback_query.data
        logger.info("User %s invoked %s", user_id, command or func.__name__)
        return await func(update, context, *args, **kwargs)

    return wrapper


def admin_required(func):
    """Ensure the handler is executed only by the admin."""

    @wraps(func)
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE, *args, **kwargs):
        ensure_lang(context, update.effective_user.id)
        lang = context.user_data['lang']
        if update.effective_user.id != ADMIN_ID:
            target = update.message or update.callback_query.message
            await target.reply_text(tr('unauthorized', lang))
            return
        return await func(update, context, *args, **kwargs)

    return wrapper


@log_command
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data['lang']
    await update.message.reply_text(
        tr('welcome', lang),
        reply_markup=build_main_menu(lang, update.effective_user.id == ADMIN_ID),
    )


@log_command
async def contact(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send admin phone number."""
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data['lang']
    await update.message.reply_text(tr('admin_phone', lang).format(phone=ADMIN_PHONE))


@log_command
async def setlang(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Change the user's language preference."""
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data['lang']
    try:
        lang_code = context.args[0].lower()
    except IndexError:
        await update.message.reply_text(tr('setlang_usage', lang))
        return
    if lang_code not in SUPPORTED_LANGS:
        await update.message.reply_text(tr('unsupported_language', lang))
        return
    data.setdefault('languages', {})[str(update.effective_user.id)] = lang_code
    await storage.save(data)
    context.user_data['lang'] = lang_code
    await update.message.reply_text(tr('language_set', lang_code))


def product_keyboard(product_id: str, lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[InlineKeyboardButton(tr('buy_button', lang), callback_data=f'buy:{product_id}')]])


def code_keyboard(pid: str, lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [[InlineKeyboardButton(tr('code_button', lang), callback_data=f'code:{pid}')]]
    )


def build_back_menu(lang: str) -> InlineKeyboardMarkup:
    """Return a markup with a single back button."""
    return InlineKeyboardMarkup(
        [[InlineKeyboardButton(tr('menu_back', lang), callback_data='menu:main')]]
    )


def build_admin_menu(lang: str) -> InlineKeyboardMarkup:
    """Return the admin submenu keyboard."""
    keyboard = [
        [
            InlineKeyboardButton(
                tr('menu_pending', lang), callback_data='adminmenu:pending'
            )
        ],
        [
            InlineKeyboardButton(
                tr('menu_manage_products', lang),
                callback_data='adminmenu:manage',
            )
        ],
        [InlineKeyboardButton(tr('menu_stats', lang), callback_data='adminmenu:stats')],
        [InlineKeyboardButton(tr('menu_back', lang), callback_data='menu:main')],
    ]
    return InlineKeyboardMarkup(keyboard)


def build_products_menu(lang: str) -> InlineKeyboardMarkup:
    """Return submenu for managing products."""
    keyboard = [
        [
            InlineKeyboardButton(
                tr('menu_addproduct', lang), callback_data='adminmenu:addproduct'
            )
        ],
        [
            InlineKeyboardButton(
                tr('menu_editproduct', lang), callback_data='adminmenu:editproduct'
            )
        ],
        [
            InlineKeyboardButton(
                tr('menu_deleteproduct', lang),
                callback_data='adminmenu:deleteproduct',
            )
        ],
        [InlineKeyboardButton(tr('menu_stats', lang), callback_data='adminmenu:stats')],
        [InlineKeyboardButton(tr('menu_buyers', lang), callback_data='adminmenu:buyers')],
        [InlineKeyboardButton(tr('menu_clearbuyers', lang), callback_data='adminmenu:clearbuyers')],
        [InlineKeyboardButton(tr('menu_resend', lang), callback_data='adminmenu:resend')],
        [InlineKeyboardButton(tr('menu_back', lang), callback_data='menu:admin')],
    ]
    return InlineKeyboardMarkup(keyboard)


def build_main_menu(lang: str, is_admin: bool = False) -> InlineKeyboardMarkup:
    """Return the main menu keyboard."""
    keyboard = [
        [InlineKeyboardButton(tr('menu_products', lang), callback_data='menu:products')],
        [InlineKeyboardButton(tr('menu_contact', lang), callback_data='menu:contact')],
        [InlineKeyboardButton(tr('menu_help', lang), callback_data='menu:help')],
        [InlineKeyboardButton(tr('menu_language', lang), callback_data='menu:language')],
    ]
    if is_admin:
        keyboard.append([InlineKeyboardButton(tr('menu_admin', lang), callback_data='menu:admin')])
    return InlineKeyboardMarkup(keyboard)


@log_command
async def products(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data['lang']
    if not data['products']:
        await update.message.reply_text(tr('no_products', lang))
        return
    for pid, info in data['products'].items():
        text = f"{pid}: {info['price']}"
        name = info.get('name')
        if name:
            text += f"\n{name}"
        await update.message.reply_text(text, reply_markup=product_keyboard(pid, lang))


@log_command
async def buy_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data['lang']
    query = update.callback_query
    await query.answer()
    pid = query.data.split(':')[1]
    context.user_data['buy_pid'] = pid
    await query.message.reply_text(tr('send_proof', lang))


@log_command
async def code_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send TOTP code when user presses inline button."""
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data['lang']
    query = update.callback_query
    await query.answer()
    pid = query.data.split(':')[1]
    product = data['products'].get(pid)
    if not product:
        await query.message.reply_text(tr('product_not_found', lang))
        return
    if query.from_user.id not in product.get('buyers', []):
        await query.message.reply_text(tr('not_purchased', lang))
        return
    secret = product.get('secret')
    if not secret:
        await query.message.reply_text(tr('no_secret', lang))
        return
    totp = pyotp.TOTP(secret)
    await query.message.reply_text(tr('code_msg', lang).format(code=totp.now()))


@log_command
async def menu_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle main menu buttons via callback queries."""
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data['lang']
    query = update.callback_query
    await query.answer()
    action = query.data.split(':')[1]
    if action == 'main':
        await query.message.reply_text(
            tr('welcome', lang),
            reply_markup=build_main_menu(lang, query.from_user.id == ADMIN_ID),
        )
    elif action == 'products':
        if not data['products']:
            await query.message.reply_text(
                tr('no_products', lang), reply_markup=build_back_menu(lang)
            )
            return
        for pid, info in data['products'].items():
            text = f"{pid}: {info['price']}"
            name = info.get('name')
            if name:
                text += f"\n{name}"
            await query.message.reply_text(
                text, reply_markup=product_keyboard(pid, lang)
            )
        await query.message.reply_text(
            tr('menu_back', lang), reply_markup=build_back_menu(lang)
        )
    elif action == 'contact':
        await query.message.reply_text(
            tr('admin_phone', lang).format(phone=ADMIN_PHONE),
            reply_markup=build_back_menu(lang),
        )
    elif action == 'help':
        user_cmds = [
            tr('help_user_start', lang),
            tr('help_user_products', lang),
            tr('help_user_code', lang),
            tr('help_user_contact', lang),
            tr('help_user_setlang', lang),
            tr('help_user_help', lang),
        ]
        admin_cmds = [
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
        ]
        text = tr('help_user_header', lang) + '\n' + '\n'.join(user_cmds)
        text += '\n\n' + tr('help_admin_header', lang) + '\n' + '\n'.join(
            admin_cmds
        )
        await query.message.reply_text(text, reply_markup=build_back_menu(lang))
    elif action == 'admin':
        if query.from_user.id != ADMIN_ID:
            await query.message.reply_text(
                tr('unauthorized', lang), reply_markup=build_back_menu(lang)
            )
            return
        await query.message.reply_text(
            tr('menu_admin', lang), reply_markup=build_admin_menu(lang)
        )


@log_command
async def language_menu_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show language selection menu and handle selection."""
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data['lang']
    query = update.callback_query
    await query.answer()
    parts = query.data.split(':')
    if query.data == 'menu:language':
        buttons = [
            [InlineKeyboardButton(tr('lang_en', lang), callback_data='language:en')],
            [InlineKeyboardButton(tr('lang_fa', lang), callback_data='language:fa')],
            [InlineKeyboardButton(tr('menu_back', lang), callback_data='menu:main')],
        ]
        await query.message.reply_text(
            tr('menu_language', lang), reply_markup=InlineKeyboardMarkup(buttons)
        )
        return
    if parts[0] == 'language' and len(parts) > 1:
        lang_code = parts[1]
        if lang_code in SUPPORTED_LANGS:
            data.setdefault('languages', {})[str(update.effective_user.id)] = lang_code
            await storage.save(data)
            context.user_data['lang'] = lang_code
            await query.message.reply_text(
                tr('language_set', lang_code),
                reply_markup=build_main_menu(
                    lang_code, update.effective_user.id == ADMIN_ID
                ),
            )


@log_command
@admin_required
async def admin_menu_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle buttons in the admin submenu."""
    lang = context.user_data['lang']
    query = update.callback_query
    await query.answer()
    action = query.data.split(':')[1]
    if action == 'pending':
        if not data['pending']:
            await query.message.reply_text(tr('no_pending', lang))
            return
        for p in data['pending']:
            text = tr('pending_entry', lang).format(
                user_id=p['user_id'], product_id=p['product_id']
            )
            buttons = [
                InlineKeyboardButton(
                    tr('approve_button', lang),
                    callback_data=f"admin:approve:{p['user_id']}:{p['product_id']}"
                ),
                InlineKeyboardButton(
                    tr('reject_button', lang),
                    callback_data=f"admin:reject:{p['user_id']}:{p['product_id']}"
                ),
            ]
            await query.message.reply_text(
                text, reply_markup=InlineKeyboardMarkup([buttons])
            )
    elif action == 'manage':
        await query.message.reply_text(
            tr('menu_manage_products', lang), reply_markup=build_products_menu(lang)
        )
    elif action == 'addproduct':
        await query.message.reply_text(
            tr('addproduct_usage', lang),
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton(tr('menu_back', lang), callback_data='adminmenu:manage')]]
            ),
        )
    elif action == 'editproduct':
        if not data['products']:
            await query.message.reply_text(
                tr('no_products', lang),
                reply_markup=InlineKeyboardMarkup(
                    [[InlineKeyboardButton(tr('menu_back', lang), callback_data='adminmenu:manage')]]
                ),
            )
            return
        keyboard = [
            [InlineKeyboardButton(pid, callback_data=f"editprod:{pid}")]
            for pid in data['products']
        ]
        keyboard.append([
            InlineKeyboardButton(tr('menu_back', lang), callback_data='adminmenu:manage')
        ])
        await query.message.reply_text(
            tr('select_product_edit', lang),
            reply_markup=InlineKeyboardMarkup(keyboard),
        )
    elif action == 'deleteproduct':
        if not data['products']:
            await query.message.reply_text(
                tr('no_products', lang),
                reply_markup=InlineKeyboardMarkup(
                    [[InlineKeyboardButton(tr('menu_back', lang), callback_data='adminmenu:manage')]]
                ),
            )
            return
        keyboard = [[InlineKeyboardButton(pid, callback_data=f'delprod:{pid}')]
                    for pid in data['products']]
        keyboard.append([InlineKeyboardButton(tr('menu_back', lang), callback_data='adminmenu:manage')])
        await query.message.reply_text(
            tr('select_product_delete', lang),
            reply_markup=InlineKeyboardMarkup(keyboard),
        )
    elif action == 'stats':
        if not data['products']:
            await query.message.reply_text(
                tr('no_products', lang),
                reply_markup=InlineKeyboardMarkup(
                    [[InlineKeyboardButton(tr('menu_back', lang), callback_data='adminmenu:manage')]]
                ),
            )
            return
        keyboard = [[InlineKeyboardButton(pid, callback_data=f"adminstats:{pid}")]
                    for pid in data['products']]
        keyboard.append([InlineKeyboardButton(tr('menu_back', lang), callback_data='adminmenu:manage')])
        await query.message.reply_text(
            tr('select_product_stats', lang),
            reply_markup=InlineKeyboardMarkup(keyboard),
        )
    elif action == 'buyers':
        if not data['products']:
            await query.message.reply_text(
                tr('no_products', lang),
                reply_markup=InlineKeyboardMarkup(
                    [[InlineKeyboardButton(tr('menu_back', lang), callback_data='adminmenu:manage')]]
                ),
            )
            return
        keyboard = [[InlineKeyboardButton(pid, callback_data=f"buyerlist:{pid}")]
                    for pid in data['products']]
        keyboard.append([InlineKeyboardButton(tr('menu_back', lang), callback_data='adminmenu:manage')])
        await query.message.reply_text(
            tr('select_product_buyers', lang),
            reply_markup=InlineKeyboardMarkup(keyboard),
        )
    elif action == 'clearbuyers':
        if not data['products']:
            await query.message.reply_text(
                tr('no_products', lang),
                reply_markup=InlineKeyboardMarkup(
                    [[InlineKeyboardButton(tr('menu_back', lang), callback_data='adminmenu:manage')]]
                ),
            )
            return
        keyboard = [[InlineKeyboardButton(pid, callback_data=f"adminclearbuyers:{pid}")]
                    for pid in data['products']]
        keyboard.append([InlineKeyboardButton(tr('menu_back', lang), callback_data='adminmenu:manage')])
        await query.message.reply_text(
            tr('select_product_clearbuyers', lang),
            reply_markup=InlineKeyboardMarkup(keyboard),
        )
    elif action == 'resend':
        if not data['products']:
            await query.message.reply_text(
                tr('no_products', lang),
                reply_markup=InlineKeyboardMarkup(
                    [[InlineKeyboardButton(tr('menu_back', lang), callback_data='adminmenu:manage')]]
                ),
            )
            return
        keyboard = [[InlineKeyboardButton(pid, callback_data=f"adminresend:{pid}")]
                    for pid in data['products']]
        keyboard.append([InlineKeyboardButton(tr('menu_back', lang), callback_data='adminmenu:manage')])
        await query.message.reply_text(
            tr('select_product_buyers', lang),
            reply_markup=InlineKeyboardMarkup(keyboard),
        )


@log_command
async def editprod_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show field selection buttons for editing a product."""
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data['lang']
    query = update.callback_query
    await query.answer()
    pid = query.data.split(':')[1]
    buttons = [
        [InlineKeyboardButton('price', callback_data=f'editfield:{pid}:price')],
        [InlineKeyboardButton('username', callback_data=f'editfield:{pid}:username')],
        [InlineKeyboardButton('password', callback_data=f'editfield:{pid}:password')],
        [InlineKeyboardButton('secret', callback_data=f'editfield:{pid}:secret')],
        [InlineKeyboardButton('name', callback_data=f'editfield:{pid}:name')],
    ]
    await query.message.reply_text(
        tr('select_field_edit', lang),
        reply_markup=InlineKeyboardMarkup(buttons),
    )


@log_command
async def editfield_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Prompt admin to send new value for the selected field."""
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data['lang']
    query = update.callback_query
    await query.answer()
    try:
        _, pid, field = query.data.split(':', 2)
    except ValueError:
        return
    context.user_data['edit_pid'] = pid
    context.user_data['edit_field'] = field
    await query.message.reply_text(tr('enter_new_value', lang))


@log_command
async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data['lang']
    pid = context.user_data.get('buy_pid')
    if not pid:
        return
    photo = update.message.photo[-1]
    file_id = photo.file_id
    data['pending'].append({'user_id': update.message.from_user.id, 'product_id': pid, 'file_id': file_id})
    # Remove the pid after recording the pending payment so later photos aren't
    # mistakenly associated with this purchase.
    context.user_data.pop('buy_pid', None)
    await storage.save(data)
    await update.message.reply_text(tr('payment_submitted', lang))
    await context.bot.send_photo(ADMIN_ID, file_id, caption=f"/approve {update.message.from_user.id} {pid}")


@log_command
@admin_required
async def handle_edit_value(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Update product field when awaiting new value from admin."""
    lang = context.user_data['lang']
    pid = context.user_data.get('edit_pid')
    field = context.user_data.get('edit_field')
    if not pid or not field:
        return
    value = update.message.text
    product = data['products'].get(pid)
    if product is not None:
        product[field] = value
        await storage.save(data)
        await update.message.reply_text(tr('product_updated', lang))
    else:
        await update.message.reply_text(tr('product_not_found', lang))
    context.user_data.pop('edit_pid', None)
    context.user_data.pop('edit_field', None)


@log_command
async def stats_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show product statistics from inline menu."""
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data['lang']
    query = update.callback_query
    await query.answer()
    pid = query.data.split(':')[1]
    product = data['products'].get(pid)
    if not product:
        await query.message.reply_text(tr('product_not_found', lang))
        return
    buyers = product.get('buyers', [])
    text = "\n".join(
        [
            tr('price_line', lang).format(price=product.get('price')),
            tr('total_buyers_line', lang).format(count=len(buyers)),
        ]
    )
    await query.message.reply_text(text)


@log_command
async def buyerlist_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """List buyers with delete buttons."""
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data['lang']
    query = update.callback_query
    await query.answer()
    pid = query.data.split(':')[1]
    product = data['products'].get(pid)
    if not product:
        await query.message.reply_text(tr('product_not_found', lang))
        return
    buyers = product.get('buyers', [])
    if not buyers:
        await query.message.reply_text(tr('no_buyers', lang))
        return
    for uid in buyers:
        buttons = [
            InlineKeyboardButton(
                tr('delete_button', lang),
                callback_data=f'admin:deletebuyer:{pid}:{uid}',
            )
        ]
        await query.message.reply_text(str(uid), reply_markup=InlineKeyboardMarkup([buttons]))


@log_command
async def clearbuyers_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Remove all buyers of a product via inline menu."""
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data['lang']
    query = update.callback_query
    await query.answer()
    pid = query.data.split(':')[1]
    product = data['products'].get(pid)
    if not product:
        await query.message.reply_text(tr('product_not_found', lang))
        return
    product['buyers'] = []
    await storage.save(data)
    await query.message.reply_text(tr('all_buyers_removed', lang))


@log_command
async def resend_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle resend inline actions."""
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data['lang']
    query = update.callback_query
    await query.answer()
    parts = query.data.split(':')
    if len(parts) == 2:
        # List buyers for the selected product
        pid = parts[1]
        product = data['products'].get(pid)
        if not product:
            await query.message.reply_text(tr('product_not_found', lang))
            return
        buyers = product.get('buyers', [])
        if not buyers:
            await query.message.reply_text(tr('no_buyers', lang))
            return
        for uid in buyers:
            button = [
                InlineKeyboardButton(
                    tr('resend_button', lang),
                    callback_data=f'adminresend:{pid}:{uid}',
                )
            ]
            await query.message.reply_text(
                str(uid), reply_markup=InlineKeyboardMarkup([button])
            )
        return
    try:
        _, pid, uid_str = parts
        uid = int(uid_str)
    except (ValueError, IndexError):
        return
    product = data['products'].get(pid)
    if not product:
        await query.message.reply_text(tr('product_not_found', lang))
        return
    if uid not in product.get('buyers', []):
        await query.message.reply_text(tr('buyer_not_found', lang))
        return
    msg = tr('credentials_msg', lang).format(
        username=product.get('username'),
        password=product.get('password'),
    )
    await context.bot.send_message(uid, msg)
    await context.bot.send_message(
        uid,
        tr('use_code_button', lang),
        reply_markup=code_keyboard(pid, lang),
    )
    await query.message.reply_text(tr('credentials_resent', lang))


@log_command
async def deleteprod_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle product deletion via inline buttons."""
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data['lang']
    query = update.callback_query
    await query.answer()
    parts = query.data.split(':')
    pid = parts[1]
    if len(parts) == 2:
        # Ask for confirmation
        if pid not in data['products']:
            await query.message.reply_text(tr('product_not_found', lang))
            return
        buttons = [
            [InlineKeyboardButton(tr('delete_button', lang), callback_data=f'delprod:{pid}:confirm')],
            [InlineKeyboardButton(tr('menu_back', lang), callback_data='adminmenu:deleteproduct')],
        ]
        await query.message.reply_text(
            tr('confirm_delete', lang).format(pid=pid),
            reply_markup=InlineKeyboardMarkup(buttons),
        )
        return
    if len(parts) == 3 and parts[2] == 'confirm':
        if pid in data['products']:
            del data['products'][pid]
            await storage.save(data)
            await query.message.reply_text(tr('product_deleted', lang))
        else:
            await query.message.reply_text(tr('product_not_found', lang))
        return


@log_command
@admin_required
async def admin_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle admin inline actions like listing and approving pending purchases."""
    lang = context.user_data['lang']
    query = update.callback_query
    await query.answer()
    parts = query.data.split(':')
    action = parts[1]
    if action == 'pending':
        if not data['pending']:
            await query.message.reply_text(tr('no_pending', lang))
            return
        for p in data['pending']:
            text = tr('pending_entry', lang).format(user_id=p['user_id'], product_id=p['product_id'])
            buttons = [
                InlineKeyboardButton(
                    tr('approve_button', lang),
                    callback_data=f"admin:approve:{p['user_id']}:{p['product_id']}"
                ),
                InlineKeyboardButton(
                    tr('reject_button', lang),
                    callback_data=f"admin:reject:{p['user_id']}:{p['product_id']}"
                ),
            ]
            await query.message.reply_text(text, reply_markup=InlineKeyboardMarkup([buttons]))
    elif action in {'approve', 'reject'}:
        try:
            user_id = int(parts[2])
            pid = parts[3]
        except (IndexError, ValueError):
            return
        for p in data['pending']:
            if p['user_id'] == user_id and p['product_id'] == pid:
                data['pending'].remove(p)
                if action == 'approve':
                    buyers = data['products'].setdefault(pid, {}).setdefault('buyers', [])
                    if user_id not in buyers:
                        buyers.append(user_id)
                    await storage.save(data)
                    creds = data['products'][pid]
                    msg = tr('credentials_msg', lang).format(username=creds.get('username'), password=creds.get('password'))
                    await context.bot.send_message(user_id, msg)
                    await context.bot.send_message(
                        user_id,
                        tr('use_code_button', lang),
                        reply_markup=code_keyboard(pid, lang),
                    )
                    await query.message.reply_text(tr('approved', lang))
                else:
                    await storage.save(data)
                    await query.message.reply_text(tr('rejected', lang))
                return
        await query.message.reply_text(tr('pending_not_found', lang))
    elif action == 'deletebuyer':
        try:
            pid = parts[2]
            uid = int(parts[3])
        except (IndexError, ValueError):
            return
        product = data['products'].get(pid)
        if not product:
            await query.message.reply_text(tr('product_not_found', lang))
            return
        if uid in product.get('buyers', []):
            product['buyers'].remove(uid)
            await storage.save(data)
            await query.message.reply_text(tr('buyer_removed', lang))
        else:
            await query.message.reply_text(tr('buyer_not_found', lang))


@log_command
@admin_required
async def approve(update: Update, context: ContextTypes.DEFAULT_TYPE):
    lang = context.user_data['lang']
    try:
        user_id = int(context.args[0])
        pid = context.args[1]
    except (IndexError, ValueError):
        await update.message.reply_text(tr('approve_usage', lang))
        return
    for p in data['pending']:
        if p['user_id'] == user_id and p['product_id'] == pid:
            data['pending'].remove(p)
            buyers = data['products'].setdefault(pid, {}).setdefault('buyers', [])
            if user_id not in buyers:
                buyers.append(user_id)
            await storage.save(data)
            creds = data['products'][pid]
            msg = tr('credentials_msg', lang).format(
                username=creds.get('username'),
                password=creds.get('password'),
            )
            await context.bot.send_message(user_id, msg)
            await context.bot.send_message(
                user_id,
                tr('use_code_button', lang),
                reply_markup=code_keyboard(pid, lang),
            )
            await update.message.reply_text(tr('approved', lang))
            return
    await update.message.reply_text(tr('pending_not_found', lang))


@log_command
async def code(update: Update, context: ContextTypes.DEFAULT_TYPE):
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data['lang']
    try:
        pid = context.args[0]
    except IndexError:
        await update.message.reply_text(tr('code_usage', lang))
        return
    product = data['products'].get(pid)
    if not product:
        await update.message.reply_text(tr('product_not_found', lang))
        return
    if update.message.from_user.id not in product.get('buyers', []):
        await update.message.reply_text(tr('not_purchased', lang))
        return
    secret = product.get('secret')
    if not secret:
        await update.message.reply_text(tr('no_secret', lang))
        return
    totp = pyotp.TOTP(secret)
    await update.message.reply_text(tr('code_msg', lang).format(code=totp.now()))


@log_command
@admin_required
async def addproduct(update: Update, context: ContextTypes.DEFAULT_TYPE):
    lang = context.user_data['lang']
    if not context.args:
        await update.message.reply_text(tr('ask_product_id', lang))
        return
    try:
        pid = context.args[0]
        price = context.args[1]
        username = context.args[2]
        password = context.args[3]
        secret = context.args[4]
    except IndexError:
        await update.message.reply_text(tr('addproduct_usage', lang))
        return
    name = " ".join(context.args[5:]) if len(context.args) > 5 else None
    if pid in data['products']:
        await update.message.reply_text(tr('product_exists', lang))
        return
    data['products'][pid] = {
        'price': price,
        'username': username,
        'password': password,
        'secret': secret,
        'buyers': []
    }
    if name:
        data['products'][pid]['name'] = name
    await storage.save(data)
    await update.message.reply_text(tr('product_added', lang))


@log_command
@admin_required
async def editproduct(update: Update, context: ContextTypes.DEFAULT_TYPE):
    lang = context.user_data['lang']
    try:
        pid = context.args[0]
        field = context.args[1]
        value = " ".join(context.args[2:])
    except IndexError:
        await update.message.reply_text(tr('editproduct_usage', lang))
        return
    product = data['products'].get(pid)
    if not product:
        await update.message.reply_text(tr('product_not_found', lang))
        return
    if field not in {'price', 'username', 'password', 'secret', 'name'}:
        await update.message.reply_text(tr('invalid_field', lang))
        return
    product[field] = value
    await storage.save(data)
    await update.message.reply_text(tr('product_updated', lang))


@log_command
@admin_required
async def deleteproduct(update: Update, context: ContextTypes.DEFAULT_TYPE):
    lang = context.user_data['lang']
    try:
        pid = context.args[0]
    except IndexError:
        await update.message.reply_text(tr('deleteproduct_usage', lang))
        return
    if pid in data["products"]:
        del data["products"][pid]
        await storage.save(data)
        await update.message.reply_text(tr('product_deleted', lang))
    else:
        await update.message.reply_text(tr('product_not_found', lang))


@log_command
@admin_required
async def resend(update: Update, context: ContextTypes.DEFAULT_TYPE):
    lang = context.user_data['lang']
    try:
        pid = context.args[0]
    except IndexError:
        await update.message.reply_text(tr('resend_usage', lang))
        return
    product = data['products'].get(pid)
    if not product:
        await update.message.reply_text(tr('product_not_found', lang))
        return
    buyers = product.get('buyers', [])
    if len(context.args) > 1:
        try:
            uid = int(context.args[1])
        except ValueError:
            await update.message.reply_text(tr('invalid_user_id', lang))
            return
        buyers = [uid] if uid in buyers else []
    if not buyers:
        await update.message.reply_text(tr('no_buyers_send', lang))
        return
    msg = tr('credentials_msg', lang).format(
        username=product.get('username'),
        password=product.get('password'),
    )
    for uid in buyers:
        await context.bot.send_message(uid, msg)
        await context.bot.send_message(
            uid,
            tr('use_code_button', lang),
            reply_markup=code_keyboard(pid, lang),
        )
    await update.message.reply_text(tr('credentials_resent', lang))


@log_command
@admin_required
async def stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    lang = context.user_data['lang']
    try:
        pid = context.args[0]
    except IndexError:
        await update.message.reply_text(tr('stats_usage', lang))
        return
    product = data['products'].get(pid)
    if not product:
        await update.message.reply_text(tr('product_not_found', lang))
        return
    buyers = product.get('buyers', [])
    text = "\n".join(
        [
            tr('price_line', lang).format(price=product.get('price')),
            tr('total_buyers_line', lang).format(count=len(buyers)),
        ]
    )
    await update.message.reply_text(text)


@log_command
@admin_required
async def pending(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """List all pending purchases for the admin."""
    lang = context.user_data['lang']
    if not data['pending']:
        await update.message.reply_text(tr('no_pending', lang))
        return
    lines = [
        tr('pending_entry', lang).format(
            user_id=p['user_id'],
            product_id=p['product_id'],
        )
        for p in data['pending']
    ]
    await update.message.reply_text('\n'.join(lines))


@log_command
@admin_required
async def reject(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Reject a pending purchase without approving it."""
    lang = context.user_data['lang']
    try:
        user_id = int(context.args[0])
        pid = context.args[1]
    except (IndexError, ValueError):
        await update.message.reply_text(tr('reject_usage', lang))
        return
    for p in data['pending']:
        if p['user_id'] == user_id and p['product_id'] == pid:
            data['pending'].remove(p)
            await storage.save(data)
            await update.message.reply_text(tr('rejected', lang))
            return
    await update.message.reply_text(tr('pending_not_found', lang))


@log_command
@admin_required
async def buyers(update: Update, context: ContextTypes.DEFAULT_TYPE):
    lang = context.user_data['lang']
    try:
        pid = context.args[0]
    except IndexError:
        await update.message.reply_text(tr('buyers_usage', lang))
        return
    product = data['products'].get(pid)
    if not product:
        await update.message.reply_text(tr('product_not_found', lang))
        return
    buyers_list = product.get('buyers', [])
    if buyers_list:
        await update.message.reply_text(tr('buyers_list', lang).format(list=', '.join(map(str, buyers_list))))
    else:
        await update.message.reply_text(tr('no_buyers', lang))


@log_command
@admin_required
async def deletebuyer(update: Update, context: ContextTypes.DEFAULT_TYPE):
    lang = context.user_data['lang']
    try:
        pid = context.args[0]
        uid = int(context.args[1])
    except (IndexError, ValueError):
        await update.message.reply_text(tr('deletebuyer_usage', lang))
        return
    product = data['products'].get(pid)
    if not product:
        await update.message.reply_text(tr('product_not_found', lang))
        return
    if uid in product.get('buyers', []):
        product['buyers'].remove(uid)
        await storage.save(data)
        await update.message.reply_text(tr('buyer_removed', lang))
    else:
        await update.message.reply_text(tr('buyer_not_found', lang))


@log_command
@admin_required
async def clearbuyers(update: Update, context: ContextTypes.DEFAULT_TYPE):
    lang = context.user_data['lang']
    try:
        pid = context.args[0]
    except IndexError:
        await update.message.reply_text(tr('clearbuyers_usage', lang))
        return
    product = data['products'].get(pid)
    if not product:
        await update.message.reply_text(tr('product_not_found', lang))
        return
    product['buyers'] = []
    await storage.save(data)
    await update.message.reply_text(tr('all_buyers_removed', lang))


@log_command
async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Display available commands for users and admins."""
    ensure_lang(context, update.effective_user.id)
    lang = context.user_data['lang']
    user_cmds = [
        tr('help_user_start', lang),
        tr('help_user_products', lang),
        tr('help_user_code', lang),
        tr('help_user_contact', lang),
        tr('help_user_setlang', lang),
        tr('help_user_help', lang),
    ]
    admin_cmds = [
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
    ]
    text = tr('help_user_header', lang) + '\n' + '\n'.join(user_cmds)
    text += '\n\n' + tr('help_admin_header', lang) + '\n' + '\n'.join(admin_cmds)
    await update.message.reply_text(text)


@log_command
async def unknown(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Reply to unrecognized commands."""
    ensure_lang(context, update.effective_user.id)
    await update.message.reply_text('/help')


async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Log unexpected errors with context information."""
    user_id = None
    command = None
    if isinstance(update, Update):
        if update.effective_user:
            user_id = update.effective_user.id
        if update.message:
            command = update.message.text
        elif update.callback_query:
            command = update.callback_query.data
    logger.error(
        "Unhandled exception for user %s command %s",
        user_id,
        command,
        exc_info=context.error,
    )


def get_bot_token(token: str | None) -> str:
    """Return the bot token from argument or ``BOT_TOKEN`` env var."""
    token = token or os.environ.get("BOT_TOKEN")
    if not token:
        raise SystemExit(
            "Bot token missing. Pass it as an argument or set BOT_TOKEN environment variable"
        )
    return token


def main(token: str | None = None):
    token = get_bot_token(token)
    app = Application.builder().token(token).build()
    import bot_conversations

    app.add_handler(CommandHandler('start', start))
    app.add_handler(CommandHandler('contact', contact))
    app.add_handler(CommandHandler('products', products))
    app.add_handler(CommandHandler('setlang', setlang))
    app.add_handler(CallbackQueryHandler(language_menu_callback, pattern=r'^(menu:language$|language:)'))
    app.add_handler(CallbackQueryHandler(resend_callback, pattern=r'^adminresend:'))
    app.add_handler(CallbackQueryHandler(menu_callback, pattern=r'^menu:(?!language$)'))
    app.add_handler(CallbackQueryHandler(buy_callback, pattern=r'^buy:'))
    app.add_handler(CallbackQueryHandler(code_callback, pattern=r'^code:'))
    addproduct_conv = ConversationHandler(
        entry_points=[
            CallbackQueryHandler(
                bot_conversations.addproduct_menu, pattern=r'^adminmenu:addproduct$'
            ),
            CommandHandler('addproduct', bot_conversations.addproduct_menu, has_args=False),
        ],
        states={
            bot_conversations.ASK_ID: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, bot_conversations.addproduct_id)
            ],
            bot_conversations.ASK_PRICE: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, bot_conversations.addproduct_price)
            ],
            bot_conversations.ASK_USERNAME: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, bot_conversations.addproduct_username)
            ],
            bot_conversations.ASK_PASSWORD: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, bot_conversations.addproduct_password)
            ],
            bot_conversations.ASK_SECRET: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, bot_conversations.addproduct_secret)
            ],
            bot_conversations.ASK_NAME: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, bot_conversations.addproduct_name)
            ],
        },
        fallbacks=[
            MessageHandler(filters.Regex(f'^{bot_conversations.CANCEL_TEXT}$'), bot_conversations.addproduct_cancel)
        ],
    )
    app.add_handler(addproduct_conv)
    app.add_handler(CallbackQueryHandler(admin_menu_callback, pattern=r'^adminmenu:'))
    app.add_handler(CallbackQueryHandler(stats_callback, pattern=r'^adminstats:'))
    app.add_handler(CallbackQueryHandler(buyerlist_callback, pattern=r'^buyerlist:'))
    app.add_handler(CallbackQueryHandler(clearbuyers_callback, pattern=r'^adminclearbuyers:'))
    app.add_handler(CallbackQueryHandler(deleteprod_callback, pattern=r'^delprod:'))
    app.add_handler(CallbackQueryHandler(admin_callback, pattern=r'^admin:'))
    app.add_handler(CallbackQueryHandler(editprod_callback, pattern=r'^editprod:'))
    app.add_handler(CallbackQueryHandler(editfield_callback, pattern=r'^editfield:'))
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    app.add_handler(CommandHandler('approve', approve))
    app.add_handler(CommandHandler('reject', reject))
    app.add_handler(CommandHandler('pending', pending))
    app.add_handler(CommandHandler('code', code))
    app.add_handler(CommandHandler('addproduct', addproduct))
    app.add_handler(CommandHandler('editproduct', editproduct))
    app.add_handler(CommandHandler('deleteproduct', deleteproduct))
    app.add_handler(CommandHandler('buyers', buyers))
    app.add_handler(CommandHandler('deletebuyer', deletebuyer))
    app.add_handler(CommandHandler('clearbuyers', clearbuyers))
    app.add_handler(CommandHandler('resend', resend))
    app.add_handler(CommandHandler('stats', stats))
    app.add_handler(CommandHandler('help', help_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_edit_value))
    app.add_handler(MessageHandler(filters.COMMAND, unknown))

    app.add_error_handler(error_handler)

    app.run_polling()


if __name__ == '__main__':
    token_arg = sys.argv[1] if len(sys.argv) > 1 else None
    main(token_arg)
