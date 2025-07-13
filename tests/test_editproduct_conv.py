import sys
from pathlib import Path
import types
import asyncio
import os
import pytest

pytest.importorskip("telegram")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # noqa: E402
from bot import (  # noqa: E402
    admin_menu_callback,
    editprod_callback,
    editfield_callback,
    handle_edit_value,
    data,
    storage,
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


class DummyContext:
    def __init__(self):
        self.args = []
        self.user_data = {}
        self.bot = types.SimpleNamespace()


def test_editproduct_conversation_updates_price(monkeypatch):
    calls = []

    async def dummy_save(d):
        calls.append(d)

    monkeypatch.setattr(storage, "save", dummy_save)
    data["products"] = {"p1": {"price": "1"}}
    context = DummyContext()

    update = DummyCallbackUpdate(ADMIN_ID, "adminmenu:editproduct")
    asyncio.run(admin_menu_callback(update, context))

    update = DummyCallbackUpdate(ADMIN_ID, "editprod:p1")
    asyncio.run(editprod_callback(update, context))

    update = DummyCallbackUpdate(ADMIN_ID, "editfield:p1:price")
    asyncio.run(editfield_callback(update, context))
    assert context.user_data["edit_pid"] == "p1"
    assert context.user_data["edit_field"] == "price"

    msg_update = DummyTextUpdate(ADMIN_ID, "2")
    asyncio.run(handle_edit_value(msg_update, context))
    assert data["products"]["p1"]["price"] == "2"
    assert msg_update.replies[0] == tr("product_updated", "en")
    assert calls, "storage.save not called"
    assert "edit_pid" not in context.user_data


def test_editproduct_conversation_unauthorized():
    data["products"] = {"p1": {"price": "1"}}
    context = DummyContext()
    update = DummyCallbackUpdate(42, "adminmenu:editproduct")
    asyncio.run(admin_menu_callback(update, context))
    text, _ = update.replies[0]
    assert text == tr("unauthorized", "en")
