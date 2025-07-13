import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict
import copy
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

DEFAULT_DATA = {"products": {}, "pending": [], "languages": {}}


class JSONStorage:
    """Simple JSON file storage with an async lock and Fernet encryption."""

    def __init__(self, path: Path, key: bytes):
        self.path = path
        self.lock = asyncio.Lock()
        self.fernet = Fernet(key)

    def _encrypt_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        encrypted = copy.deepcopy(data)
        for product in encrypted.get("products", {}).values():
            for field in ("username", "password", "secret"):
                value = product.get(field)
                if value is not None:
                    product[field] = self.fernet.encrypt(value.encode()).decode()
        return encrypted

    def _decrypt_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        for product in data.get("products", {}).values():
            for field in ("username", "password", "secret"):
                value = product.get(field)
                if value is not None:
                    try:
                        product[field] = self.fernet.decrypt(value.encode()).decode()
                    except InvalidToken:
                        logger.error("Failed to decrypt %s", field)
                        product[field] = ""
        return data

    async def load(self) -> Dict[str, Any]:
        """Load data from the JSON file, returning defaults on error."""
        async with self.lock:
            try:
                with open(self.path, "r") as fh:
                    data = json.load(fh)
                return self._decrypt_data(data)
            except FileNotFoundError:
                return DEFAULT_DATA.copy()
            except (OSError, json.JSONDecodeError) as exc:
                logger.error("Failed to load %s: %s", self.path, exc)
                return DEFAULT_DATA.copy()

    async def save(self, data: Dict[str, Any]) -> None:
        """Write *data* atomically to the JSON file."""
        async with self.lock:
            tmp = self.path.with_suffix(".tmp")
            try:
                enc = self._encrypt_data(data)
                with open(tmp, "w") as fh:
                    json.dump(enc, fh, indent=2)
                os.replace(tmp, self.path)
            except OSError as exc:
                logger.error("Failed to save %s: %s", self.path, exc)
                # Cleanup temp file on error
                try:
                    tmp.unlink(missing_ok=True)
                except Exception:  # pragma: no cover - best effort cleanup
                    pass
