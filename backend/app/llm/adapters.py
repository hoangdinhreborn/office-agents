"""Text-only HTTP adapters. No discovery, downloads or inference at import time."""
from dataclasses import dataclass
import os
from typing import Any, Protocol
from urllib.parse import urlsplit, urlunsplit

import httpx

from app.schemas.llm import ModelConfig, ProviderConfig, token_count
from app.services.llm_settings import LLMError


LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}


@dataclass
class Completion:
    content: str
    model: str
    usage: dict
    thinking: str = ""


class Adapter(Protocol):
    path: str

    def payload(self, model: ModelConfig, messages: list[dict[str, str]], temperature: float) -> dict: ...
    def parse(self, data: dict, model: ModelConfig) -> Completion: ...


def endpoint(provider: ProviderConfig, path: str) -> str:
    base = urlsplit(provider.base_url)
    netloc = base.netloc
    host_gateway = os.environ.get("LLM_LOOPBACK_HOST", "").strip()
    if host_gateway and base.hostname in LOOPBACK_HOSTS:
        # In Docker, the configured loopback address refers to the machine running the provider.
        netloc = host_gateway
        if base.port is not None:
            netloc += f":{base.port}"
    base_path = base.path.rstrip("/")
    # The field accepts an API root or the exact endpoint; preserve proxy prefixes.
    endings = ("/chat/completions", "/responses", "/messages", "/models", "/api/chat", "/api/tags")
    for ending in endings:
        if base_path.endswith(ending):
            base_path = base_path[:-len(ending)]
            break
    if provider.protocol == "ollama-native":
        if base_path.endswith("/v1"):
            base_path = base_path[:-3]
        if base_path.endswith("/api"):
            base_path = base_path[:-4]
    return urlunsplit((base.scheme, netloc, base_path + path, "", ""))


def headers(provider: ProviderConfig) -> dict[str, str]:
    result = {"Accept": "application/json", "Content-Type": "application/json"}
    if provider.protocol == "anthropic-messages":
        result["anthropic-version"] = "2023-06-01"
    value = provider.api_key.get_secret_value() if provider.api_key is not None else ""
    if not value and provider.auth_env_var:
        value = os.environ.get(provider.auth_env_var, "").strip()
        if not value:
            raise LLMError(f"Chưa đặt biến môi trường {provider.auth_env_var} trên backend; khởi động lại BE sau khi cấu hình.", 422)
    if value:
        if provider.protocol == "anthropic-messages":
            result["x-api-key"] = value
        else:
            result["Authorization"] = f"Bearer {value}"
    return result


def request_json(provider: ProviderConfig, method: str, path: str, *, payload: dict | None = None, timeout: float = 30, params: dict | None = None) -> dict:
    try:
        # Redirects are not followed, so an auth header cannot be forwarded to another endpoint.
        with httpx.Client(timeout=httpx.Timeout(max(1.0, timeout)), follow_redirects=False) as client:
            response = client.request(method, endpoint(provider, path), headers=headers(provider), json=payload, params=params)
        if not response.is_success:
            body = response.text.lower()
            oom = response.status_code in (400, 500, 503) and any(
                text in body for text in ("out of memory", "insufficient memory", "not enough memory", "requires more system memory", "cuda oom")
            )
            messages = {401: "Provider từ chối xác thực.", 403: "Tài khoản không có quyền dùng provider/model này.",
                        404: "Không tìm thấy endpoint hoặc model. Kiểm tra URL, giao thức và model ID.",
                        429: "Provider giới hạn lượt gọi hoặc đã hết hạn mức. Không tự đổi provider/model."}
            message = "Máy chủ không đủ bộ nhớ để chạy model." if oom else messages.get(response.status_code, f"Provider trả HTTP {response.status_code}.")
            raise LLMError(message, out_of_memory=oom)
        data = response.json()
        if not isinstance(data, dict):
            raise LLMError("Provider trả JSON không đúng cấu trúc của giao thức đã chọn.")
        return data
    except httpx.TimeoutException as exc:
        raise LLMError("Provider quá thời gian chờ; chưa tự gửi lại yêu cầu.", 504) from exc
    except httpx.RequestError as exc:
        if os.environ.get("LLM_LOOPBACK_HOST", "").strip() and urlsplit(provider.base_url).hostname in LOOPBACK_HOSTS:
            raise LLMError(
                "Backend không kết nối được provider trên máy host. Kiểm tra cổng và địa chỉ lắng nghe của provider từ Docker."
            ) from exc
        raise LLMError("Không kết nối được endpoint. Kiểm tra địa chỉ và dịch vụ provider.") from exc
    except ValueError as exc:
        raise LLMError("Provider không trả JSON hợp lệ. Kiểm tra URL cơ sở và giao thức API.") from exc


def text_blocks(blocks: Any, kind: str = "text") -> str:
    if isinstance(blocks, str):
        return blocks
    if not isinstance(blocks, list):
        return ""
    return "\n".join(block["text"] for block in blocks if isinstance(block, dict) and block.get("type") == kind and isinstance(block.get("text"), str))


def completion(data: dict, model: ModelConfig, content: str, thinking: str = "") -> Completion:
    if not content.strip():
        raise LLMError("Provider không trả nội dung văn bản. Kiểm tra model và giao thức API.")
    actual_model = data.get("model") if isinstance(data.get("model"), str) else model.model_id
    return Completion(content, actual_model or model.model_id, data.get("usage") if isinstance(data.get("usage"), dict) else {}, thinking if isinstance(thinking, str) else "")


