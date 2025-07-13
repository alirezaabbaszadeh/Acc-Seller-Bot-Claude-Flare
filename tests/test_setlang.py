import sys
from pathlib import Path
import types
import asyncio
import os
import pytest

pytest.importorskip("telegram")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bot import setlang, data  # noqa: E402
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


def test_setlang_valid():
    data['languages'] = {}
    update = DummyUpdate(42)
    context = DummyContext(['fa'])
    asyncio.run(setlang(update, context))
    assert context.user_data['lang'] == 'fa'
    assert data['languages']['42'] == 'fa'
    assert update.replies == [tr('language_set', 'fa')]


def test_setlang_invalid():
    data['languages'] = {}
    update = DummyUpdate(42)
    context = DummyContext(['zz'])
    asyncio.run(setlang(update, context))
    assert context.user_data['lang'] == 'en'
    assert '42' not in data['languages']
    assert update.replies == [tr('unsupported_language', 'en')]
