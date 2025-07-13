import sys
from pathlib import Path
import types
import asyncio
import os
import pytest
import pyotp


pytest.importorskip("telegram")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bot import resend, code_callback, data, ADMIN_ID  # noqa: E402
from botlib.translations import tr  # noqa: E402


class DummyBot:
    def __init__(self):
        self.sent = []

    async def send_message(self, uid, text, *args, **kwargs):
        self.sent.append((uid, text, kwargs.get("reply_markup")))


class DummyUpdate:
    def __init__(self, user_id):
        self.message = types.SimpleNamespace(
            from_user=types.SimpleNamespace(id=user_id),
            reply_text=self._reply,
            text="/cmd",
        )
        self.effective_user = self.message.from_user
        self.replies = []

    async def _reply(self, text):
        self.replies.append(text)


class DummyContext:
    def __init__(self, args=None):
        self.args = args or []
        self.user_data = {}
        self.bot = DummyBot()


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


def test_code_button_flow(monkeypatch):
    # Prepare product data and buyer
    data["languages"] = {}
    data["products"] = {
        "p1": {
            "price": "1",
            "username": "u",
            "password": "p",
            "secret": "JBSWY3DPEHPK3PXP",
            "buyers": [2],
        }
    }
    # Admin resends credentials
    update = DummyUpdate(ADMIN_ID)
    context = DummyContext(["p1"])
    asyncio.run(resend(update, context))

    # Second sent message should contain code button
    assert len(context.bot.sent) == 2
    _, text, markup = context.bot.sent[1]
    assert text == tr("use_code_button", "en")
    assert markup.inline_keyboard[0][0].callback_data == "code:p1"

    # Simulate pressing the code button
    cb_update = DummyCallbackUpdate(2, "code:p1")
    cb_context = DummyContext()
    monkeypatch.setattr(pyotp.TOTP, "now", lambda self: "123456")
    asyncio.run(code_callback(cb_update, cb_context))
    reply_text, _ = cb_update.replies[0]
    assert reply_text == tr("code_msg", "en").format(code="123456")
