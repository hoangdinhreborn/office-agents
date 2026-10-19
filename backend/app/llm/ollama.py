from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
import json
import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple
import httpx
from ollama import Client

from app.config import settings

logger = logging.getLogger(__name__)

client = Client(host=settings.ollama_base_url)


class LLMResponse:
    def __init__(self, raw: str, thought: str = "", content: str = "", elapsed_seconds: float = 0.0):
        self.raw = raw
        self.thought = thought
        self.content = content
        self.elapsed_seconds = elapsed_seconds

    def __repr__(self) -> str:
        return (
            f"LLMResponse(thought_len={len(self.thought)}, "
            f"content_len={len(self.content)}, "
            f"elapsed={self.elapsed_seconds:.2f}s)"
        )


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
    message: str,
    system_prompt: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None,
    model: Optional[str] = None,
    temperature: float = 0.6,
) -> LLMResponse:
    """
    Sends message to the local LLM (DeepSeek-R1) and returns structured response
    including the reasoning process (<think> trace).
    """
    chosen_model = model or settings.ollama_model
    messages: List[Dict[str, str]] = []

    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    if history:
        messages.extend(history)

    messages.append({"role": "user", "content": message})

    start_time = time.perf_counter()
    try:
        response = client.chat(
            model=chosen_model,
            messages=messages,
            options={"temperature": temperature},
        )
        elapsed = time.perf_counter() - start_time
        raw_text = response["message"]["content"]
        thought, content = parse_thinking_and_content(raw_text)
        return LLMResponse(raw=raw_text, thought=thought, content=content, elapsed_seconds=elapsed)
    except Exception as exc:
        elapsed = time.perf_counter() - start_time
        err_msg = f"Lỗi kết nối Ollama model '{chosen_model}': {str(exc)}"
        return LLMResponse(raw=err_msg, thought="", content=err_msg, elapsed_seconds=elapsed)


def chat_with_llm_safe(
    message: str,
    system_prompt: Optional[str] = None,
    history: Optional[List[Dict[str, str]]] = None,
    model: Optional[str] = None,
    temperature: float = 0.6,
    timeout_secs: Optional[float] = None,
    max_retries: int = 2,
) -> LLMResponse:
    """
    Robust LLM caller:
    - Enforces timeout via ThreadPoolExecutor.
    - Retries on transient failure or timeout up to max_retries.
    - Logs running duration per attempt.
    - Returns structured LLMResponse with graceful fallback on complete failure.
    """
    timeout = timeout_secs or settings.ollama_timeout
    chosen_model = model or settings.ollama_model

    last_error = ""
    for attempt in range(max_retries + 1):
        t0 = time.perf_counter()
        logger.info(f"Gửi yêu cầu tới LLM '{chosen_model}' (lần thử {attempt + 1}/{max_retries + 1}, timeout={timeout}s)...")

        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(
                chat_with_llm,
                message=message,
                system_prompt=system_prompt,
                history=history,
                model=chosen_model,
                temperature=temperature,
            )
            try:
                result = future.result(timeout=timeout)
                elapsed = time.perf_counter() - t0
                result.elapsed_seconds = elapsed

                # If the returned content is an error message from chat_with_llm
                if result.content.startswith("Lỗi kết nối Ollama"):
                    last_error = result.content
                    logger.warning(f"Lỗi phản hồi từ LLM (lần thử {attempt + 1}): {last_error}")
                    if attempt < max_retries:
                        time.sleep(0.5 * (attempt + 1))
                        continue
                    return result

                logger.info(f"LLM hoàn thành trong {elapsed:.2f}s (lần thử {attempt + 1}).")
                return result

            except FuturesTimeoutError:
                elapsed = time.perf_counter() - t0
                last_error = f"LLM quá thời gian chờ sau {timeout:.1f}s (bận hoặc xử lý quá lâu)."
                logger.warning(f"LLM timeout sau {elapsed:.2f}s (lần thử {attempt + 1}).")
                if attempt < max_retries:
                    time.sleep(0.5 * (attempt + 1))
                    continue

            except Exception as exc:
                elapsed = time.perf_counter() - t0
                last_error = f"Lỗi ngoại lệ khi gọi LLM: {str(exc)}"
                logger.warning(f"Lỗi LLM sau {elapsed:.2f}s (lần thử {attempt + 1}): {exc}")
                if attempt < max_retries:
                    time.sleep(0.5 * (attempt + 1))
                    continue

    fallback_msg = f"[Lỗi hệ thống: {last_error}]"
    return LLMResponse(
        raw=fallback_msg,
        thought="",
        content=fallback_msg,
        elapsed_seconds=timeout,
    )


def check_ollama_status() -> Dict[str, Any]:
    """
    Verifies if Ollama is running and lists locally installed models.
    """
    try:
        with httpx.Client(timeout=3.0) as http_client:
            res = http_client.get(f"{settings.ollama_base_url}/api/tags")
            if res.status_code == 200:
                data = res.json()
                models = [m.get("name") for m in data.get("models", [])]
                is_target_installed = any(
                    settings.ollama_model in m or m.startswith(settings.ollama_model.split(":")[0])
                    for m in models
                )
                return {
                    "connected": True,
                    "target_model": settings.ollama_model,
                    "target_model_installed": is_target_installed,
                    "available_models": models,
                }
            return {
                "connected": False,
                "error": f"Ollama HTTP {res.status_code}",
                "available_models": [],
            }
    except Exception as exc:
        return {
            "connected": False,
            "error": str(exc),
            "available_models": [],
        }
