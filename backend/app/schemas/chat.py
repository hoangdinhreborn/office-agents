from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., description="Yêu cầu từ người dùng")
    session_id: Optional[str] = Field(None, description="Định danh phiên hội thoại (UUID)")
    folder_name: Optional[str] = Field(None, description="Nhãn Gmail chỉ định (vd: INBOX)")
    allowed_senders: Optional[List[str]] = Field(None, description="Danh sách email người gửi cho phép")
    history: Optional[List[Dict[str, str]]] = Field(None, description="Lịch sử đối thoại trước đó")


class ChatResponse(BaseModel):
    response: str
    intent: str
    agents_invoked: List[str]
    thinking_process: str = ""
    session_id: Optional[str] = None
    summary_data: Optional[Dict[str, Any]] = None
    solution_data: Optional[Dict[str, Any]] = None
    email_data: Optional[List[Dict[str, Any]]] = None
    calendar_data: Optional[Dict[str, Any]] = None


class ChatSessionSummary(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str
    message_count: int = 0


class ChatMessageItem(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    thinking_process: str = ""
    agents_invoked: List[str] = []
    created_at: str


class ChatSessionDetail(BaseModel):
    session: ChatSessionSummary
    messages: List[ChatMessageItem]


class SessionCreateRequest(BaseModel):
    title: Optional[str] = Field("Cuộc trò chuyện mới", description="Tiêu đề phiên hội thoại")


class SessionUpdateRequest(BaseModel):
    title: str = Field(..., min_length=1, description="Tiêu đề mới cho phiên hội thoại")


class SystemStatusResponse(BaseModel):
    app_name: str
    ollama_status: Dict[str, Any]
    email_provider: str = "gmail"
    calendar_provider: str = "google"
    allowed_senders: List[str] = []
    calendar_default_reminder_minutes: int = 30
