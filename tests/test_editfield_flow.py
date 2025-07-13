import sys
from pathlib import Path
import types
import asyncio
import os
import pytest

pytest.importorskip("telegram")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # noqa: E402
from bot import (  # noqa: E402
    editfield_callback,
    handle_edit_value,
    data,
    ADMIN_ID,
)
from botlib.translations import tr  # noqa: E402


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


class DummyTextUpdate:
    def __init__(self, user_id, text):
        self.replies = []

        async def reply(text, reply_markup=None):
            self.replies.append(text)

        self.message = types.SimpleNamespace(
            from_user=types.SimpleNamespace(id=user_id),
            reply_text=reply,
            text=text,
        )
        self.effective_user = self.message.from_user


def test_editfield_flow_updates_product():
    data['products'] = {'p1': {'price': '1'}}
    update = DummyCallbackUpdate(ADMIN_ID, 'editfield:p1:price')
    context = DummyContext()
    asyncio.run(editfield_callback(update, context))
    assert context.user_data['edit_pid'] == 'p1'
    assert context.user_data['edit_field'] == 'price'
    lang = 'en'
    assert update.replies[0][0] == tr('enter_new_value', lang)

    msg_update = DummyTextUpdate(ADMIN_ID, '2')
    asyncio.run(handle_edit_value(msg_update, context))
    assert data['products']['p1']['price'] == '2'
    assert msg_update.replies[0] == tr('product_updated', lang)
    assert 'edit_pid' not in context.user_data
