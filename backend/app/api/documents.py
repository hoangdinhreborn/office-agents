from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool
from uuid import uuid4
from app.services.projects import owned_query, project_scope
from app.config import resolve_path, settings
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.agents.summary_agent import summary_agent
from app.database.database import get_db
from app.database.models import DocumentRecord

router = APIRouter(prefix="/api/documents", tags=["Documents & PDF"])


class SummarizeTextRequest(BaseModel):
    text: str
    title: Optional[str] = "Văn bản nhập trực tiếp"


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


@router.post("/summarize-pdf", response_model=DocumentResponse)
async def summarize_pdf_endpoint(
    file: UploadFile = File(...),
    project_id: str = Depends(project_scope), db: Session = Depends(get_db),
) -> DocumentResponse:
    """
    Uploads and summarizes a PDF document using PyMuPDF and DeepSeek-R1.
    """
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
        summary_res = await run_in_threadpool(summary_agent.summarize_pdf, source=content, filename=Path(file.filename).name)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    document_id = str(uuid4())
    save_path = resolve_path(f"data/documents/{project_id}/{document_id}.pdf")
    save_path.parent.mkdir(parents=True, exist_ok=True)
    save_path.write_bytes(content)

    # Save record to DB
    doc_rec = DocumentRecord(
        project_id=project_id,
        id=document_id, file_path=str(save_path), file_size=len(content),
        filename=Path(file.filename).name,
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

    return DocumentResponse(
        id=doc_rec.id,
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
    summary_res = summary_agent.summarize_text(text=req.text, document_title=req.title)

    doc_rec = DocumentRecord(
        project_id=project_id,
        filename=req.title,
        total_pages=1,
        executive_summary=summary_res.executive_summary,
        full_markdown=summary_res.full_markdown,
    )
    doc_rec.set_deadlines(summary_res.deadlines)
    db.add(doc_rec)
    db.commit()

    return DocumentResponse(
        id=doc_rec.id,
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
    docs = owned_query(db, DocumentRecord, project_id).order_by(DocumentRecord.created_at.desc()).limit(20).all()
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "total_pages": d.total_pages,
            "executive_summary": d.executive_summary,
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
