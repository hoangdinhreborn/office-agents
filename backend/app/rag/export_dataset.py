import argparse
import json
import logging
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from app.database.database import SessionLocal, init_db
from app.database.models import RLFeedbackRecord

logger = logging.getLogger(__name__)


def export_dpo_dataset(
    output_path: Path,
    agent_type: Optional[str] = None,
    db: Optional[Session] = None,
) -> int:
    """
    Exports pairwise preference dataset (JSONL) for Direct Preference Optimization (DPO).
    Filter: Only records with human-corrected responses (chosen vs rejected).
    """
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        query = db.query(RLFeedbackRecord).filter(
            RLFeedbackRecord.corrected_response.isnot(None),
            RLFeedbackRecord.corrected_response != "",
        )
        if agent_type:
            query = query.filter(RLFeedbackRecord.agent_type == agent_type.lower().strip())

        records = query.all()
        output_path.parent.mkdir(parents=True, exist_ok=True)

        count = 0
        with open(output_path, "w", encoding="utf-8") as f:
            for r in records:
                # If rating is positive or correction provided, corrected_response is "chosen", response is "rejected"
                item = {
                    "prompt": r.prompt,
                    "chosen": r.corrected_response,
                    "rejected": r.response,
                    "agent_type": r.agent_type,
                    "rating": r.rating,
                    "id": r.id,
                }
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
                count += 1

        logger.info(f"Đã xuất {count} mẫu dữ liệu DPO sang '{output_path}'.")
        return count
    finally:
        if close_db:
            db.close()


def export_grpo_dataset(
    output_path: Path,
    agent_type: Optional[str] = None,
    db: Optional[Session] = None,
) -> int:
    """
    Exports Group Relative Policy Optimization (GRPO) formatted dataset (JSONL).
    Groups candidate responses by prompt with explicit normalized rewards.
    """
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        query = db.query(RLFeedbackRecord)
        if agent_type:
            query = query.filter(RLFeedbackRecord.agent_type == agent_type.lower().strip())

        records = query.all()
        output_path.parent.mkdir(parents=True, exist_ok=True)

        count = 0
        with open(output_path, "w", encoding="utf-8") as f:
            for r in records:
                responses = []
                # Rejected / baseline model response
                base_reward = -1.0 if r.rating <= 0 else 0.5
                responses.append({
                    "response": r.response,
                    "reward": base_reward,
                    "source": "model_baseline",
                })

                # Chosen / human-corrected response (if present)
                if r.corrected_response and r.corrected_response.strip():
                    responses.append({
                        "response": r.corrected_response,
                        "reward": 1.0,
                        "source": "human_corrected",
                    })

                item = {
                    "prompt": r.prompt,
                    "agent_type": r.agent_type,
                    "responses": responses,
                    "id": r.id,
                }
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
                count += 1

        logger.info(f"Đã xuất {count} mẫu dữ liệu GRPO sang '{output_path}'.")
        return count
    finally:
        if close_db:
            db.close()


def main():
    parser = argparse.ArgumentParser(description="Export RL Human Feedback Dataset for DPO/GRPO Fine-tuning.")
    parser.add_argument("--format", choices=["dpo", "grpo"], default="dpo", help="Target dataset format")
    parser.add_argument("--output", type=str, default="data/rl_dataset.jsonl", help="Output JSONL file path")
    parser.add_argument("--agent", type=str, default=None, help="Filter by agent type (summary/solution/calendar)")
    args = parser.parse_args()

    init_db()
    out = Path(args.output)
    if args.format == "dpo":
        cnt = export_dpo_dataset(out, agent_type=args.agent)
    else:
        cnt = export_grpo_dataset(out, agent_type=args.agent)

    print(f"✅ Hoàn tất! Đã xuất {cnt} mẫu dữ liệu định dạng {args.format.upper()} tại {out}")


if __name__ == "__main__":
    main()
