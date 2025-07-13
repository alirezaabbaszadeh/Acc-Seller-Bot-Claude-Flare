import asyncio
import os
import types
from pathlib import Path
import sys
import pytest



pytest.importorskip("telegram")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # noqa: E402
from bot import ADMIN_ID  # noqa: E402
from bot_conversations import addproduct_menu, ASK_ID  # noqa: E402


class DummyMessageUpdate:
    def __init__(self, user_id):
        async def reply(text, reply_markup=None):
            self.replies.append(text)

        self.message = types.SimpleNamespace(
            from_user=types.SimpleNamespace(id=user_id),
            reply_text=reply,
            text="/addproduct",
        )
        self.effective_user = self.message.from_user
        self.replies = []


class DummyCallbackUpdate:
    def __init__(self, user_id):
        self.replies = []

        async def reply(text, reply_markup=None):
            self.replies.append(text)

        async def answer():
            self.answered = True

        self.callback_query = types.SimpleNamespace(
            data="adminmenu:addproduct",
            message=types.SimpleNamespace(reply_text=reply),
            from_user=types.SimpleNamespace(id=user_id),
            answer=answer,
        )
        self.effective_user = self.callback_query.from_user
        self.message = None
        self.answered = False


class DummyContext:
    def __init__(self):
        self.args = []
        self.user_data = {}


def test_command_entrypoint_starts_conversation():
    context = DummyContext()
    update = DummyMessageUpdate(ADMIN_ID)
    state = asyncio.run(addproduct_menu(update, context))
    assert state == ASK_ID
    assert context.user_data["new_product"] == {}


def test_menu_entrypoint_starts_conversation():
    context = DummyContext()
    update = DummyCallbackUpdate(ADMIN_ID)
    state = asyncio.run(addproduct_menu(update, context))
    assert state == ASK_ID
    assert context.user_data["new_product"] == {}
    assert update.answered
