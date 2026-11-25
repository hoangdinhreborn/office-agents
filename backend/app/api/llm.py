from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.database.models import LLMProviderRecord, LLMProviderSecretRecord
from app.llm.adapters import discover_models
from app.schemas.llm import FallbackSelection, ModelSelection, ProviderConfig
from app.services.llm_settings import providers, provider_key_store, resolve_model, runtime, settings_snapshot, with_provider_key

router = APIRouter(prefix="/api/llm", tags=["LLM providers & models"])


@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    return settings_snapshot(db)


@router.put("/providers/{provider_id}")
def save_provider(provider_id: str, req: ProviderConfig, db: Session = Depends(get_db)):
    if provider_id != req.id:
        raise HTTPException(422, "Provider ID trong URL và body không khớp.")
    state = runtime(db)
    existing_ids = {m.id for p in providers(db) if p.id != provider_id for m in p.models}
    if existing_ids.intersection(m.id for m in req.models):
        raise HTTPException(409, "ID model đã thuộc provider khác.")
    db.merge(LLMProviderRecord(id=req.id, config_json=req.model_dump_json()))
    db.flush()
    secret = db.get(LLMProviderSecretRecord, req.id)
    if req.api_key is not None:
        encrypted = provider_key_store().encrypt_secret(req.api_key.get_secret_value())
        db.merge(LLMProviderSecretRecord(provider_id=req.id, encrypted_key=encrypted))
    elif req.clear_api_key or req.auth_env_var:
        if secret is not None:
            db.delete(secret)
    available_ids = existing_ids | {m.id for m in req.models}
    if state.selected_model_id not in available_ids:
        state.selected_model_id = None
    if state.fallback_model_id not in available_ids:
        state.fallback_model_id = None
    db.commit()
    return settings_snapshot(db)


@router.delete("/providers/{provider_id}", status_code=204)
def delete_provider(provider_id: str, db: Session = Depends(get_db)):
    state = runtime(db)
    record = db.get(LLMProviderRecord, provider_id)
    if record is None:
        raise HTTPException(404, "Không tìm thấy provider.")
    model_ids = {m.id for p in providers(db) if p.id == provider_id for m in p.models}
    if state.selected_model_id in model_ids:
        state.selected_model_id = None
    if state.fallback_model_id in model_ids:
        state.fallback_model_id = None
    db.delete(record)
    db.commit()
    return Response(status_code=204)


@router.put("/selection")
def select_model(req: ModelSelection, db: Session = Depends(get_db)):
    resolve_model(db, req.model_id)
    state = runtime(db)
    state.selected_model_id = req.model_id
    db.commit()
    return settings_snapshot(db)


@router.put("/fallback")
def select_fallback(req: FallbackSelection, db: Session = Depends(get_db)):
    state = runtime(db)
    if req.model_id:
        provider, _ = resolve_model(db, req.model_id)
        if not provider.is_local_runtime:
            raise HTTPException(422, "Fallback VRAM phải là model thuộc máy chủ cục bộ.")
    state.fallback_model_id = req.model_id
    db.commit()
    return settings_snapshot(db)


@router.post("/providers/discover")
def list_remote_models(req: ProviderConfig, db: Session = Depends(get_db)):
    # Explicit user action only. Saving/loading settings never probes remote endpoints.
    return {"models": discover_models(with_provider_key(db, req))}
