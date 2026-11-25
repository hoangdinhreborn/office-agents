from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from urllib.parse import urlsplit
from functools import lru_cache
from pydantic import SecretStr

from app.config import resolve_path, settings
from app.database.models import LLMProviderRecord, LLMProviderSecretRecord, LLMRuntimeRecord
from app.schemas.llm import ModelConfig, ProviderConfig


class LLMError(Exception):
    def __init__(self, message: str, status_code: int = 502, *, out_of_memory: bool = False):
        super().__init__(message)
        self.status_code = status_code
        self.out_of_memory = out_of_memory


@lru_cache(maxsize=1)
def provider_key_store():
    from app.security.token_store import SecureTokenStore
    return SecureTokenStore(resolve_path("data/tokens"))


def with_provider_key(db: Session, provider: ProviderConfig) -> ProviderConfig:
    # A draft key takes precedence; clearing must also work before saving/discovery.
    if provider.api_key is not None or provider.clear_api_key or provider.auth_env_var:
        return provider
    record = db.get(LLMProviderSecretRecord, provider.id)
    if record is not None:
        try:
            provider = provider.model_copy(update={"api_key": SecretStr(provider_key_store().decrypt_secret(record.encrypted_key))})
        except Exception:
            raise LLMError("Không giải mã được API key đã lưu. Hãy nhập lại key cho provider này.", 422) from None
    return provider


def providers(db: Session) -> list[ProviderConfig]:
    return [ProviderConfig.model_validate_json(record.config_json) for record in db.query(LLMProviderRecord).order_by(LLMProviderRecord.id).all()]


def runtime(db: Session) -> LLMRuntimeRecord:
    state = db.get(LLMRuntimeRecord, 1)
    if state is not None:
        return state
    # Initialize once from explicit environment configuration; never seed a catalog of invented models.
    configured_model = settings.llm_model if settings.llm_base_url else settings.ollama_model
    provider = ProviderConfig(
        id="environment", display_name="Endpoint từ cấu hình máy chủ", protocol=settings.llm_protocol if settings.llm_base_url else "ollama-native",
        base_url=settings.llm_base_url or settings.ollama_base_url, auth_env_var=settings.llm_api_key_env,
        is_local_runtime=not bool(settings.llm_base_url) and urlsplit(settings.ollama_base_url).hostname in ("localhost", "127.0.0.1", "::1"),
        models=[ModelConfig(id="environment-model", model_id=configured_model, name=configured_model)] if configured_model else [],
    )
    state = LLMRuntimeRecord(id=1, selected_model_id=provider.models[0].id if provider.models else None)
    try:
        db.add(LLMProviderRecord(id=provider.id, config_json=provider.model_dump_json()))
        db.add(state)
        db.commit()
    except IntegrityError:
        db.rollback()
        state = db.get(LLMRuntimeRecord, 1)
        if state is None:
            raise
    return state


def resolve_model(db: Session, model_id: str | None = None) -> tuple[ProviderConfig, ModelConfig]:
    state = runtime(db)
    target = model_id if model_id is not None else state.selected_model_id
    for provider in providers(db):
        for model in provider.models:
            if model.id == target:
                if not model.supports_text:
                    raise LLMError("Model được chọn chưa bật khả năng xử lý văn bản.", 422)
                return with_provider_key(db, provider), model
    raise LLMError("Chưa chọn model hợp lệ. Hãy lưu provider và chọn model trong khung chat.", 422)


def settings_snapshot(db: Session) -> dict:
    state = runtime(db)
    saved_keys = {r.provider_id for r in db.query(LLMProviderSecretRecord).all()}
    return {"providers": [{**p.model_dump(), "has_api_key": p.id in saved_keys} for p in providers(db)],
            "selected_model_id": state.selected_model_id, "fallback_model_id": state.fallback_model_id}
