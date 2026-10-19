from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import json

from app.agents.calendar_agent import calendar_agent, CalendarExtractionResult
from app.agents.email_agent import email_agent, EmailAnalysisResult, SentEmailResult
from app.agents.solution_agent import solution_agent, SolutionResult
from app.agents.summary_agent import summary_agent, SummaryResult
from app.llm.ollama import chat_with_llm, extract_json_from_response, LLMResponse
from app.llm.prompts import SYSTEM_ORCHESTRATOR_PROMPT


INTENT_ROUTER_PROMPT = """Bạn là Bộ Phân Loại Ý Định (Intent Classifier) của hệ thống Trợ lý Multi-Agent.
Hãy phân tích yêu cầu của người dùng và xác định công việc cần thực hiện.

Các loại intent:
- "SUMMARY": Yêu cầu tóm tắt văn bản, báo cáo, tài liệu PDF.
- "SOLUTION": Yêu cầu phân tích nguyên nhân và đề xuất giải pháp cho vấn đề/sự cố.
- "EMAIL": Yêu cầu đọc, kiểm tra, quét, lọc hoặc tóm tắt email trong hộp thư Gmail.
- "EMAIL_SEND": Yêu cầu soạn và GỬI một email mới đến địa chỉ email người nhận.
- "CALENDAR": Yêu cầu đặt lịch, tạo cuộc họp, hẹn giờ, nhắc nhở trên Google Calendar.
- "COMPOUND": Yêu cầu kết hợp nhiều tác vụ (ví dụ: vừa đọc email vừa đề xuất giải pháp, vừa đọc văn bản vừa lên lịch).
- "CHAT": Trò chuyện chung hoặc hỏi đáp thông thường.

Trả về kết quả duy nhất ở định dạng JSON:
```json
{
  "intent": "SUMMARY | SOLUTION | EMAIL | EMAIL_SEND | CALENDAR | COMPOUND | CHAT",
  "folder_name": "Tên thư mục nếu cần đọc email (hoặc null)",
  "senders": ["danh sách email người gửi cần lọc khi đọc email nếu có"],
  "email_to": ["danh sách địa chỉ email người nhận nếu yêu cầu GỬI email"],
  "email_subject": "Tiêu đề email nếu yêu cầu GỬI email (hoặc null)",
  "email_body": "Nội dung email cần gửi nếu yêu cầu GỬI email (hoặc null)",
  "problem": "Mô tả vấn đề nếu cần giải pháp",
  "calendar_text": "Nội dung cần lên lịch nếu có",
  "summary_needed": true | false,
  "solution_needed": true | false,
  "calendar_needed": true | false,
  "email_needed": true | false,
  "email_send_needed": true | false
}
```"""


@dataclass
class OrchestratorResponse:
    intent: str
    reply: str
    agents_invoked: List[str]
    summary_data: Optional[Dict[str, Any]] = None
    solution_data: Optional[Dict[str, Any]] = None
    email_data: Optional[List[Dict[str, Any]]] = None
    calendar_data: Optional[Dict[str, Any]] = None
    thinking_process: str = ""


