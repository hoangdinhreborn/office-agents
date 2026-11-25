"""Compatibility entry points used by existing agents; dispatches through saved providers."""
import json
import re
import time
from typing import Any, Dict, List, Optional, Tuple

from app.config import settings
from app.database.database import SessionLocal
from app.llm.adapters import generate
from app.services.llm_settings import LLMError, providers, resolve_model, runtime


class LLMResponse:
    def __init__(self, raw: str, thought: str = "", content: str = "", elapsed_seconds: float = 0.0,
                 provider_id: str = "", model_id: str = "", fallback_used: bool = False, usage: Optional[dict] = None):
        self.raw = raw
        self.thought = thought
        self.content = content
        self.elapsed_seconds = elapsed_seconds
        self.provider_id = provider_id
        self.model_id = model_id
        self.fallback_used = fallback_used
        self.usage = usage or {}


def parse_thinking_and_content(raw_text: str) -> Tuple[str, str]:
    """
    Separates the <think>...</think> reasoning trace (characteristic of DeepSeek-R1 RL reasoning)
    from the final answer content.
    """
    if not raw_text:
        return "", ""

    think_match = re.search(r"<think>(.*?)</think>", raw_text, flags=re.DOTALL)
    if think_match:
        thought = think_match.group(1).strip()
        content = re.sub(r"<think>.*?</think>", "", raw_text, flags=re.DOTALL).strip()
        return thought, content

    # Check for unclosed <think> tag if output was truncated
    if raw_text.startswith("<think>"):
        parts = raw_text.split("</think>", 1)
        if len(parts) == 2:
            return parts[0].replace("<think>", "").strip(), parts[1].strip()
        return raw_text.replace("<think>", "").strip(), ""

    return "", raw_text.strip()


def extract_json_from_response(text: str) -> Optional[Any]:
    """
    Extracts structured JSON from LLM output, handling markdown blocks and reasoning traces.
    """
    _, content = parse_thinking_and_content(text)
    target = content if content else text

    # Try 1: Markdown json code block ```json ... ```
    json_block = re.search(r"```(?:json)?\s*([\[{].*?[\]}])\s*```", target, flags=re.DOTALL)
    if json_block:
        try:
            return json.loads(json_block.group(1).strip())
        except Exception:
            pass

    # Try 2: Find outermost JSON object or list
    json_obj = re.search(r"([\[{].*[\]}])", target, flags=re.DOTALL)
    if json_obj:
        try:
            return json.loads(json_obj.group(1).strip())
        except Exception:
            pass

    # Try 3: Direct parse
    try:
        return json.loads(target)
    except Exception:
        return None


def chat_with_llm(
    message: str, system_prompt: Optional[str] = None, history: Optional[List[Dict[str, str]]] = None,
    model: Optional[str] = None, temperature: float = 0.6, timeout_secs: Optional[float] = None,
) -> LLMResponse:
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    for item in history or []:
        if item.get("role") in ("user", "assistant") and isinstance(item.get("content"), str):
            messages.append({"role": item["role"], "content": item["content"]})
    messages.append({"role": "user", "content": message})
    with SessionLocal() as db:
        provider, chosen = resolve_model(db, model)
        fallback_id = runtime(db).fallback_model_id
    start = time.perf_counter()
    used_fallback = False
    timeout = timeout_secs if timeout_secs is not None else (settings.llm_timeout or settings.ollama_timeout)
    try:
        result = generate(provider, chosen, messages, temperature, timeout)
    except LLMError as exc:
        if not exc.out_of_memory or not provider.is_local_runtime or not fallback_id or fallback_id == chosen.id:
            raise
        with SessionLocal() as db:
            fallback_provider, fallback_model = resolve_model(db, fallback_id)
        if not fallback_provider.is_local_runtime:
            raise LLMError("Fallback VRAM cần trỏ đến máy chủ cục bộ.", 422) from exc
        provider, chosen = fallback_provider, fallback_model
        result = generate(provider, chosen, messages, temperature, timeout)
        used_fallback = True
    thought, content = parse_thinking_and_content(result.content)
    if not content.strip():
        raise LLMError("Model chỉ trả phần suy luận, chưa có câu trả lời. Kiểm tra model và giới hạn output.")
    return LLMResponse(raw=result.content, thought=result.thinking or thought, content=content,
                       elapsed_seconds=time.perf_counter() - start, provider_id=provider.id,
                       model_id=result.model, fallback_used=used_fallback, usage=result.usage)


def chat_with_llm_safe(
    message: str, system_prompt: Optional[str] = None, history: Optional[List[Dict[str, str]]] = None,
    model: Optional[str] = None, temperature: float = 0.6, timeout_secs: Optional[float] = None,
    max_retries: int = 0,
) -> LLMResponse:
    # HTTP timeouts are handled by the adapter. Do not resend a billed inference automatically.
    if max_retries != 0:
        raise LLMError("Tự thử lại inference chưa được bật; yêu cầu max_retries=0 để tránh gọi tính phí lặp.", 422)
    return chat_with_llm(message, system_prompt, history, model, temperature, timeout_secs)


def check_ollama_status() -> Dict[str, Any]:
    # Compatibility field in /api/chat/status; no endpoint probing on status requests.
    with SessionLocal() as db:
        state = runtime(db)
        saved = providers(db)
        return {"connected": None, "status": "not_checked", "selected_model_id": state.selected_model_id,
                "available_models": [m.model_id for p in saved for m in p.models]}
