from datetime import datetime
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import pymupdf as fitz
from zoneinfo import ZoneInfo

from app.config import settings

logger = logging.getLogger(__name__)
VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def _find_vietnamese_font() -> Optional[str]:
    """Finds a TrueType font capable of rendering Vietnamese UTF-8 glyphs."""
    candidates = [
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/times.ttf",
        "C:/Windows/Fonts/calibri.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


class DailyDigestPDFGenerator:
    """
    Generates standardized, executive A4 PDF reports summarizing daily emails,
    categorized by submissions, inquiries, notices, and urgent tasks.
    Uses PyMuPDF (fitz) with clean UTF-8 Vietnamese font rendering and auto-pagination.
    """

    def __init__(self):
        self.output_dir = Path("data/documents")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.font_path = _find_vietnamese_font()

    def generate_digest_pdf(
        self,
        target_date: str,
        digest_data: Dict[str, Any],
        output_filename: Optional[str] = None,
    ) -> Path:
        """
        Builds the Daily Email Digest PDF and returns the saved file Path.
        """
        doc = fitz.open()
        font_name = "vnfont"

        def _setup_page(p: fitz.Page) -> None:
            if self.font_path:
                try:
                    p.insert_font(fontname=font_name, fontfile=self.font_path)
                except Exception as exc:
                    logger.debug(f"insert_font error: {exc}")

        # Page layout constants (A4 is 595 x 842 points)
        PAGE_WIDTH = 595.0
        PAGE_HEIGHT = 842.0
        MARGIN_LEFT = 40.0
        MARGIN_RIGHT = 555.0
        CONTENT_WIDTH = MARGIN_RIGHT - MARGIN_LEFT

        page = doc.new_page(width=PAGE_WIDTH, height=PAGE_HEIGHT)
        _setup_page(page)

        total_emails = digest_data.get("total_emails", 0)
        categories = digest_data.get("categories", {})
        executive_summary = digest_data.get("executive_summary", "Không có tóm tắt.")
        action_items = digest_data.get("action_items", [])

        # 1. Header Banner
        page.draw_rect(fitz.Rect(0, 0, PAGE_WIDTH, 75), color=None, fill=(0.06, 0.09, 0.16))  # #0F172A

        page.insert_text(
            (MARGIN_LEFT, 32),
            "BÁO CÁO TỔNG HỢP EMAIL TRONG NGÀY",
            fontname=font_name if self.font_path else "helv",
            fontsize=16,
            color=(1.0, 1.0, 1.0),
        )
        page.insert_text(
            (MARGIN_LEFT, 54),
            f"Ngày báo cáo: {target_date}  |  Tổng số email xử lý: {total_emails}  |  Xuất báo cáo lúc: {datetime.now(tz=VN_TZ).strftime('%H:%M:%S %d/%m/%Y')}",
            fontname=font_name if self.font_path else "helv",
            fontsize=9.5,
            color=(0.58, 0.65, 0.75),
        )

        curr_y = 95.0

        def _check_page_break(needed_height: float) -> fitz.Page:
            nonlocal page, curr_y
            if curr_y + needed_height > PAGE_HEIGHT - 50:
                # Add footer to current page
                page.insert_text(
                    (MARGIN_LEFT, PAGE_HEIGHT - 25),
                    "Local Multi-Agent AI Assistant  •  Báo cáo tự động On-Premise",
                    fontname=font_name if self.font_path else "helv",
                    fontsize=8,
                    color=(0.6, 0.6, 0.6),
                )
                page = doc.new_page(width=PAGE_WIDTH, height=PAGE_HEIGHT)
                _setup_page(page)
                # Small top header on continuation pages
                page.draw_rect(fitz.Rect(0, 0, PAGE_WIDTH, 35), color=None, fill=(0.06, 0.09, 0.16))
                page.insert_text(
                    (MARGIN_LEFT, 22),
                    f"BÁO CÁO TỔNG HỢP EMAIL TRONG NGÀY ({target_date}) - TIẾP THEO",
                    fontname=font_name if self.font_path else "helv",
                    fontsize=10,
                    color=(1.0, 1.0, 1.0),
                )
                curr_y = 55.0
            return page

        # 2. Category Statistics Summary Box
        page = _check_page_break(70)
        page.draw_rect(
            fitz.Rect(MARGIN_LEFT, curr_y, MARGIN_RIGHT, curr_y + 45),
            color=(0.8, 0.85, 0.9),
            fill=(0.95, 0.97, 1.0),
        )

        stats_items = []
        for cat_name, cat_emails in categories.items():
            stats_items.append(f"{cat_name}: {len(cat_emails)}")
        stats_str = "   |   ".join(stats_items) if stats_items else "Chưa có email được phân loại"

        page.insert_text(
            (MARGIN_LEFT + 12, curr_y + 18),
            "THỐNG KÊ PHÂN LOẠI EMAIL:",
            fontname=font_name if self.font_path else "helv",
            fontsize=9.5,
            color=(0.1, 0.25, 0.5),
        )
        page.insert_text(
            (MARGIN_LEFT + 12, curr_y + 34),
            stats_str,
            fontname=font_name if self.font_path else "helv",
            fontsize=9,
            color=(0.2, 0.2, 0.2),
        )
        curr_y += 60.0

        # 3. Executive Summary Box
        page = _check_page_break(80)
        page.insert_text(
            (MARGIN_LEFT, curr_y),
            "📌 TỔNG QUAN TÌNH HÌNH TRONG NGÀY (EXECUTIVE OVERVIEW)",
            fontname=font_name if self.font_path else "helv",
            fontsize=11,
            color=(0.08, 0.15, 0.3),
        )
        curr_y += 14.0

        # Draw textbox for executive summary
        summary_lines = executive_summary.split("\n")
        for line in summary_lines:
            line_str = line.strip()
            if not line_str:
                curr_y += 6
                continue
            page = _check_page_break(18)
            page.insert_text(
                (MARGIN_LEFT + 8, curr_y),
                line_str[:110],
                fontname=font_name if self.font_path else "helv",
                fontsize=9,
                color=(0.15, 0.15, 0.15),
            )
            curr_y += 14.0

        curr_y += 10.0

        # 4. Detailed Email Groups
        cat_colors = {
            "Nộp bài": ((0.1, 0.4, 0.8), (0.9, 0.95, 1.0)),
            "Khẩn cấp": ((0.8, 0.15, 0.15), (1.0, 0.92, 0.92)),
            "Học vụ": ((0.1, 0.6, 0.4), (0.92, 0.98, 0.94)),
            "Thắc mắc": ((0.7, 0.45, 0.05), (1.0, 0.97, 0.9)),
            "Công việc": ((0.4, 0.2, 0.7), (0.95, 0.92, 1.0)),
            "Khác": ((0.3, 0.3, 0.3), (0.94, 0.94, 0.94)),
        }

        for cat_name, cat_emails in categories.items():
            if not cat_emails:
                continue

            page = _check_page_break(40)
            fg_color, bg_color = cat_colors.get(cat_name, ((0.2, 0.2, 0.2), (0.95, 0.95, 0.95)))

            # Category Header
            page.draw_rect(
                fitz.Rect(MARGIN_LEFT, curr_y, MARGIN_RIGHT, curr_y + 24),
                color=fg_color,
                fill=bg_color,
            )
            page.insert_text(
                (MARGIN_LEFT + 10, curr_y + 16),
                f"📂 {cat_name.upper()} ({len(cat_emails)} email)",
                fontname=font_name if self.font_path else "helv",
                fontsize=10.5,
                color=fg_color,
            )
            curr_y += 32.0

            # List emails in this category
            for idx, em in enumerate(cat_emails, 1):
                needed_h = 36.0
                if em.get("pdf_summary"):
                    needed_h += 24.0

                page = _check_page_break(needed_h)

                subj = em.get("subject", "(Không có tiêu đề)")
                sender = em.get("sender_name") or em.get("sender_email") or "Người gửi ẩn danh"
                r_time = em.get("received_time", "")
                urgency = em.get("urgency", "Trung bình")
                has_pdf = em.get("pdf_filename") or em.get("has_attachments")

                # Email row background
                page.draw_rect(
                    fitz.Rect(MARGIN_LEFT + 5, curr_y, MARGIN_RIGHT - 5, curr_y + needed_h - 4),
                    color=(0.88, 0.9, 0.92),
                    fill=(0.98, 0.99, 1.0),
                )

                # Subject and Sender line
                pdf_tag = f" [📄 PDF: {em.get('pdf_filename') or 'Đính kèm'}]" if has_pdf else ""
                urg_tag = f" [{urgency}]" if urgency == "Khẩn cấp" else ""
                title_line = f"{idx}. {subj[:65]}{pdf_tag}{urg_tag}"

                page.insert_text(
                    (MARGIN_LEFT + 12, curr_y + 13),
                    title_line,
                    fontname=font_name if self.font_path else "helv",
                    fontsize=9,
                    color=(0.1, 0.1, 0.1),
                )

                sub_line = f"Người gửi: {sender[:40]}   |   Thời gian: {r_time[:25]}"
                page.insert_text(
                    (MARGIN_LEFT + 22, curr_y + 25),
                    sub_line,
                    fontname=font_name if self.font_path else "helv",
                    fontsize=8,
                    color=(0.4, 0.45, 0.5),
                )

                # PDF attachment summary snippet if present
                if em.get("pdf_summary"):
                    pdf_snip = f"Tóm tắt file PDF: {em.get('pdf_summary')[:100]}..."
                    page.insert_text(
                        (MARGIN_LEFT + 22, curr_y + 38),
                        pdf_snip,
                        fontname=font_name if self.font_path else "helv",
                        fontsize=7.5,
                        color=(0.2, 0.4, 0.6),
                    )

                curr_y += needed_h + 3.0

            curr_y += 8.0

        # 5. Action Items Section
        if action_items:
            page = _check_page_break(35 + len(action_items) * 16)
            page.draw_rect(
                fitz.Rect(MARGIN_LEFT, curr_y, MARGIN_RIGHT, curr_y + 22),
                color=(0.1, 0.5, 0.3),
                fill=(0.92, 0.98, 0.94),
            )
            page.insert_text(
                (MARGIN_LEFT + 10, curr_y + 15),
                f"✅ DANH SÁCH CÔNG VIỆC CẦN XỬ LÝ TIẾP THEO (ACTION ITEMS - {len(action_items)} mục)",
                fontname=font_name if self.font_path else "helv",
                fontsize=10,
                color=(0.1, 0.4, 0.2),
            )
            curr_y += 28.0

            for act in action_items:
                page = _check_page_break(18)
                page.insert_text(
                    (MARGIN_LEFT + 12, curr_y + 10),
                    f"[  ] {act[:100]}",
                    fontname=font_name if self.font_path else "helv",
                    fontsize=8.5,
                    color=(0.15, 0.15, 0.15),
                )
                curr_y += 16.0

        # Final page footer
        page.insert_text(
            (MARGIN_LEFT, PAGE_HEIGHT - 25),
            f"Trang {len(doc)} / {len(doc)}  •  Local Multi-Agent AI Assistant  •  Báo cáo tự động On-Premise",
            fontname=font_name if self.font_path else "helv",
            fontsize=8,
            color=(0.5, 0.5, 0.5),
        )

        filename = output_filename or f"daily_digest_{target_date.replace('-', '_')}.pdf"
        output_path = self.output_dir / filename
        doc.save(str(output_path))
        doc.close()
        logger.info(f"Đã xuất báo cáo Daily Email Digest PDF tại: {output_path}")
        return output_path


pdf_generator = DailyDigestPDFGenerator()
