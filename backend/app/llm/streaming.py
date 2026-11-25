"""Streaming transport for the four saved provider protocols; no automatic replay."""
import json

import httpx

from app.llm.adapters import ADAPTERS, Completion, endpoint, headers, text_blocks
from app.services.llm_settings import LLMError


def _events(response, ndjson=False):
    data, event = [], ""
    for line in response.iter_lines():
        if ndjson:
            if line.strip():
                yield json.loads(line)
        elif line == "":
            if data:
                payload = "\n".join(data)
                if payload == "[DONE]":
                    yield {"type": "_done"}
                    return
                value = json.loads(payload)
                if isinstance(value, dict) and event:
                    value.setdefault("type", event)
                yield value
            data, event = [], ""
        elif line.startswith("data:"):
            data.append(line[5:].removeprefix(" "))
        elif line.startswith("event:"):
            event = line[6:].strip()
    if data:
        payload = "\n".join(data)
        value = {"type": "_done"} if payload == "[DONE]" else json.loads(payload)
        if isinstance(value, dict) and event:
            value.setdefault("type", event)
        yield value


def generate_stream(provider, model, messages, temperature, timeout):
    adapter = ADAPTERS[provider.protocol]
    payload = adapter.payload(model, messages, temperature)
    payload["stream"] = True
    content, summary, usage, actual_model, finished = [], [], {}, model.model_id, False
    try:
        with httpx.Client(timeout=httpx.Timeout(max(1.0, timeout)), follow_redirects=False) as client:
            request_headers = {**headers(provider), "Accept": "application/x-ndjson" if provider.protocol == "ollama-native" else "text/event-stream"}
            with client.stream("POST", endpoint(provider, adapter.path), headers=request_headers, json=payload) as response:
                if not response.is_success:
                    body = response.read().decode(errors="replace").lower()
                    oom = response.status_code in (400, 500, 503) and any(s in body for s in (
                        "out of memory", "insufficient memory", "not enough memory", "requires more system memory", "cuda oom"))
                    labels = {401: "Provider từ chối xác thực.", 403: "Không có quyền dùng provider/model này.",
                              404: "Không tìm thấy endpoint hoặc model.", 429: "Provider hết hạn mức hoặc giới hạn lượt gọi."}
                    raise LLMError("Máy chủ không đủ bộ nhớ để chạy model." if oom else labels.get(response.status_code, f"Provider trả HTTP {response.status_code}."), out_of_memory=oom)
                if "application/json" in response.headers.get("content-type", "") and provider.protocol != "ollama-native":
                    # Some compatible endpoints ignore stream=true. Never replay the inference.
                    result = adapter.parse(json.loads(response.read()), model)
                    yield {"type": "status", "text": "Provider trả câu trả lời trọn gói; đang hiển thị kết quả."}
                    yield {"type": "delta", "text": result.content}
                    yield {"type": "result", "completion": result}
                    return
                for data in _events(response, provider.protocol == "ollama-native"):
                    if not isinstance(data, dict):
                        raise LLMError("Stream provider có cấu trúc không hợp lệ.")
                    kind, delta, reasoning_summary = data.get("type"), "", ""
                    if data.get("error") or kind == "error":
                        raise LLMError("Provider báo lỗi trong lúc tạo câu trả lời; chưa tự gửi lại yêu cầu.")
                    if isinstance(data.get("model"), str):
                        actual_model = data["model"]
                    if isinstance(data.get("usage"), dict):
                        usage.update(data["usage"])
                    if provider.protocol == "openai-chat":
                        choices = data.get("choices") or []
                        if choices:
                            choice = choices[0]
                            if choice.get("finish_reason") in ("length", "content_filter", "tool_calls", "function_call"):
                                raise LLMError("Câu trả lời bị cắt, bị chặn hoặc yêu cầu công cụ chưa hỗ trợ.")
                            if choice.get("finish_reason") == "stop":
                                finished = True
                            delta = text_blocks((choice.get("delta") or {}).get("content"))
                            reasoning = choice.get("delta") or {}
                            reasoning_summary = reasoning.get("reasoning_content") or reasoning.get("reasoning") or ""
                    elif provider.protocol == "openai-responses":
                        if kind == "response.output_text.delta":
                            delta = data.get("delta", "")
                        elif kind == "response.reasoning_summary_text.delta":
                            reasoning_summary = data.get("delta", "")
                        elif kind in ("response.failed", "response.incomplete"):
                            raise LLMError("Responses API chưa hoàn tất câu trả lời.")
                        elif kind == "response.completed":
                            final = adapter.parse(data.get("response") or {}, model)
                            actual_model, usage, finished = final.model, final.usage, True
                            if not content:
                                delta = final.content
                    elif provider.protocol == "anthropic-messages":
                        if kind == "message_start":
                            message = data.get("message") or {}
                            actual_model = message.get("model") or actual_model
                            usage.update(message.get("usage") or {})
                        elif kind == "content_block_start":
                            block = data.get("content_block") or {}
                            if block.get("type") == "text":
                                delta = block.get("text", "")
                        elif kind == "content_block_delta":
                            block = data.get("delta") or {}
                            if block.get("type") == "text_delta":
                                delta = block.get("text", "")
                            elif block.get("type") == "thinking_delta":
                                reasoning_summary = block.get("thinking", "")
                        elif kind == "message_delta":
                            reason = (data.get("delta") or {}).get("stop_reason")
                            if reason not in (None, "end_turn", "stop_sequence"):
                                raise LLMError("Messages API chưa hoàn tất nội dung văn bản.")
                        elif kind == "message_stop":
                            finished = True
                    else:
                        message = data.get("message") or {}
                        delta = message.get("content", "")
                        reasoning_summary = message.get("thinking", "")
                        if data.get("done"):
                            if data.get("done_reason") == "length":
                                raise LLMError("Câu trả lời Ollama bị cắt bởi giới hạn output.")
                            finished = True
                            usage.update({key: data[key] for key in ("prompt_eval_count", "eval_count") if key in data})
                    if isinstance(delta, str) and delta:
                        content.append(delta)
                        yield {"type": "delta", "text": delta}
                    if isinstance(reasoning_summary, str) and reasoning_summary:
                        summary.append(reasoning_summary)
                        yield {"type": "summary", "text": reasoning_summary}
                if not finished or not "".join(content).strip():
                    raise LLMError("Luồng trả lời kết thúc trước khi provider xác nhận hoàn tất. Không tự gửi lại câu hỏi.")
                yield {"type": "result", "completion": Completion("".join(content), actual_model, usage, "".join(summary))}
    except httpx.TimeoutException as exc:
        raise LLMError("Provider quá thời gian chờ trong lúc stream; chưa tự gửi lại yêu cầu.", 504) from exc
    except httpx.RequestError as exc:
        raise LLMError("Mất kết nối provider trong lúc stream; chưa tự gửi lại yêu cầu.") from exc
    except (ValueError, TypeError, KeyError, AttributeError, IndexError) as exc:
        raise LLMError("Stream không đúng giao thức đã chọn. Kiểm tra endpoint/provider; chưa tự gửi lại yêu cầu.") from exc


class VisibleText:
    """Hold split <think> tags and omit their body from the visible answer."""
    def __init__(self):
        self.buffer = ""
        self.hidden = False
        self.thinking = ""

    def take_thinking(self):
        text, self.thinking = self.thinking, ""
        return text

    def feed(self, text, final=False):
        self.buffer += text
        visible = []
        while self.buffer:
            tag = "</think>" if self.hidden else "<think>"
            index = self.buffer.find(tag)
            if index >= 0:
                if not self.hidden:
                    visible.append(self.buffer[:index])
                else:
                    self.thinking += self.buffer[:index]
                self.buffer = self.buffer[index + len(tag):]
                self.hidden = not self.hidden
                continue
            keep = 0 if final else next((size for size in range(min(len(tag) - 1, len(self.buffer)), 0, -1)
                                        if self.buffer.endswith(tag[:size])), 0)
            end = len(self.buffer) - keep
            if not self.hidden:
                visible.append(self.buffer[:end])
            else:
                self.thinking += self.buffer[:end]
            self.buffer = self.buffer[end:]
            break
        return "".join(visible)
