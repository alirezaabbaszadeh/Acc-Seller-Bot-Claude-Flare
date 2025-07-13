import sys
from pathlib import Path
import types
import asyncio
import os
import pytest

pytest.importorskip("telegram")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bot import reject, data, ADMIN_ID  # noqa: E402


class DummyUpdate:
    def __init__(self, user_id):
        self.message = types.SimpleNamespace(
            from_user=types.SimpleNamespace(id=user_id),
            reply_text=self._reply,
        )
        self.effective_user = self.message.from_user
        self.replies = []

    async def _reply(self, text):
        self.replies.append(text)


class DummyContext:
    def __init__(self, args):
        self.args = args
        self.user_data = {}
        self.bot = types.SimpleNamespace()


def test_reject_removes_pending():
    data['pending'] = [{'user_id': 42, 'product_id': 'p1', 'file_id': 'f'}]
    update = DummyUpdate(ADMIN_ID)
    context = DummyContext(['42', 'p1'])
    asyncio.run(reject(update, context))
    assert data['pending'] == []


def test_reject_unauthorized():
    data['pending'] = [{'user_id': 42, 'product_id': 'p1', 'file_id': 'f'}]
    update = DummyUpdate(5)
    context = DummyContext(['42', 'p1'])
    asyncio.run(reject(update, context))
    assert update.replies == ['Unauthorized']
    assert data['pending'] == [{'user_id': 42, 'product_id': 'p1', 'file_id': 'f'}]
