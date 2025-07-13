import sys
from pathlib import Path
import types
import asyncio
import os
import pytest

pytest.importorskip("telegram")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bot import approve, deleteproduct, resend, unknown, data, ADMIN_ID  # noqa: E402


class DummyBot:
    def __init__(self):
        self.sent = []

    async def send_message(self, uid, text, *args, **kwargs):
        self.sent.append((uid, text))


class DummyUpdate:
    def __init__(self, user_id, text="/cmd"):
        self.message = types.SimpleNamespace(
            from_user=types.SimpleNamespace(id=user_id),
            reply_text=self._reply,
            text=text,
        )
        self.effective_user = self.message.from_user
        self.replies = []

    async def _reply(self, text):
        self.replies.append(text)


class DummyContext:
    def __init__(self, args):
        self.args = args
        self.user_data = {}
        self.bot = DummyBot()


def test_approve_moves_pending():
    data['pending'] = [{'user_id': 2, 'product_id': 'p1', 'file_id': 'f'}]
    data['products'] = {'p1': {'price': '1', 'username': 'u', 'password': 'p', 'secret': 's', 'buyers': []}}
    update = DummyUpdate(ADMIN_ID)
    context = DummyContext(['2', 'p1'])
    asyncio.run(approve(update, context))
    assert data['pending'] == []
    assert 2 in data['products']['p1']['buyers']
    assert len(context.bot.sent) == 2


def test_deleteproduct_removes_entry():
    data['products'] = {'p1': {'price': '1', 'username': 'u', 'password': 'p', 'secret': 's'}}
    update = DummyUpdate(ADMIN_ID)
    context = DummyContext(['p1'])
    asyncio.run(deleteproduct(update, context))
    assert 'p1' not in data['products']


def test_resend_sends_credentials():
    data['products'] = {'p1': {'price': '1', 'username': 'u', 'password': 'p', 'secret': 's', 'buyers': [2]}}
    update = DummyUpdate(ADMIN_ID)
    context = DummyContext(['p1'])
    asyncio.run(resend(update, context))
    assert len(context.bot.sent) == 2
    assert context.bot.sent[0][0] == 2


def test_unknown_replies_help():
    update = DummyUpdate(5, text="/doesnotexist")
    context = DummyContext([])
    asyncio.run(unknown(update, context))
    assert update.replies == ['/help']


@pytest.mark.parametrize(
    "cmd,args",
    [
        (approve, ['2', 'p1']),
        (deleteproduct, ['p1']),
        (resend, ['p1']),
    ],
)
def test_non_admin_gets_unauthorized(cmd, args):
    data.setdefault('products', {'p1': {'price': '1', 'username': 'u', 'password': 'p', 'secret': 's', 'buyers': [2]}})
    update = DummyUpdate(5)
    context = DummyContext(args)
    asyncio.run(cmd(update, context))
    assert update.replies == ['Unauthorized']
