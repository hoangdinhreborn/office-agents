from dataclasses import dataclass
import logging
from pathlib import Path
import re
import time
from typing import List, Optional, Union

from app.llm.ollama import chat_with_llm_safe, LLMResponse
from app.llm.prompts import SYSTEM_SUMMARY_PROMPT
from app.rag.chunker import chunk_text, estimate_tokens
from app.rag.pdf_loader import load_pdf

logger = logging.getLogger(__name__)


@dataclass
class SummaryResult:
    executive_summary: str
    key_points: List[str]
    commitments: List[str]
    deadlines: List[str]
    full_markdown: str
    thinking_process: str
    source_filename: Optional[str] = None
    total_pages: Optional[int] = None
    execution_time_seconds: float = 0.0


def parse_summary_sections(markdown_text: str) -> dict:
    """
    Parses sections from the standard summary markdown output.
    """
    sections = {
        "executive_summary": "",
        "key_points": [],
        "commitments": [],
        "deadlines": [],
    }

    if not markdown_text:
        return sections

    # Extract Executive summary
    exec_match = re.search(
        r"(?:TỔNG QUAN ĐIỀU HÀNH|Executive Summary).*?\n(.*?)(?=\n#{1,3}|\n\d+\.|\Z)",
        markdown_text,
        re.IGNORECASE | re.DOTALL,
    )
    if exec_match:
        sections["executive_summary"] = exec_match.group(1).strip()

    # Extract Key points (bullets)
    key_match = re.search(
        r"(?:CÁC LUẬN ĐIỂM CHÍNH|Key Insights).*?\n(.*?)(?=\n#{1,3}|\n\d+\.|\Z)",
        markdown_text,
        re.IGNORECASE | re.DOTALL,
    )
    if key_match:
        sections["key_points"] = [
            line.strip(" -*•\t")
            for line in key_match.group(1).splitlines()
            if line.strip(" -*•\t")
        ]

    # Extract Commitments
    commit_match = re.search(
        r"(?:QUYẾT ĐỊNH & CAM KẾT|Decisions & Commitments).*?\n(.*?)(?=\n#{1,3}|\n\d+\.|\Z)",
        markdown_text,
        re.IGNORECASE | re.DOTALL,
    )
    if commit_match:
        sections["commitments"] = [
            line.strip(" -*•\t")
            for line in commit_match.group(1).splitlines()
            if line.strip(" -*•\t")
        ]

    # Extract Deadlines
    dl_match = re.search(
        r"(?:CÁC MỐC THỜI GIAN & HẠN CHÓT|Deadlines & Milestones).*?\n(.*?)(?=\n#{1,3}|\n\d+\.|\Z)",
        markdown_text,
        re.IGNORECASE | re.DOTALL,
    )
    if dl_match:
        sections["deadlines"] = [
            line.strip(" -*•\t")
            for line in dl_match.group(1).splitlines()
            if line.strip(" -*•\t")
        ]

    return sections


