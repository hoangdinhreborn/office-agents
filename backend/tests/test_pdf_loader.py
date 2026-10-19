import pytest
import pymupdf
from pathlib import Path
from app.rag.pdf_loader import load_pdf, get_pdf_chunks
from app.rag.chunker import chunk_text, estimate_tokens


def test_pdf_creation_and_loading(tmp_path):
    pdf_path = tmp_path / "sample_contract.pdf"
    doc = pymupdf.open()
    page1 = doc.new_page()
    page1.insert_text(
        (50, 72),
        "HOP DONG KINH TE\nDieu 1: Muc tieu hop tac\nBen A cung cap he thong AI Assistant.\nThoi han: 2026-10-30."
    )
    page2 = doc.new_page()
    page2.insert_text(
        (50, 72),
        "Dieu 2: Dieu khoan thanh toan\nBen B thanh toan dot 1 truoc ngay 15/10/2026.\nHop nghiem thu vao 14:00 ngay 25/10/2026."
    )
    doc.save(str(pdf_path))
    doc.close()

    # Test load_pdf
    pdf_doc = load_pdf(pdf_path)
    assert pdf_doc.total_pages == 2
    assert "HOP DONG KINH TE" in pdf_doc.full_text
    assert "Hop nghiem thu" in pdf_doc.full_text
    assert len(pdf_doc.pages) == 2
    assert pdf_doc.is_scan is False
    assert pdf_doc.file_size_bytes > 0


def test_scan_pdf_detection(tmp_path):
    # Create a PDF without text (blank or image drawing only)
    pdf_path = tmp_path / "scanned_doc.pdf"
    doc = pymupdf.open()
    page = doc.new_page()
    # Draw a rectangle mimicking an image, no text
    page.draw_rect(pymupdf.Rect(50, 50, 200, 200), fill=(0.8, 0.8, 0.8))
    doc.save(str(pdf_path))
    doc.close()

    pdf_doc = load_pdf(pdf_path)
    assert pdf_doc.total_pages == 1
    assert pdf_doc.is_scan is True
    assert pdf_doc.warning is not None
    assert "scan" in pdf_doc.warning.lower()


def test_multipage_pdf(tmp_path):
    pdf_path = tmp_path / "multipage_report.pdf"
    doc = pymupdf.open()
    for i in range(5):
        page = doc.new_page()
        page.insert_text((50, 72), f"Bao cao tien do quy - Trang {i + 1}\nNoi dung chi tiet cho hang muc thu {i + 1} du an AI.")
    doc.save(str(pdf_path))
    doc.close()

    pdf_doc = load_pdf(pdf_path)
    assert pdf_doc.total_pages == 5
    assert len(pdf_doc.pages) == 5
    assert pdf_doc.is_scan is False
    assert "Trang 3" in pdf_doc.full_text
    assert "Trang 5" in pdf_doc.full_text


def test_corrupted_pdf_invalid_bytes():
    corrupted_data = b"This is not a pdf file, just some random text."
    with pytest.raises(ValueError, match="chữ ký nhận dạng PDF"):
        load_pdf(corrupted_data)


def test_empty_pdf_bytes():
    with pytest.raises(ValueError, match="File PDF rỗng"):
        load_pdf(b"")


def test_oversized_pdf(tmp_path):
    pdf_path = tmp_path / "normal.pdf"
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 72), "Sample text content")
    doc.save(str(pdf_path))
    doc.close()

    # Pass max_size_mb=0 to force file size limit trigger
    with pytest.raises(ValueError, match="vượt quá giới hạn cho phép"):
        load_pdf(pdf_path, max_size_mb=0)


def test_bytes_input(tmp_path):
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 72), "Van ban doc truc tiep tu byte stream.")
    pdf_bytes = doc.tobytes()
    doc.close()

    pdf_doc = load_pdf(pdf_bytes, filename="streamed.pdf")
    assert pdf_doc.filename == "streamed.pdf"
    assert "Van ban doc truc tiep" in pdf_doc.full_text
    assert pdf_doc.is_scan is False


def test_pdf_chunking_integration(tmp_path):
    doc = pymupdf.open()
    for i in range(5):
        page = doc.new_page()
        page.insert_textbox(
            pymupdf.Rect(50, 50, 500, 700),
            f"Doan van {i}: " + ("Du lieu chi tiet cho kiem thu chunking dai. " * 10)
        )
    pdf_bytes = doc.tobytes()
    doc.close()

    pdf_doc = load_pdf(pdf_bytes)
    chunks = get_pdf_chunks(pdf_doc, max_chunk_tokens=50, overlap_tokens=10)
    assert len(chunks) >= 2
    assert all(c.token_estimate <= 100 for c in chunks)


def test_chunking():
    sample_text = (
        "Đoạn văn thứ nhất bàn về kiến trúc hệ thống AI local.\n\n"
        "Đoạn văn thứ hai mô tả Agent tóm tắt văn bản PDF và trích xuất hạn chót.\n\n"
        "Đoạn văn thứ ba trình bày Agent đề xuất giải pháp xử lý sự cố."
    )
    chunks = chunk_text(sample_text, max_chunk_tokens=50, overlap_tokens=10)
    assert len(chunks) >= 1
    assert any("AI local" in ch.text for ch in chunks)
