import sys
from pathlib import Path
import importlib
import os
import pytest


pytest.importorskip("telegram")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_data_file_env(monkeypatch, tmp_path):
    custom = tmp_path / "custom.json"
    monkeypatch.setenv("DATA_FILE", str(custom))
    if "bot" in sys.modules:
        del sys.modules["bot"]
    bot = importlib.import_module("bot")
    assert bot.DATA_FILE == custom
    assert bot.storage.path == custom
