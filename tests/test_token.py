import sys
from pathlib import Path
import pytest
import types
import importlib.util

import os

if importlib.util.find_spec("telegram") is None:
    telegram = types.ModuleType("telegram")
    dummy = type("_Dummy", (), {})
    telegram.Update = dummy
    telegram.InlineKeyboardButton = dummy
    telegram.InlineKeyboardMarkup = dummy
    ext = types.ModuleType("telegram.ext")
    ext.Application = dummy
    ext.CommandHandler = dummy
    ext.ContextTypes = types.SimpleNamespace(DEFAULT_TYPE=dummy)
    ext.MessageHandler = dummy
    ext.filters = types.SimpleNamespace(PHOTO=None)
    ext.CallbackQueryHandler = dummy
    telegram.ext = ext
    sys.modules["telegram"] = telegram
    sys.modules["telegram.ext"] = ext

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bot import get_bot_token  # noqa: E402


def test_get_bot_token_argument():
    assert get_bot_token("cli") == "cli"


def test_get_bot_token_env(monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "env")
    assert get_bot_token(None) == "env"


def test_get_bot_token_missing(monkeypatch):
    monkeypatch.delenv("BOT_TOKEN", raising=False)
    with pytest.raises(SystemExit):
        get_bot_token(None)
