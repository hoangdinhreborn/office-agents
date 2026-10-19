import math
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.agents.solution_agent import solution_agent
from app.database.database import get_db
from app.database.models import SolutionRecord

router = APIRouter(prefix="/api/solutions", tags=["Solutions & Problem Solving"])


class ProposeSolutionRequest(BaseModel):
    problem_description: str = Field(..., description="Mô tả sự cố, thách thức hoặc vấn đề cần xử lý")
    context: Optional[str] = Field(None, description="Bối cảnh liên quan (hệ thống, dữ liệu, phòng ban)")
    constraints: Optional[str] = Field(None, description="Ràng buộc về ngân sách, công nghệ hoặc thời gian")


@router.post("/propose")
def propose_solution_endpoint(
    req: ProposeSolutionRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Analyzes root causes and formulates 3-tier solutions using DeepSeek-R1 reasoning.
    """
    sol_res = solution_agent.propose_solution(
        problem_description=req.problem_description,
        context=req.context,
        constraints=req.constraints,
    )

    rec = SolutionRecord(
        problem=req.problem_description,
        root_cause=sol_res.root_cause_analysis,
        full_markdown=sol_res.full_markdown,
    )
    db.add(rec)
    db.commit()

    return {
        "problem_statement": sol_res.problem_statement,
        "root_cause_analysis": sol_res.root_cause_analysis,
        "immediate_solutions": sol_res.immediate_solutions,
        "mid_term_solutions": sol_res.mid_term_solutions,
        "long_term_solutions": sol_res.long_term_solutions,
        "risk_assessment": sol_res.risk_assessment,
        "action_items": [a.__dict__ for a in sol_res.action_items],
        "full_markdown": sol_res.full_markdown,
        "thinking_process": sol_res.thinking_process,
    }


@router.get("")
def list_solutions(
    page: Optional[int] = Query(None, ge=1, description="Số trang (bắt đầu từ 1, để trống = trả về list)"),
    page_size: int = Query(10, ge=1, le=100, description="Số lượng mục mỗi trang"),
    db: Session = Depends(get_db),
) -> Any:
    query = db.query(SolutionRecord).order_by(SolutionRecord.created_at.desc())
    total = query.count()

    if page is not None:
        offset = (page - 1) * page_size
        records = query.offset(offset).limit(page_size).all()
        items = [
            {
                "id": r.id,
                "problem": r.problem,
                "root_cause": r.root_cause,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in records
        ]
        total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
        }

    records = query.limit(20).all()
    return [
        {
            "id": r.id,
            "problem": r.problem,
            "root_cause": r.root_cause,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in records
    ]
