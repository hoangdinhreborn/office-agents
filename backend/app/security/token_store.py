import base64
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional, Union
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

logger = logging.getLogger(__name__)


class SecureTokenStore:
    """
    Encrypts and securely stores OAuth tokens locally using Fernet symmetric encryption.
    Prevents plaintext storage of refresh tokens and access credentials.
    """

    def __init__(self, storage_dir: Optional[Union[str, Path]] = None):
        self.storage_dir = Path(storage_dir or "data/tokens")
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.key_file = self.storage_dir / ".master_key"
        self._cipher: Optional[Fernet] = None

    def _get_cipher(self) -> Fernet:
        if self._cipher is not None:
            return self._cipher

        env_key = os.getenv("TOKEN_ENCRYPTION_KEY")
        if env_key and len(env_key.strip()) > 0:
            try:
                # Use key directly or derive 32-byte urlsafe base64
                if len(env_key.strip()) == 44:
                    self._cipher = Fernet(env_key.strip().encode())
                else:
                    kdf = PBKDF2HMAC(
                        algorithm=hashes.SHA256(),
                        length=32,
                        salt=b"local_ai_token_salt",
                        iterations=100000,
                    )
                    derived = base64.urlsafe_b64encode(kdf.derive(env_key.strip().encode()))
                    self._cipher = Fernet(derived)
                return self._cipher
            except Exception as e:
                logger.warning(f"Không thể khởi tạo Fernet từ TOKEN_ENCRYPTION_KEY: {e}")

        # Local machine master key fallback
        if self.key_file.exists():
            key_data = self.key_file.read_bytes().strip()
            self._cipher = Fernet(key_data)
        else:
            generated_key = Fernet.generate_key()
            self.key_file.write_bytes(generated_key)
            try:
                # Attempt to restrict permissions on POSIX systems
                os.chmod(self.key_file, 0o600)
            except Exception:
                pass
            self._cipher = Fernet(generated_key)

        return self._cipher

    def save_token(self, name: str, token_data: Union[Dict[str, Any], str]) -> Path:
        """
        Encrypts and writes token data to a file.
        """
        cipher = self._get_cipher()
        if isinstance(token_data, dict):
            raw_text = json.dumps(token_data, ensure_ascii=False)
        else:
            raw_text = str(token_data)

        encrypted_bytes = cipher.encrypt(raw_text.encode("utf-8"))
        token_path = self.storage_dir / f"{name}.enc"
        token_path.write_bytes(encrypted_bytes)
        logger.info(f"Đã lưu token mã hóa an toàn tại '{token_path}'.")
        return token_path

    def load_token(self, name: str) -> Optional[Union[Dict[str, Any], str]]:
        """
        Decrypts and loads token data.
        Falls back to legacy plaintext JSON if .enc does not exist.
        """
        enc_path = self.storage_dir / f"{name}.enc"
        json_path = self.storage_dir / f"{name}.json"

        # 1. Try encrypted file
        if enc_path.exists():
            try:
                cipher = self._get_cipher()
                encrypted_bytes = enc_path.read_bytes()
                decrypted_bytes = cipher.decrypt(encrypted_bytes)
                text = decrypted_bytes.decode("utf-8")
                try:
                    return json.loads(text)
                except Exception:
                    return text
            except Exception as exc:
                logger.error(f"Lỗi giải mã token '{name}.enc': {exc}")
                return None

        # 2. Backward compatibility with plaintext .json
        if json_path.exists():
            try:
                text = json_path.read_text(encoding="utf-8")
                data = json.loads(text)
                # Auto-migrate to encrypted format
                self.save_token(name, data)
                return data
            except Exception as exc:
                logger.warning(f"Lỗi đọc token thô '{name}.json': {exc}")
                return None

        return None

    def delete_token(self, name: str) -> bool:
        """Removes both encrypted and legacy plaintext token files."""
        enc_path = self.storage_dir / f"{name}.enc"
        json_path = self.storage_dir / f"{name}.json"
        deleted = False
        if enc_path.exists():
            enc_path.unlink()
            deleted = True
        if json_path.exists():
            json_path.unlink()
            deleted = True
        return deleted

    def has_token(self, name: str) -> bool:
        return (self.storage_dir / f"{name}.enc").exists() or (self.storage_dir / f"{name}.json").exists()


token_store = SecureTokenStore()
