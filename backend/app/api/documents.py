from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
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
    db: Session = Depends(get_db),
) -> DocumentResponse:
    """
    Uploads and summarizes a PDF document using PyMuPDF and DeepSeek-R1.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận định dạng file chuẩn là PDF.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File PDF tải lên rỗng.")

    # Save to data/documents/
    save_dir = Path("data/documents")
    save_dir.mkdir(parents=True, exist_ok=True)
    save_path = save_dir / file.filename
    save_path.write_bytes(content)

    summary_res = summary_agent.summarize_pdf(source=content, filename=file.filename)

    # Save record to DB
    doc_rec = DocumentRecord(
        filename=file.filename,
        total_pages=summary_res.total_pages or 1,
        executive_summary=summary_res.executive_summary,
        full_markdown=summary_res.full_markdown,
    )
    doc_rec.set_deadlines(summary_res.deadlines)
    db.add(doc_rec)
    db.commit()

    return DocumentResponse(
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
    db: Session = Depends(get_db),
) -> DocumentResponse:
    """
    Summarizes raw text according to executive standard.
    """
    summary_res = summary_agent.summarize_text(text=req.text, document_title=req.title)

    doc_rec = DocumentRecord(
        filename=req.title,
        total_pages=1,
        executive_summary=summary_res.executive_summary,
        full_markdown=summary_res.full_markdown,
    )
    doc_rec.set_deadlines(summary_res.deadlines)
    db.add(doc_rec)
    db.commit()

    return DocumentResponse(
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
def list_documents(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    """
    Lists previously processed documents.
    """
    docs = db.query(DocumentRecord).order_by(DocumentRecord.created_at.desc()).limit(20).all()
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