class AgentOrchestrator:
    """
    Central orchestrator coordinating between Summary, Solution, Email,
    and Calendar agents using a single local DeepSeek-R1 LLM.
    """

    def __init__(self, model: Optional[str] = None):
        self.model = model

    def route_and_execute(
        self,
        message: str,
        pdf_bytes: Optional[bytes] = None,
        pdf_filename: Optional[str] = None,
        folder_name: Optional[str] = None,
        allowed_senders: Optional[List[str]] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> OrchestratorResponse:
        agents_invoked: List[str] = []
        thinking_traces: List[str] = []

        # Step 1: Detect intent via DeepSeek-R1
        classify_res: LLMResponse = chat_with_llm(
            message=f"Yêu cầu người dùng:\n{message}",
            system_prompt=INTENT_ROUTER_PROMPT,
            model=self.model,
        )
        if classify_res.thought:
            thinking_traces.append(f"[Phân loại Intent]: {classify_res.thought}")

        intent_data = extract_json_from_response(classify_res.content) or {}
        intent = intent_data.get("intent", "CHAT")

        # Context accumulation
        summary_result: Optional[SummaryResult] = None
        solution_result: Optional[SolutionResult] = None
        email_results: Optional[List[EmailAnalysisResult]] = None
        sent_email_result: Optional[SentEmailResult] = None
        calendar_result: Optional[CalendarExtractionResult] = None

        # Check if PDF attached
        if pdf_bytes:
            agents_invoked.append("SUMMARY_AGENT")
            summary_result = summary_agent.summarize_pdf(pdf_bytes, filename=pdf_filename)
            if summary_result.thinking_process:
                thinking_traces.append(f"[Summary Agent]: {summary_result.thinking_process}")

            # Check if PDF contains deadlines to schedule
            if summary_result.deadlines:
                agents_invoked.append("CALENDAR_AGENT")
                cal_input = "\n".join(summary_result.deadlines)
                calendar_result = calendar_agent.extract_and_schedule(
                    input_text=cal_input,
                    source_type="document",
                    source_reference=pdf_filename or "document.pdf",
                )
                if calendar_result.thinking_process:
                    thinking_traces.append(f"[Calendar Agent]: {calendar_result.thinking_process}")

        # Check Outbound Email Send execution
        if intent == "EMAIL_SEND" or intent_data.get("email_send_needed"):
            agents_invoked.append("EMAIL_AGENT")
            raw_to = intent_data.get("email_to")
            to_list = None
            if isinstance(raw_to, str) and raw_to.strip():
                to_list = [s.strip() for s in raw_to.split(",") if s.strip()]
            elif isinstance(raw_to, list):
                to_list = [str(s).strip() for s in raw_to if str(s).strip()]

            sent_email_result = email_agent.compose_and_send(
                user_request=message,
                to=to_list,
                subject=intent_data.get("email_subject"),
                body=intent_data.get("email_body"),
            )
            if sent_email_result.thinking_process:
                thinking_traces.append(f"[Email Agent - Compose]: {sent_email_result.thinking_process}")

        # Check Email Inbox Read / Analysis execution
        if intent in ["EMAIL", "COMPOUND"] or (intent_data.get("email_needed") and intent != "EMAIL_SEND"):
            agents_invoked.append("EMAIL_AGENT")
            target_folder = folder_name or intent_data.get("folder_name")
            target_senders = allowed_senders or intent_data.get("senders")
            email_results = email_agent.fetch_and_analyze(
                folder_name=target_folder,
                allowed_senders=target_senders,
                limit=3,
            )
            for e_res in email_results:
                if e_res.thinking_process:
                    thinking_traces.append(f"[Email Agent - {e_res.subject}]: {e_res.thinking_process}")

                # If email contains an urgent issue and solution requested or needed
                if e_res.has_issue_to_solve and (intent in ["SOLUTION", "COMPOUND"] or intent_data.get("solution_needed")):
                    if not solution_result:
                        agents_invoked.append("SOLUTION_AGENT")
                        solution_result = solution_agent.propose_solution(
                            problem_description=e_res.issue_description or e_res.summary,
                            context=f"Email từ: {e_res.sender}, Tiêu đề: {e_res.subject}",
                        )
                        if solution_result.thinking_process:
                            thinking_traces.append(f"[Solution Agent]: {solution_result.thinking_process}")

                # If email contains a meeting/deadline
                if e_res.has_calendar_event:
                    agents_invoked.append("CALENDAR_AGENT")
                    calendar_result = calendar_agent.extract_and_schedule(
                        input_text=e_res.calendar_hint or e_res.summary,
                        source_type="email",
                        source_reference=f"Email: {e_res.subject}",
                    )
                    if calendar_result.thinking_process:
                        thinking_traces.append(f"[Calendar Agent]: {calendar_result.thinking_process}")

        # Check Solution Agent directly requested
        if (intent in ["SOLUTION", "COMPOUND"] or intent_data.get("solution_needed")) and not solution_result:
            agents_invoked.append("SOLUTION_AGENT")
            prob = intent_data.get("problem") or message
            solution_result = solution_agent.propose_solution(problem_description=prob)
            if solution_result.thinking_process:
                thinking_traces.append(f"[Solution Agent]: {solution_result.thinking_process}")

        # Check Calendar Agent directly requested
        if (intent in ["CALENDAR", "COMPOUND"] or intent_data.get("calendar_needed")) and not calendar_result:
            agents_invoked.append("CALENDAR_AGENT")
            cal_text = intent_data.get("calendar_text") or message
            calendar_result = calendar_agent.extract_and_schedule(
                input_text=cal_text,
                source_type="prompt",
            )
            if calendar_result.thinking_process:
                thinking_traces.append(f"[Calendar Agent]: {calendar_result.thinking_process}")

        # Step 3: Synthesis / Final Reply
        synthesis_prompt = (
            f"Yêu cầu ban đầu của người dùng: {message}\n"
            f"Các Agent đã xử lý: {', '.join(agents_invoked) if agents_invoked else 'Không có'}\n\n"
        )

        if summary_result:
            synthesis_prompt += f"--- KẾT QUẢ TÓM TẮT TÀI LIỆU ---\n{summary_result.full_markdown}\n\n"
        if solution_result:
            synthesis_prompt += f"--- KẾT QUẢ ĐỀ XUẤT GIẢI PHÁP ---\n{solution_result.full_markdown}\n\n"
        if sent_email_result:
            if sent_email_result.success:
                synthesis_prompt += (
                    f"--- KẾT QUẢ GỬI EMAIL GMAIL API (THÀNH CÔNG THỰC TẾ) ---\n"
                    f"- Người nhận: {', '.join(sent_email_result.to)}\n"
                    f"- Tiêu đề: {sent_email_result.subject}\n"
                    f"- Nội dung đã gửi:\n{sent_email_result.body}\n"
                    f"- Mã tin nhắn Gmail (message_id): {sent_email_result.message_id}\n\n"
                )
            else:
                synthesis_prompt += (
                    f"--- KẾT QUẢ GỬI EMAIL GMAIL API (THẤT BẠI) ---\n"
                    f"- Người nhận dự kiến: {', '.join(sent_email_result.to)}\n"
                    f"- Lỗi cụ thể: {sent_email_result.error}\n\n"
                )
        if email_results:
            synthesis_prompt += f"--- KẾT QUẢ QUÉT EMAIL GMAIL ({len(email_results)} email) ---\n"
            for em in email_results:
                synthesis_prompt += f"Email: {em.subject} ({em.sender})\n{em.summary}\n\n"
        if calendar_result and calendar_result.scheduled_events:
            synthesis_prompt += f"--- SỰ KIỆN ĐÃ ĐẶT LỊCH GOOGLE CALENDAR & NHẮC HẸN ---\n"
            for ev in calendar_result.scheduled_events:
                synthesis_prompt += f"- {ev.title}: {ev.start_time} (Nhắc trước {ev.reminder_minutes} phút) -> {ev.status_message}\n"

        synthesis_prompt += (
            "\nHãy tổng hợp thành câu trả lời hoàn chỉnh, mạch lạc, chuyên nghiệp gửi tới người dùng. "
            "Nêu rõ các hành động đã thực hiện và kết quả cụ thể."
        )

        final_res: LLMResponse = chat_with_llm(
            message=synthesis_prompt,
            system_prompt=SYSTEM_ORCHESTRATOR_PROMPT,
            history=history,
            model=self.model,
        )
        if final_res.thought:
            thinking_traces.append(f"[Orchestrator Tổng hợp]: {final_res.thought}")

        return OrchestratorResponse(
            intent=intent,
            reply=final_res.content,
            agents_invoked=list(set(agents_invoked)),
            summary_data=summary_result.__dict__ if summary_result else None,
            solution_data=solution_result.__dict__ if solution_result else None,
            email_data=[e.__dict__ for e in email_results] if email_results else None,
            calendar_data=calendar_result.__dict__ if calendar_result else None,
            thinking_process="\n\n".join(thinking_traces),
        )


orchestrator = AgentOrchestrator()
