import sys
from pathlib import Path
import types
import asyncio
import os
import pytest

pytest.importorskip("telegram")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bot import addproduct, data, ADMIN_ID  # noqa: E402
from botlib.translations import tr  # noqa: E402


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


def test_addproduct_duplicate_not_overwritten():
    data['products'] = {
        'p1': {
            'price': '1',
            'username': 'u',
            'password': 'p',
            'secret': 's',
            'buyers': []
        }
    }
    update = DummyUpdate(ADMIN_ID)
    context = DummyContext(['p1', '2', 'nu', 'np', 'ns'])
    asyncio.run(addproduct(update, context))
    assert update.replies == [tr('product_exists', 'en')]
    assert data['products']['p1']['price'] == '1'
    assert data['products']['p1']['username'] == 'u'
    assert data['products']['p1']['password'] == 'p'
    assert data['products']['p1']['secret'] == 's'
