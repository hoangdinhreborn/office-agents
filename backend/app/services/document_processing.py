"""Extract once, then persist page-aware context for upload and email ingest."""
from dataclasses import dataclass

from app.agents.summary_agent import SummaryResult, summary_agent
from app.rag.chunker import chunk_with_sources
from app.config import settings
from app.rag.pdf_loader import PDFDocument, load_pdf


@dataclass
class ExtractedPDF:
    pdf: PDFDocument
    pages: list[dict]
    chunks: list[dict]


@dataclass
class ProcessedPDF(ExtractedPDF):
    summary: SummaryResult


def extract_pdf_context(source: bytes, filename: str) -> ExtractedPDF:
    pdf = load_pdf(source=source, filename=filename)
    pages = [
        {"page_number": page.page_number, "text": page.text}
        for page in pdf.pages
    ]
    chunks = [{"chunk_index": part.chunk_index, "page_number": part.source_pages[0] if part.source_pages else 1,
               "page_numbers": list(part.source_pages), "text": part.text}
              for part in chunk_with_sources(pdf.full_text, settings.pdf_chunk_tokens, settings.pdf_chunk_overlap_tokens)]
    return ExtractedPDF(pdf=pdf, pages=pages, chunks=chunks)


def process_pdf_context(source: bytes, filename: str) -> ProcessedPDF:
    extracted = extract_pdf_context(source, filename)
    if not extracted.pdf.full_text.strip():
        raise ValueError(extracted.pdf.warning or "Không trích xuất được văn bản từ PDF.")
    summary = summary_agent.summarize_text(extracted.pdf.full_text, filename)
    summary.total_pages = extracted.pdf.total_pages
    summary.source_filename = filename
    return ProcessedPDF(
        pdf=extracted.pdf, pages=extracted.pages,
        chunks=extracted.chunks, summary=summary,
    )
