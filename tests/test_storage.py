import json
import asyncio

from botlib.storage import JSONStorage

FERNET_KEY = b"MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA="


def test_storage_encrypts_and_decrypts(tmp_path):
    path = tmp_path / "data.json"
    storage = JSONStorage(path, FERNET_KEY)
    data = {
        "products": {
            "p1": {
                "price": "1",
                "username": "user",
                "password": "pass",
                "secret": "secret",
                "buyers": [],
            }
        }
    }
    asyncio.run(storage.save(data))
    with open(path) as fh:
        raw = json.load(fh)
    enc = raw["products"]["p1"]
    assert enc["username"] != "user"
    assert enc["password"] != "pass"
    assert enc["secret"].startswith("gAAAA")
    loaded = asyncio.run(storage.load())
    assert loaded == data
