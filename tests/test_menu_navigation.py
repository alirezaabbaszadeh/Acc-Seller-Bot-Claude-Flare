import sys
from pathlib import Path
import types
import asyncio
import os
import pytest


pytest.importorskip("telegram")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # noqa: E402
from bot import (  # noqa: E402
    menu_callback,
    admin_menu_callback,
    language_menu_callback,
    data,
    ADMIN_ID,
)
import bot_conversations  # noqa: E402
from botlib.translations import tr  # noqa: E402


class DummyBot:
    def __init__(self):
        self.sent = []

    async def send_message(self, uid, text, *args, **kwargs):
        self.sent.append((uid, text))


class DummyCallbackUpdate:
    def __init__(self, user_id, data_str):
        self.replies = []

        async def reply(text, reply_markup=None):
            self.replies.append((text, reply_markup))

        async def answer():
            pass

        self.callback_query = types.SimpleNamespace(
            data=data_str,
            message=types.SimpleNamespace(reply_text=reply),
            from_user=types.SimpleNamespace(id=user_id),
            answer=answer,
        )
        self.effective_user = self.callback_query.from_user
        self.message = None


class DummyContext:
    def __init__(self):
        self.args = []
        self.user_data = {}
        self.bot = DummyBot()


def test_products_submenu():
    data['languages'] = {}
    data['products'] = {
        'p1': {'price': '1', 'username': 'u', 'password': 'p', 'secret': 's'}
    }
    update = DummyCallbackUpdate(42, 'menu:products')
    context = DummyContext()
    asyncio.run(menu_callback(update, context))
    # First reply should contain product info with buy button
    text, markup = update.replies[0]
    assert text.startswith('p1: 1')
    assert markup.inline_keyboard[0][0].callback_data == 'buy:p1'
    # Last reply is back button
    back_text, back_markup = update.replies[-1]
    assert back_text == tr('menu_back', 'en')
    assert back_markup.inline_keyboard[0][0].callback_data == 'menu:main'


def test_contact_submenu():
    data['languages'] = {}
    update = DummyCallbackUpdate(42, 'menu:contact')
    context = DummyContext()
    asyncio.run(menu_callback(update, context))
    text, markup = update.replies[0]
    assert text == tr('admin_phone', 'en').format(phone='+111')
    assert markup.inline_keyboard[0][0].callback_data == 'menu:main'


def test_help_submenu():
    data['languages'] = {}
    update = DummyCallbackUpdate(42, 'menu:help')
    context = DummyContext()
    asyncio.run(menu_callback(update, context))
    text, markup = update.replies[0]
    assert tr('help_user_header', 'en') in text
    assert markup.inline_keyboard[0][0].callback_data == 'menu:main'


def test_back_to_main_menu():
    data['languages'] = {}
    update = DummyCallbackUpdate(42, 'menu:main')
    context = DummyContext()
    asyncio.run(menu_callback(update, context))
    text, markup = update.replies[0]
    assert text == tr('welcome', 'en')
    buttons = [btn.text for row in markup.inline_keyboard for btn in row]
    assert tr('menu_products', 'en') in buttons
    assert tr('menu_contact', 'en') in buttons
    assert tr('menu_help', 'en') in buttons
    assert tr('menu_language', 'en') in buttons
    assert tr('menu_admin', 'en') not in buttons


def test_language_menu_buttons():
    data['languages'] = {}
    update = DummyCallbackUpdate(42, 'menu:language')
    context = DummyContext()
    asyncio.run(language_menu_callback(update, context))
    text, markup = update.replies[0]
    assert text == tr('menu_language', 'en')
    callbacks = [btn.callback_data for row in markup.inline_keyboard for btn in row]
    assert 'language:en' in callbacks
    assert 'language:fa' in callbacks
    assert markup.inline_keyboard[-1][0].callback_data == 'menu:main'


def test_language_selection_changes_data():
    data['languages'] = {}
    update = DummyCallbackUpdate(42, 'language:fa')
    context = DummyContext()
    asyncio.run(language_menu_callback(update, context))
    assert context.user_data['lang'] == 'fa'
    assert data['languages']['42'] == 'fa'
    text, markup = update.replies[0]
    assert text == tr('language_set', 'fa')
    buttons = [btn.callback_data for row in markup.inline_keyboard for btn in row]
    assert 'menu:language' in buttons


