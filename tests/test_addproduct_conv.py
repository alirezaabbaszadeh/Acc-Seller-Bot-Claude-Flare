import sys
from pathlib import Path
import types
import asyncio
import os
import pytest
from bot_conversations import (
    addproduct_menu,
    addproduct_cancel,
    addproduct_id,
    addproduct_price,
    addproduct_username,
    addproduct_password,
    addproduct_secret,
    ASK_ID,
    ASK_PRICE,
    ASK_USERNAME,
    ASK_PASSWORD,
    ASK_SECRET,
)
from bot import ADMIN_ID
from botlib.translations import tr
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


def test_back_button_cancels_and_clears():
    context = DummyContext()
    update = DummyUpdate(ADMIN_ID)

    state = asyncio.run(addproduct_menu(update, context))
    assert state == ASK_ID

    lang = context.user_data["lang"]
    update.message.text = tr("back_button", lang)
    state = asyncio.run(addproduct_cancel(update, context))

    assert state == ConversationHandler.END
    assert "new_product" not in context.user_data
    assert update.replies[-1] == tr("operation_cancelled", lang)


@pytest.mark.parametrize(
    "step,handler",
    [
        (ASK_PRICE, addproduct_price),
        (ASK_USERNAME, addproduct_username),
        (ASK_PASSWORD, addproduct_password),
        (ASK_SECRET, addproduct_secret),
    ],
)
def test_back_button_cancels_midway(step, handler):
    context = DummyContext()
    update = DummyUpdate(ADMIN_ID)

    state = asyncio.run(addproduct_menu(update, context))
    assert state == ASK_ID

    lang = context.user_data["lang"]

    update.message.text = "p1"
    state = asyncio.run(addproduct_id(update, context))
    assert state == ASK_PRICE

    if step == ASK_PRICE:
        update.message.text = tr("back_button", lang)
        state = asyncio.run(addproduct_price(update, context))
    else:
        update.message.text = "1"
        state = asyncio.run(addproduct_price(update, context))
        assert state == ASK_USERNAME
        if step == ASK_USERNAME:
            update.message.text = tr("back_button", lang)
            state = asyncio.run(addproduct_username(update, context))
        else:
            update.message.text = "u"
            state = asyncio.run(addproduct_username(update, context))
            assert state == ASK_PASSWORD
            if step == ASK_PASSWORD:
                update.message.text = tr("back_button", lang)
                state = asyncio.run(addproduct_password(update, context))
            else:
                update.message.text = "p"
                state = asyncio.run(addproduct_password(update, context))
                assert state == ASK_SECRET
                assert step == ASK_SECRET
                update.message.text = tr("back_button", lang)
                state = asyncio.run(addproduct_secret(update, context))

    assert state == ConversationHandler.END
    assert "new_product" not in context.user_data
    assert update.replies[-1] == tr("operation_cancelled", lang)
