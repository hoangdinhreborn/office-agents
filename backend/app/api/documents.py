import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool
from uuid import uuid4
from app.services.projects import owned_query, project_scope, require_project
from app.config import resolve_path, settings
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.agents.summary_agent import summary_agent
from app.services.document_processing import process_pdf_context
from app.database.database import get_db
from app.database.models import DocumentRecord

router = APIRouter(prefix="/api/documents", tags=["Documents & PDF"])


class SummarizeTextRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    text: str = Field(min_length=1, max_length=2_000_000)
    title: str = Field(default="Văn bản nhập trực tiếp", min_length=1, max_length=255)


class DocumentPage(BaseModel):
    page_number: int = Field(ge=1)
    text: str


class DocumentResponse(BaseModel):
    id: Optional[str] = None
    filename: str
    total_pages: Optional[int] = 1
    executive_summary: str
    key_points: List[str]
    commitments: List[str]
    deadlines: List[str]
    full_markdown: str
    thinking_process: str
    is_ocr: bool = False
    is_map_reduce: bool = False
    processing_warning: str | None = None
    pages: list[DocumentPage] = Field(default_factory=list)
    file_available: bool = False


@router.post("/summarize-pdf", response_model=DocumentResponse)
async def summarize_pdf_endpoint(
    file: UploadFile = File(...),
    project_id: str = Depends(project_scope), db: Session = Depends(get_db),
) -> DocumentResponse:
    """Persist original PDF and extracted context after a successful summary."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận định dạng file chuẩn là PDF.")

    content = await file.read(settings.pdf_max_size_mb * 1024 * 1024 + 1)
    if not content:
        raise HTTPException(status_code=400, detail="File PDF tải lên rỗng.")

    if len(content) > settings.pdf_max_size_mb * 1024 * 1024:
        raise HTTPException(413, "File PDF vượt dung lượng cho phép.")
    if not content.startswith(b"%PDF-"):
        raise HTTPException(400, "Nội dung không phải PDF hợp lệ.")

    try:
        processed = await run_in_threadpool(process_pdf_context, source=content, filename=Path(file.filename).name)
        summary_res = processed.summary
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    require_project(db, project_id)
    document_id = str(uuid4())
    save_path = resolve_path(f"data/documents/{project_id}/{document_id}.pdf")
    save_path.parent.mkdir(parents=True, exist_ok=True)
    save_path.write_bytes(content)

    # Save record to DB
    doc_rec = DocumentRecord(
        project_id=project_id,
        id=document_id, file_path=str(save_path), file_size=len(content),
        filename=Path(file.filename).name,
        source_text=processed.pdf.full_text,
        pages_json=json.dumps(processed.pages, ensure_ascii=False),
        chunks_json=json.dumps(processed.chunks, ensure_ascii=False),
        is_ocr=processed.pdf.ocr_used,
        is_map_reduce=summary_res.is_map_reduce,
        processing_warning=processed.pdf.warning,
        total_pages=summary_res.total_pages or 1,
        executive_summary=summary_res.executive_summary,
        full_markdown=summary_res.full_markdown,
    )
    doc_rec.set_deadlines(summary_res.deadlines)
    db.add(doc_rec)
    try:
        db.commit()
    except Exception:
        db.rollback()
        save_path.unlink(missing_ok=True)
        raise

    # Meetings may have no deadline; inspect the saved source independently of
    # the summary's deadline list. A failed extraction must preserve the PDF.
    from app.services.calendar_workflow import extract_drafts
    try:
        extract_drafts(db, project_id, doc_rec.id)
    except Exception:
        db.rollback()
        doc_rec.processing_warning = ((doc_rec.processing_warning or "") + " Chưa trích xuất được nháp lịch; có thể thử lại ở tab Đặt lịch.").strip()
        db.commit()

    return DocumentResponse(
        id=doc_rec.id,
        is_ocr=processed.pdf.ocr_used,
        is_map_reduce=summary_res.is_map_reduce,
        processing_warning=doc_rec.processing_warning,
        pages=processed.pages, file_available=True,
        filename=summary_res.source_filename or file.filename,
        total_pages=summary_res.total_pages,
        executive_summary=summary_res.executive_summary,
        key_points=summary_res.key_points,
        commitments=summary_res.commitments,
        deadlines=summary_res.deadlines,
        full_markdown=summary_res.full_markdown,
        thinking_process=summary_res.thinking_process,
    )


@router.post("/summarize-text", response_model=DocumentResponse)
def summarize_text_endpoint(
    req: SummarizeTextRequest,
    project_id: str = Depends(project_scope), db: Session = Depends(get_db),
) -> DocumentResponse:
    """
    Summarizes raw text according to executive standard.
    """
    if not req.text.strip():
        raise HTTPException(422, "Văn bản tóm tắt không được để trống.")
    summary_res = summary_agent.summarize_text(text=req.text, document_title=req.title)

    doc_rec = DocumentRecord(
        project_id=project_id,
        filename=req.title,
        total_pages=1,
        source_text=req.text, is_map_reduce=summary_res.is_map_reduce,
        pages_json=json.dumps([{ "page_number": 1, "text": req.text }], ensure_ascii=False),
        executive_summary=summary_res.executive_summary,
        full_markdown=summary_res.full_markdown,
    )
    doc_rec.set_deadlines(summary_res.deadlines)
    db.add(doc_rec)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return DocumentResponse(
        id=doc_rec.id,
        is_map_reduce=summary_res.is_map_reduce,
        pages=[DocumentPage(page_number=1, text=req.text)],
        filename=req.title,
        total_pages=1,
        executive_summary=summary_res.executive_summary,
        key_points=summary_res.key_points,
        commitments=summary_res.commitments,
        deadlines=summary_res.deadlines,
        full_markdown=summary_res.full_markdown,
        thinking_process=summary_res.thinking_process,
    )


@router.get("", response_model=List[Dict[str, Any]])
def list_documents(project_id: str = Depends(project_scope), db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """
    Lists previously processed documents.
    """
    docs = owned_query(db, DocumentRecord, project_id).order_by(DocumentRecord.created_at.desc()).all()
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "total_pages": d.total_pages,
            "executive_summary": d.executive_summary,
            "full_markdown": d.full_markdown,
            "file_size": d.file_size,
            "file_available": bool(d.file_path),
            "is_ocr": bool(d.is_ocr),
            "is_map_reduce": bool(d.is_map_reduce),
            "processing_warning": d.processing_warning,
            "pages": json.loads(d.pages_json or "[]"),
            "deadlines": d.get_deadlines(),
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }
        for d in docs
    ]


@router.get("/{document_id}/file")
def get_document_file(document_id: str, project_id: str = Depends(project_scope), db: Session = Depends(get_db)):
    doc = owned_query(db, DocumentRecord, project_id).filter_by(id=document_id).first()
    if not doc or not doc.file_path:
        raise HTTPException(404, "Không tìm thấy file PDF trong dự án.")
    path = Path(doc.file_path).resolve()
    if not path.is_relative_to(resolve_path("data/documents").resolve()) or not path.is_file():
        raise HTTPException(404, "Không tìm thấy file PDF.")
    return FileResponse(path, filename=doc.filename, media_type="application/pdf", content_disposition_type="inline")
