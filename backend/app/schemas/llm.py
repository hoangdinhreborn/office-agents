import re
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator

ProtocolName = Literal["openai-chat", "openai-responses", "anthropic-messages", "ollama-native"]


def token_count(value: str) -> int | None:
    if not value:
        return None
    match = re.fullmatch(r"(\d+(?:\.\d+)?)\s*([KkMm]?)", value)
    if match is None:
        raise ValueError("Giới hạn token cần là số, có thể kèm K hoặc M (ví dụ 8192 hoặc 32K).")
    count = float(match[1]) * {"": 1, "K": 1000, "M": 1000000}[match[2].upper()]
    if not count.is_integer() or count < 1:
        raise ValueError("Giới hạn token phải là số nguyên dương.")
    return int(count)


class ModelConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: str = Field(min_length=1, max_length=128)
    model_id: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    context_window: str = ""
    max_output_tokens: str = ""
    quantization: str = ""
    supports_text: bool = True
    supports_image: bool = False
    supports_reasoning: bool = False
    is_rl_tuned: bool = False

    @field_validator("context_window", "max_output_tokens")
    @classmethod
    def valid_token_count(cls, value: str) -> str:
        token_count(value)
        return value

    @model_validator(mode="after")
    def output_within_context(self):
        context, output = token_count(self.context_window), token_count(self.max_output_tokens)
        if context and output and output > context:
            raise ValueError("Max output không được lớn hơn context window.")
        return self


class ProviderConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: str = Field(min_length=1, max_length=128)
    source_type: Literal["builtin", "custom"] = "custom"
    builtin_key: str | None = None
    display_name: str = Field(min_length=1, max_length=100)
    base_url: str = Field(min_length=1, max_length=2048)
    protocol: ProtocolName
    auth_env_var: str = Field("", max_length=128)
    api_key: SecretStr | None = Field(None, exclude=True)
    clear_api_key: bool = Field(False, exclude=True)
    is_local_runtime: bool = False
    models: list[ModelConfig] = Field(default_factory=list, max_length=500)

    @field_validator("api_key")
    @classmethod
    def valid_api_key(cls, value: SecretStr | None) -> SecretStr | None:
        if value is None:
            return None
        key = value.get_secret_value().strip()
        if len(key) > 8192 or any(ord(char) < 32 or ord(char) > 126 for char in key):
            raise ValueError("API key phải là chuỗi ASCII không chứa ký tự điều khiển, tối đa 8192 ký tự.")
        return SecretStr(key) if key else None

    @field_validator("auth_env_var", mode="before")
    @classmethod
    def valid_auth_env_var(cls, value: str) -> str:
        if isinstance(value, str):
            value = value.strip()
            if len(value) > 128 or (value and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value) is None):
                raise ValueError(
                    "Chỉ nhập tên biến môi trường như CUSTOM_LLM_API_KEY (tối đa 128 ký tự), "
                    "không nhập API key, dấu $ hoặc dòng NAME=value. "
                    "Để trống nếu endpoint không cần xác thực."
                )
        return value

    @field_validator("base_url")
    @classmethod
    def valid_base_url(cls, value: str) -> str:
        url = urlsplit(value)
        if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password or url.query or url.fragment:
            raise ValueError("URL cơ sở cần là HTTP(S), không chứa user/password, query hoặc fragment.")
        return value.rstrip("/")

    @model_validator(mode="after")
    def unique_models(self):
        if self.api_key is not None and (self.auth_env_var or self.clear_api_key):
            raise ValueError("Chỉ chọn một cách xác thực: API key trực tiếp hoặc biến môi trường hoặc không xác thực.")
        if len({m.id for m in self.models}) != len(self.models) or len({m.model_id for m in self.models}) != len(self.models):
            raise ValueError("ID model bị trùng trong provider.")
        return self


class ModelSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model_id: str = Field(min_length=1, max_length=128)


class FallbackSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model_id: str | None = Field(None, min_length=1, max_length=128)
