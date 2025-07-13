import os
import pytest

DEFAULT_ENV = {
    "ADMIN_ID": "1",
    "ADMIN_PHONE": "+111",
    "FERNET_KEY": "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA="
}

# Ensure variables are present during test collection
for key, value in DEFAULT_ENV.items():
    os.environ.setdefault(key, value)

@pytest.fixture(autouse=True)
def bot_environment(monkeypatch):
    for key, value in DEFAULT_ENV.items():
        monkeypatch.setenv(key, value)
    yield
