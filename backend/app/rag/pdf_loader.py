from dataclasses import dataclass, field
import io
import logging
from pathlib import Path
from typing import List, Optional, Union
import pymupdf as fitz

from app.config import settings
from app.rag.chunker import chunk_text, TextChunk

logger = logging.getLogger(__name__)


@dataclass
class PDFPage:
    page_number: int
    text: str
    has_text: bool = True


@dataclass
class PDFDocument:
    filename: str
    total_pages: int
    metadata: dict
    pages: List[PDFPage]
    full_text: str
    is_scan: bool = False
    file_size_bytes: int = 0
    warning: Optional[str] = None


def _check_pdf_magic_bytes(data: bytes) -> bool:
    """
    Checks if the byte stream contains the standard %PDF- header within the first 1024 bytes.
    """
    header_sample = data[:1024]
    return b"%PDF-" in header_sample


def _ocr_page(page: fitz.Page) -> str:
    """
    Attempts optical character recognition (OCR) on a single PDF page using pytesseract if available.
    """
    try:
        import pytesseract
        from PIL import Image

        # Render page to high-res image pixmap
        pix = page.get_pixmap(dpi=150)
        img_bytes = pix.tobytes("png")
        image = Image.open(io.BytesIO(img_bytes))
        ocr_text = pytesseract.image_to_string(image, lang="vie+eng")
        return "\n".join(line.strip() for line in ocr_text.splitlines() if line.strip())
    except Exception as exc:
        logger.debug(f"OCR not available or failed for page {page.number + 1}: {exc}")
        return ""


def load_pdf(
    source: Union[str, Path, bytes],
    filename: Optional[str] = None,
    ocr_fallback: Optional[bool] = None,
    max_size_mb: Optional[int] = None,
    max_pages: Optional[int] = None,
) -> PDFDocument:
    """
    Loads, validates, and extracts text from a PDF document using PyMuPDF (fitz).
    - Checks MIME magic bytes (%PDF-).
    - Validates file size and page limits.
    - Detects scanned documents (no selectable text layer).
    - Optionally runs OCR fallback if enabled.
    """
    max_mb = max_size_mb if max_size_mb is not None else settings.pdf_max_size_mb
    max_allowed_bytes = max_mb * 1024 * 1024
    max_pgs = max_pages if max_pages is not None else settings.pdf_max_pages
    should_ocr = ocr_fallback if ocr_fallback is not None else settings.pdf_ocr_enabled

    # 1. Read raw bytes and validate file size & magic bytes
    if isinstance(source, bytes):
        raw_bytes = source
        doc_name = filename or "uploaded_document.pdf"
    else:
        path = Path(source)
        if not path.exists():
            raise FileNotFoundError(f"PDF file not found: {path}")
        raw_bytes = path.read_bytes()
        doc_name = filename or path.name

    file_size = len(raw_bytes)
    if file_size == 0:
        raise ValueError("File PDF rỗng (0 bytes).")

    if file_size > max_allowed_bytes:
        raise ValueError(
            f"Kích thước file ({file_size / (1024 * 1024):.2f} MB) vượt quá giới hạn cho phép ({max_mb} MB)."
        )

    if not _check_pdf_magic_bytes(raw_bytes):
        raise ValueError("Định dạng file không hợp lệ: Không tìm thấy chữ ký nhận dạng PDF (%PDF-).")

    # 2. Open document with PyMuPDF
    try:
        doc = fitz.open(stream=raw_bytes, filetype="pdf")
    except Exception as exc:
        raise ValueError(f"Không thể mở file PDF: File bị hỏng hoặc mã hóa không hợp lệ ({exc}).")

    try:
        total_pages = len(doc)
        if total_pages == 0:
            raise ValueError("File PDF không chứa trang nào.")

        if total_pages > max_pgs:
            raise ValueError(
                f"Số trang ({total_pages}) vượt quá giới hạn tối đa cho phép ({max_pgs} trang)."
            )

        pages: List[PDFPage] = []
        full_text_parts: List[str] = []
        total_extracted_chars = 0

        # 3. Extract text per page
        for page_idx in range(total_pages):
            page = doc[page_idx]
            text = page.get_text("text") or ""
            cleaned_text = "\n".join(
                line.strip() for line in text.splitlines() if line.strip()
            )

            has_text = len(cleaned_text) > 0
            total_extracted_chars += len(cleaned_text)

            pages.append(PDFPage(page_number=page_idx + 1, text=cleaned_text, has_text=has_text))
            if cleaned_text:
                full_text_parts.append(f"--- Trang {page_idx + 1} ---\n{cleaned_text}")

        # 4. Detect scanned PDF (average characters per page < 30)
        avg_chars_per_page = total_extracted_chars / total_pages
        is_scan = avg_chars_per_page < 30
        warning = None

        if is_scan:
            if should_ocr:
                logger.info(f"Phát hiện PDF scan '{doc_name}'. Đang tiến hành OCR fallback...")
                ocr_text_parts: List[str] = []
                ocr_success = False

                for page_idx in range(total_pages):
                    page = doc[page_idx]
                    ocr_result = _ocr_page(page)
                    if ocr_result:
                        ocr_success = True
                        pages[page_idx].text = ocr_result
                        pages[page_idx].has_text = True
                        ocr_text_parts.append(f"--- Trang {page_idx + 1} (OCR) ---\n{ocr_result}")

                if ocr_success:
                    full_text_parts = ocr_text_parts
                    warning = "Tài liệu được xử lý bằng OCR do không có lớp văn bản gốc."
                else:
                    warning = (
                        "Phát hiện tài liệu scan/ảnh nhưng OCR chưa trích xuất được văn bản (hãy kiểm tra cài đặt Tesseract)."
                    )
            else:
                warning = (
                    "Cảnh báo: Đây là tài liệu scan hoặc ảnh chụp (không có lớp text layer selectable). "
                    "Hãy bật tùy chọn OCR nếu cần trích xuất nội dung ảnh."
                )

        full_text = "\n\n".join(full_text_parts)
        meta = doc.metadata or {}

        return PDFDocument(
            filename=doc_name,
            total_pages=total_pages,
            metadata=meta,
            pages=pages,
            full_text=full_text,
            is_scan=is_scan,
            file_size_bytes=file_size,
            warning=warning,
        )
    finally:
        doc.close()


def get_pdf_chunks(
    doc: PDFDocument,
    max_chunk_tokens: int = 1500,
    overlap_tokens: int = 200,
) -> List[TextChunk]:
    """
    Splits the PDF document's extracted text into token-sized chunks suitable for local LLM contexts.
    """
    if not doc.full_text.strip():
        return []
    return chunk_text(
        text=doc.full_text,
        max_chunk_tokens=max_chunk_tokens,
        overlap_tokens=overlap_tokens,
    )


# Alias for explicit byte loading
load_pdf_from_bytes = load_pdf