def test_admin_menu_requires_admin():
    data['languages'] = {}
    update = DummyCallbackUpdate(42, 'menu:admin')
    context = DummyContext()
    asyncio.run(menu_callback(update, context))
    text, markup = update.replies[0]
    assert text == tr('unauthorized', 'en')
    assert markup.inline_keyboard[0][0].callback_data == 'menu:main'


def test_admin_menu_for_admin():
    data['languages'] = {}
    update = DummyCallbackUpdate(ADMIN_ID, 'menu:admin')
    context = DummyContext()
    asyncio.run(menu_callback(update, context))
    text, markup = update.replies[0]
    assert text == tr('menu_admin', 'en')
    buttons = [btn.text for row in markup.inline_keyboard for btn in row]
    assert tr('menu_pending', 'en') in buttons
    assert tr('menu_manage_products', 'en') in buttons
    assert tr('menu_stats', 'en') in buttons


def test_manage_products_submenu():
    data['languages'] = {}
    update = DummyCallbackUpdate(ADMIN_ID, 'adminmenu:manage')
    context = DummyContext()
    asyncio.run(admin_menu_callback(update, context))
    text, markup = update.replies[0]
    assert text == tr('menu_manage_products', 'en')
    callbacks = [btn.callback_data for row in markup.inline_keyboard for btn in row]
    assert 'adminmenu:addproduct' in callbacks
    assert 'adminmenu:editproduct' in callbacks
    assert 'adminmenu:deleteproduct' in callbacks
    assert 'adminmenu:stats' in callbacks
    assert 'adminmenu:buyers' in callbacks
    assert 'adminmenu:clearbuyers' in callbacks
    assert 'adminmenu:resend' in callbacks
    assert markup.inline_keyboard[-1][0].callback_data == 'menu:admin'
    texts = [btn.text for row in markup.inline_keyboard for btn in row]
    assert tr('menu_resend', 'en') in texts


def test_adminmenu_addproduct_starts_conversation():
    data['languages'] = {}
    update = DummyCallbackUpdate(ADMIN_ID, 'adminmenu:addproduct')
    context = DummyContext()
    state = asyncio.run(bot_conversations.addproduct_menu(update, context))
    assert state == bot_conversations.ASK_ID
    text, _ = update.replies[0]
    assert text == tr('ask_product_id', 'en')


def test_adminmenu_editproduct_usage():
    data['languages'] = {}
    data['products'] = {'p1': {'price': '1'}}
    update = DummyCallbackUpdate(ADMIN_ID, 'adminmenu:editproduct')
    context = DummyContext()
    asyncio.run(admin_menu_callback(update, context))
    text, markup = update.replies[0]
    assert text == tr('select_product_edit', 'en')
    callbacks = [btn.callback_data for row in markup.inline_keyboard for btn in row]
    assert callbacks.count('adminmenu:manage') == 1

    back_update = DummyCallbackUpdate(ADMIN_ID, 'adminmenu:manage')
    back_context = DummyContext()
    asyncio.run(admin_menu_callback(back_update, back_context))
    back_text, _ = back_update.replies[0]
    assert back_text == tr('menu_manage_products', 'en')


def test_adminmenu_deleteproduct_buttons():
    data['languages'] = {}
    data['products'] = {'p1': {'price': '1'}}
    update = DummyCallbackUpdate(ADMIN_ID, 'adminmenu:deleteproduct')
    context = DummyContext()
    asyncio.run(admin_menu_callback(update, context))
    text, markup = update.replies[0]
    assert text == tr('select_product_delete', 'en')
    assert markup.inline_keyboard[0][0].callback_data == 'delprod:p1'
    callbacks = [btn.callback_data for row in markup.inline_keyboard for btn in row]
    assert 'adminmenu:manage' in callbacks

    back_update = DummyCallbackUpdate(ADMIN_ID, 'adminmenu:manage')
    back_context = DummyContext()
    asyncio.run(admin_menu_callback(back_update, back_context))
    back_text, _ = back_update.replies[0]
    assert back_text == tr('menu_manage_products', 'en')


