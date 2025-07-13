import sys
from pathlib import Path
import types
import asyncio
import os
import pytest

pytest.importorskip("telegram")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bot import resend_callback, data, ADMIN_ID  # noqa: E402
from botlib.translations import tr  # noqa: E402


class DummyBot:
    def __init__(self):
        self.sent = []

    async def send_message(self, uid, text, *args, **kwargs):
        self.sent.append((uid, text, kwargs.get("reply_markup")))


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


def test_resend_callback_sends_credentials():
    data["products"] = {
        "p1": {
            "price": "1",
            "username": "u",
            "password": "p",
            "secret": "s",
            "buyers": [2],
        }
    }
    update = DummyCallbackUpdate(ADMIN_ID, "adminresend:p1:2")
    context = DummyContext()
    asyncio.run(resend_callback(update, context))

    # Admin should get confirmation
    assert update.replies[0][0] == tr("credentials_resent", "en")
    # Two messages sent to the buyer
    assert len(context.bot.sent) == 2
    assert context.bot.sent[0][0] == 2
    assert context.bot.sent[1][0] == 2
