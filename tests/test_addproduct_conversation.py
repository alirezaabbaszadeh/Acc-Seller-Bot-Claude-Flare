import sys
from pathlib import Path
import types
import asyncio
import os
import pytest
from bot_conversations import (
    addproduct_menu,
    addproduct_id,
    addproduct_price,
    addproduct_username,
    addproduct_password,
    addproduct_secret,
    addproduct_name,
    addproduct_cancel,
    ASK_ID,
    ASK_PRICE,
    ASK_USERNAME,
    ASK_PASSWORD,
    ASK_SECRET,
    ASK_NAME,
    CANCEL_TEXT,
)
from bot import data, storage, ADMIN_ID
from telegram.ext import ConversationHandler



pytest.importorskip("telegram")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class DummyUpdate:
    def __init__(self, user_id):
        self.message = types.SimpleNamespace(
            from_user=types.SimpleNamespace(id=user_id),
            reply_text=self._reply,
            text="",
        )
        self.effective_user = self.message.from_user
        self.replies = []

    async def _reply(self, text, reply_markup=None):
        self.replies.append(text)


class DummyContext:
    def __init__(self):
        self.args = []
        self.user_data = {}


def test_addproduct_conversation(monkeypatch):
    calls = []

    async def dummy_save(d):
        calls.append(d)

    monkeypatch.setattr(storage, "save", dummy_save)
    data["products"] = {}
    context = DummyContext()
    update = DummyUpdate(ADMIN_ID)

    state = asyncio.run(addproduct_menu(update, context))
    assert state == ASK_ID

    update.message.text = "p1"
    state = asyncio.run(addproduct_id(update, context))
    assert state == ASK_PRICE

    update.message.text = "1"
    state = asyncio.run(addproduct_price(update, context))
    assert state == ASK_USERNAME

    update.message.text = "u"
    state = asyncio.run(addproduct_username(update, context))
    assert state == ASK_PASSWORD

    update.message.text = "p"
    state = asyncio.run(addproduct_password(update, context))
    assert state == ASK_SECRET

    update.message.text = "s"
    state = asyncio.run(addproduct_secret(update, context))
    assert state == ASK_NAME

    update.message.text = "name"
    state = asyncio.run(addproduct_name(update, context))
    assert state == ConversationHandler.END

    assert calls, "storage.save not called"
    prod = data["products"].get("p1")
    assert prod and prod["price"] == "1"
    assert prod["username"] == "u"
    assert prod["password"] == "p"
    assert prod["secret"] == "s"
    assert prod.get("name") == "name"


def test_addproduct_cancel(monkeypatch):
    async def dummy_save(d):
        pass

    monkeypatch.setattr(storage, "save", dummy_save)
    context = DummyContext()
    update = DummyUpdate(ADMIN_ID)

    asyncio.run(addproduct_menu(update, context))
    update.message.text = CANCEL_TEXT
    state = asyncio.run(addproduct_cancel(update, context))
    assert state == ConversationHandler.END
