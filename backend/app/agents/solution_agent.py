from dataclasses import dataclass
import logging
import re
import time
from typing import List, Optional

from app.llm.ollama import chat_with_llm_safe, LLMResponse
from app.llm.prompts import SYSTEM_SOLUTION_PROMPT

logger = logging.getLogger(__name__)


@dataclass
class SolutionActionItem:
    task: str
    owner: str
    timeline: str


@dataclass
class SolutionResult:
    problem_statement: str
    root_cause_analysis: str
    immediate_solutions: List[str]
    mid_term_solutions: List[str]
    long_term_solutions: List[str]
    risk_assessment: str
    action_items: List[SolutionActionItem]
    full_markdown: str
    thinking_process: str
    execution_time_seconds: float = 0.0


def parse_solution_markdown(text: str) -> dict:
    """
    Parses sections from the standard solution proposal markdown.
    """
    data = {
        "root_cause": "",
        "immediate": [],
        "mid_term": [],
        "long_term": [],
        "risks": "",
        "action_items": [],
    }

    if not text:
        return data

    # Root Cause
    rc_match = re.search(
        r"(?:PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ|Root Cause Analysis).*?\n(.*?)(?=\n#{1,3}|\n\d+\.|\Z)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if rc_match:
        data["root_cause"] = rc_match.group(1).strip()

    # Immediate solutions
    imm_match = re.search(
        r"(?:Cấp 1 - Ngắn hạn|Ngắn hạn|Immediate).*?\n(.*?)(?=\n#{1,3}|Cấp 2|\Z)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if imm_match:
        data["immediate"] = [
            line.strip(" -*•\t")
            for line in imm_match.group(1).splitlines()
            if line.strip(" -*•\t") and not line.strip().startswith("#")
        ]

    # Mid term
    mid_match = re.search(
        r"(?:Cấp 2 - Trung hạn|Trung hạn|Mid-term).*?\n(.*?)(?=\n#{1,3}|Cấp 3|\Z)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if mid_match:
        data["mid_term"] = [
            line.strip(" -*•\t")
            for line in mid_match.group(1).splitlines()
            if line.strip(" -*•\t") and not line.strip().startswith("#")
        ]

    # Long term
    long_match = re.search(
        r"(?:Cấp 3 - Dài hạn|Dài hạn|Long-term).*?\n(.*?)(?=\n#{1,3}|ĐÁNG GIÁ|KẾ HOẠCH|\Z)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if long_match:
        data["long_term"] = [
            line.strip(" -*•\t")
            for line in long_match.group(1).splitlines()
            if line.strip(" -*•\t") and not line.strip().startswith("#")
        ]

    # Risks
    risk_match = re.search(
        r"(?:ĐÁNG GIÁ TÍNH KHẢ THI & RỦI RO|Risk & Feasibility).*?\n(.*?)(?=\n#{1,3}|KẾ HOẠCH|\Z)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if risk_match:
        data["risks"] = risk_match.group(1).strip()

    # Action items lines
    action_match = re.search(
        r"(?:KẾ HOẠCH HÀNH ĐỘNG|Action Plan).*?\n(.*)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if action_match:
        for line in action_match.group(1).splitlines():
            cleaned = line.strip(" -*•\t|")
            if cleaned and not cleaned.lower().startswith("nhiệm vụ") and not cleaned.startswith("---"):
                data["action_items"].append(
                    SolutionActionItem(task=cleaned, owner="Đội ngũ phụ trách", timeline="Trong kế hoạch")
                )

    return data


class SolutionProposalAgent:
    """
    Agent responsible for generating structured, multi-tier solutions
    for technical, operational, and business problems.
    Features:
    - Safe LLM calls with timeout and retry.
    - Timing logging.
    """

    def __init__(self, model: Optional[str] = None):
        self.model = model

    def propose_solution(
        self,
        problem_description: str,
        context: Optional[str] = None,
        constraints: Optional[str] = None,
    ) -> SolutionResult:
        start_t = time.perf_counter()
        logger.info(f"Bắt đầu đề xuất giải pháp cho vấn đề: '{problem_description[:80]}...'")

        context_str = f"\n\nBối cảnh bổ sung / Dữ liệu liên quan:\n{context}" if context else ""
        constraints_str = f"\n\nRàng buộc đặc thù (ngân sách, thời gian, công nghệ):\n{constraints}" if constraints else ""

        prompt = (
            f"Vấn đề cần giải quyết:\n{problem_description}"
            f"{context_str}"
            f"{constraints_str}\n\n"
            f"Hãy phân tích và đưa ra giải pháp toàn diện theo đúng cấu trúc 4 bước chuẩn."
        )

        response: LLMResponse = chat_with_llm_safe(
            message=prompt,
            system_prompt=SYSTEM_SOLUTION_PROMPT,
            model=self.model,
            temperature=0.4,
            timeout_secs=180.0,
        )

        elapsed = time.perf_counter() - start_t
        logger.info(f"Đề xuất giải pháp hoàn tất trong {elapsed:.2f}s.")

        parsed = parse_solution_markdown(response.content)

        return SolutionResult(
            problem_statement=problem_description,
            root_cause_analysis=parsed["root_cause"] or "Đã phân tích trong báo cáo chi tiết",
            immediate_solutions=parsed["immediate"],
            mid_term_solutions=parsed["mid_term"],
            long_term_solutions=parsed["long_term"],
            risk_assessment=parsed["risks"] or "Đã đánh giá trong báo cáo chi tiết",
            action_items=parsed["action_items"],
            full_markdown=response.content,
            thinking_process=response.thought,
            execution_time_seconds=elapsed,
        )


solution_agent = SolutionProposalAgent()