def test_adminmenu_stats_usage():
    data['languages'] = {}
    data['products'] = {'p1': {'price': '1'}}
    update = DummyCallbackUpdate(ADMIN_ID, 'adminmenu:stats')
    context = DummyContext()
    asyncio.run(admin_menu_callback(update, context))
    text, markup = update.replies[0]
    assert text == tr('select_product_stats', 'en')
    callbacks = [btn.callback_data for row in markup.inline_keyboard for btn in row]
    assert callbacks.count('adminmenu:manage') == 1

    back_update = DummyCallbackUpdate(ADMIN_ID, 'adminmenu:manage')
    back_context = DummyContext()
    asyncio.run(admin_menu_callback(back_update, back_context))
    back_text, _ = back_update.replies[0]
    assert back_text == tr('menu_manage_products', 'en')


def test_adminmenu_buyers_usage():
    data['languages'] = {}
    data['products'] = {'p1': {'price': '1'}}
    update = DummyCallbackUpdate(ADMIN_ID, 'adminmenu:buyers')
    context = DummyContext()
    asyncio.run(admin_menu_callback(update, context))
    text, markup = update.replies[0]
    assert text == tr('select_product_buyers', 'en')
    callbacks = [btn.callback_data for row in markup.inline_keyboard for btn in row]
    assert callbacks.count('adminmenu:manage') == 1
    assert markup.inline_keyboard[0][0].callback_data == 'buyerlist:p1'

    back_update = DummyCallbackUpdate(ADMIN_ID, 'adminmenu:manage')
    back_context = DummyContext()
    asyncio.run(admin_menu_callback(back_update, back_context))
    back_text, _ = back_update.replies[0]
    assert back_text == tr('menu_manage_products', 'en')


def test_adminmenu_clearbuyers_usage():
    data['languages'] = {}
    data['products'] = {'p1': {'price': '1'}}
    update = DummyCallbackUpdate(ADMIN_ID, 'adminmenu:clearbuyers')
    context = DummyContext()
    asyncio.run(admin_menu_callback(update, context))
    text, markup = update.replies[0]
    assert text == tr('select_product_clearbuyers', 'en')
    callbacks = [btn.callback_data for row in markup.inline_keyboard for btn in row]
    assert callbacks.count('adminmenu:manage') == 1

    back_update = DummyCallbackUpdate(ADMIN_ID, 'adminmenu:manage')
    back_context = DummyContext()
    asyncio.run(admin_menu_callback(back_update, back_context))
    back_text, _ = back_update.replies[0]
    assert back_text == tr('menu_manage_products', 'en')


def test_adminmenu_resend_usage():
    data['languages'] = {}
    data['products'] = {'p1': {'price': '1'}}
    update = DummyCallbackUpdate(ADMIN_ID, 'adminmenu:resend')
    context = DummyContext()
    asyncio.run(admin_menu_callback(update, context))
    text, markup = update.replies[0]
    assert text == tr('select_product_buyers', 'en')
    callbacks = [btn.callback_data for row in markup.inline_keyboard for btn in row]
    assert callbacks.count('adminmenu:manage') == 1
    assert markup.inline_keyboard[0][0].callback_data == 'adminresend:p1'

    back_update = DummyCallbackUpdate(ADMIN_ID, 'adminmenu:manage')
    back_context = DummyContext()
    asyncio.run(admin_menu_callback(back_update, back_context))
    back_text, _ = back_update.replies[0]
    assert back_text == tr('menu_manage_products', 'en')


def test_adminmenu_resend_requires_admin():
    data['languages'] = {}
    update = DummyCallbackUpdate(42, 'adminmenu:resend')
    context = DummyContext()
    asyncio.run(admin_menu_callback(update, context))
    text, _ = update.replies[0]
    assert text == tr('unauthorized', 'en')


def test_adminmenu_deleteproduct_requires_admin():
    data['languages'] = {}
    update = DummyCallbackUpdate(42, 'adminmenu:deleteproduct')
    context = DummyContext()
    asyncio.run(admin_menu_callback(update, context))
    text, _ = update.replies[0]
    assert text == tr('unauthorized', 'en')


def test_language_menu_invalid_selection():
    data['languages'] = {}
    update = DummyCallbackUpdate(42, 'language:zz')
    context = DummyContext()
    asyncio.run(language_menu_callback(update, context))
    assert context.user_data['lang'] == 'en'
    assert '42' not in data.get('languages', {})
    assert update.replies == []