class DocumentSummaryAgent:
    """
    Agent responsible for summarizing text and PDF documents with DeepSeek-R1.
    Features:
    - Map-Reduce for large documents exceeding local context limit.
    - Timeout and retry safety for LLM requests.
    - Running time profiling.
    """

    def __init__(self, model: Optional[str] = None):
        self.model = model

    def summarize_text(self, text: str, document_title: Optional[str] = None) -> SummaryResult:
        start_t = time.perf_counter()
        if not text or not text.strip():
            return SummaryResult(
                executive_summary="Không có nội dung văn bản để tóm tắt.",
                key_points=[],
                commitments=[],
                deadlines=[],
                full_markdown="Không có nội dung văn bản để tóm tắt.",
                thinking_process="",
                source_filename=document_title,
                execution_time_seconds=0.0,
            )

        tokens = estimate_tokens(text)
        title_prefix = f"Tài liệu: '{document_title}'\n\n" if document_title else ""
        logger.info(f"Bắt đầu tóm tắt '{document_title or 'văn bản'}' (~{tokens} tokens)...")

        # Case 1: Direct summary if within standard prompt budget
        if tokens <= 3500:
            prompt = (
                f"{title_prefix}Hãy đọc kỹ toàn bộ nội dung văn bản dưới đây và tóm tắt theo đúng cấu trúc chuẩn:\n\n"
                f"```text\n{text}\n```"
            )
            response: LLMResponse = chat_with_llm_safe(
                message=prompt,
                system_prompt=SYSTEM_SUMMARY_PROMPT,
                model=self.model,
                timeout_secs=180.0,
            )
            elapsed = time.perf_counter() - start_t
            logger.info(f"Tóm tắt trực tiếp hoàn thành trong {elapsed:.2f}s.")

            parsed = parse_summary_sections(response.content)
            return SummaryResult(
                executive_summary=parsed["executive_summary"] or response.content,
                key_points=parsed["key_points"],
                commitments=parsed["commitments"],
                deadlines=parsed["deadlines"],
                full_markdown=response.content,
                thinking_process=response.thought,
                source_filename=document_title,
                execution_time_seconds=elapsed,
            )

        # Case 2: Map-Reduce for long documents
        logger.info(f"Tài liệu dài ({tokens} tokens) -> Áp dụng quy trình Map-Reduce...")
        chunks = chunk_text(text, max_chunk_tokens=2500, overlap_tokens=200)
        chunk_summaries: List[str] = []
        accumulated_thoughts: List[str] = []

        for idx, chunk in enumerate(chunks):
            map_t0 = time.perf_counter()
            map_prompt = (
                f"Hãy tóm tắt ngắn gọn các luận điểm chính, thỏa thuận và hạn chót trong phần {chunk.chunk_index + 1} này:\n\n"
                f"{chunk.text}"
            )
            map_res = chat_with_llm_safe(
                message=map_prompt,
                system_prompt="Bạn là trợ lý trích xuất điểm chính của phân đoạn văn bản.",
                model=self.model,
                timeout_secs=120.0,
            )
            map_elapsed = time.perf_counter() - map_t0
            logger.info(f"Đoạn {idx + 1}/{len(chunks)} tóm tắt xong trong {map_elapsed:.2f}s.")

            if map_res.thought:
                accumulated_thoughts.append(f"[Đoạn {chunk.chunk_index + 1}]: {map_res.thought}")
            chunk_summaries.append(f"### Điểm chính phần {chunk.chunk_index + 1}:\n{map_res.content}")

        # Reduce stage
        reduce_input = "\n\n".join(chunk_summaries)
        reduce_prompt = (
            f"{title_prefix}Dưới đây là tóm tắt từng phần của tài liệu dài. Hãy tổng hợp lại thành một Báo Cáo Tóm Tắt Hoàn Chỉnh "
            f"theo cấu trúc 4 phần chuẩn:\n\n{reduce_input}"
        )
        reduce_t0 = time.perf_counter()
        final_res = chat_with_llm_safe(
            message=reduce_prompt,
            system_prompt=SYSTEM_SUMMARY_PROMPT,
            model=self.model,
            timeout_secs=180.0,
        )
        reduce_elapsed = time.perf_counter() - reduce_t0
        total_elapsed = time.perf_counter() - start_t
        logger.info(f"Tổng hợp Map-Reduce hoàn tất trong {reduce_elapsed:.2f}s (tổng thời gian: {total_elapsed:.2f}s).")

        all_thoughts = "\n\n".join(accumulated_thoughts + [f"[Tổng hợp cuối]: {final_res.thought}"])
        parsed = parse_summary_sections(final_res.content)

        return SummaryResult(
            executive_summary=parsed["executive_summary"] or final_res.content,
            key_points=parsed["key_points"],
            commitments=parsed["commitments"],
            deadlines=parsed["deadlines"],
            full_markdown=final_res.content,
            thinking_process=all_thoughts,
            source_filename=document_title,
            execution_time_seconds=total_elapsed,
        )

    def summarize_pdf(
        self,
        source: Union[str, Path, bytes],
        filename: Optional[str] = None,
    ) -> SummaryResult:
        """
        Loads and summarizes a PDF document.
        Detects scanned documents and injects appropriate guidance.
        """
        pdf_doc = load_pdf(source=source, filename=filename)

        if pdf_doc.is_scan and not pdf_doc.full_text.strip():
            msg = (
                f"Tài liệu '{pdf_doc.filename}' ({pdf_doc.total_pages} trang) là bản scan hoặc hình ảnh "
                f"chưa có lớp văn bản số. {pdf_doc.warning or ''}"
            )
            return SummaryResult(
                executive_summary=msg,
                key_points=[],
                commitments=[],
                deadlines=[],
                full_markdown=msg,
                thinking_process="Phát hiện tài liệu dạng scan không có text layer.",
                source_filename=pdf_doc.filename,
                total_pages=pdf_doc.total_pages,
                execution_time_seconds=0.0,
            )

        result = self.summarize_text(text=pdf_doc.full_text, document_title=pdf_doc.filename)
        result.total_pages = pdf_doc.total_pages
        result.source_filename = pdf_doc.filename
        return result


summary_agent = DocumentSummaryAgent()