class ChatCompletionsAdapter:
    path = "/chat/completions"

    def payload(self, model, messages, temperature):
        data = {"model": model.model_id, "messages": messages, "stream": False}
        limit = token_count(model.max_output_tokens)
        if limit:
            data["max_completion_tokens" if model.supports_reasoning else "max_tokens"] = limit
        if not model.supports_reasoning:
            data["temperature"] = temperature
        return data

    def parse(self, data, model):
        choices = data.get("choices")
        if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
            raise LLMError("Phản hồi không có choices theo Chat Completions.")
        if choices[0].get("finish_reason") in ("length", "content_filter"):
            raise LLMError("Câu trả lời bị cắt hoặc bị provider chặn. Kiểm tra giới hạn output và model.")
        message = choices[0].get("message") or {}
        if not isinstance(message, dict):
            raise LLMError("Phản hồi Chat Completions không có message hợp lệ.")
        return completion(data, model, text_blocks(message.get("content")), message.get("reasoning_content") or message.get("reasoning") or "")


class ResponsesAdapter:
    path = "/responses"

    def payload(self, model, messages, temperature):
        data = {"model": model.model_id, "input": [m for m in messages if m["role"] != "system"],
                "instructions": "\n\n".join(m["content"] for m in messages if m["role"] == "system"), "stream": False, "store": False}
        limit = token_count(model.max_output_tokens)
        if limit:
            data["max_output_tokens"] = limit
        if not model.supports_reasoning:
            data["temperature"] = temperature
        return data

    def parse(self, data, model):
        if data.get("error") or data.get("status") not in (None, "completed"):
            raise LLMError("Responses API chưa hoàn tất câu trả lời. Kiểm tra model và giới hạn output.")
        output = data.get("output")
        if not isinstance(output, list):
            raise LLMError("Phản hồi không có output theo Responses API.")
        content = "\n".join(text_blocks(item.get("content"), "output_text") for item in output if isinstance(item, dict) and item.get("type") == "message")
        return completion(data, model, content)


class AnthropicMessagesAdapter:
    path = "/messages"

    def payload(self, model, messages, temperature):
        data = {"model": model.model_id, "messages": [m for m in messages if m["role"] != "system"],
                "max_tokens": token_count(model.max_output_tokens) or 4096, "stream": False}
        system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
        if system:
            data["system"] = system
        if not model.supports_reasoning:
            data["temperature"] = temperature
        return data

    def parse(self, data, model):
        if data.get("type") == "error" or data.get("stop_reason") in ("max_tokens", "refusal"):
            raise LLMError("Messages API không hoàn tất nội dung văn bản. Kiểm tra giới hạn output và model.")
        return completion(data, model, text_blocks(data.get("content")))


class OllamaNativeAdapter:
    path = "/api/chat"

    def payload(self, model, messages, temperature):
        options = {"temperature": temperature}
        if token_count(model.context_window):
            options["num_ctx"] = token_count(model.context_window)
        if token_count(model.max_output_tokens):
            options["num_predict"] = token_count(model.max_output_tokens)
        return {"model": model.model_id, "messages": messages, "stream": False, "options": options}

    def parse(self, data, model):
        message = data.get("message")
        if data.get("error") or not isinstance(message, dict):
            raise LLMError("Phản hồi không có message theo Ollama Native API.")
        if data.get("done_reason") == "length":
            raise LLMError("Câu trả lời Ollama bị cắt bởi giới hạn output.")
        return completion(data, model, text_blocks(message.get("content")), message.get("thinking") or "")


ADAPTERS: dict[str, Adapter] = {
    "openai-chat": ChatCompletionsAdapter(), "openai-responses": ResponsesAdapter(),
    "anthropic-messages": AnthropicMessagesAdapter(), "ollama-native": OllamaNativeAdapter(),
}


def generate(provider: ProviderConfig, model: ModelConfig, messages: list[dict[str, str]], temperature: float, timeout: float) -> Completion:
    adapter = ADAPTERS[provider.protocol]
    data = request_json(provider, "POST", adapter.path, payload=adapter.payload(model, messages, temperature), timeout=timeout)
    return adapter.parse(data, model)


def discover_models(provider: ProviderConfig) -> list[dict]:
    path = "/api/tags" if provider.protocol == "ollama-native" else "/models"
    entries, cursor = [], None
    for _ in range(20):
        params = {"limit": 100, **({"after_id": cursor} if cursor else {})} if provider.protocol == "anthropic-messages" else None
        data = request_json(provider, "GET", path, timeout=20, params=params)
        values = data.get("models" if provider.protocol == "ollama-native" else "data")
        if not isinstance(values, list):
            raise LLMError("Endpoint không hỗ trợ danh sách model theo giao thức đã chọn. Bạn có thể nhập model ID thủ công.")
        for value in values:
            if not isinstance(value, dict):
                continue
            model_id = value.get("name") if provider.protocol == "ollama-native" else value.get("id")
            if isinstance(model_id, str) and model_id:
                entries.append({"model_id": model_id, "name": value.get("display_name") or model_id})
        if not data.get("has_more"):
            return list({item["model_id"]: item for item in entries}.values())
        next_cursor = data.get("last_id")
        if provider.protocol != "anthropic-messages" or not next_cursor or next_cursor == cursor:
            raise LLMError("Không đọc hết được danh sách model; hãy nhập model ID thủ công.")
        cursor = next_cursor
    raise LLMError("Danh sách model quá nhiều trang; hãy nhập model ID thủ công.")
