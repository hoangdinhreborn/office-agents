from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator

from app.schemas.project import ProjectMemberInput

MAX_ATTACHMENT_BYTES = 18 * 1024 * 1024


class ReplyLink(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: str = Field(max_length=128)
    label: str = Field(min_length=1, max_length=255)
    url: str = Field(min_length=1, max_length=2048)

    @field_validator("url")
    @classmethod
    def http_url(cls, value):
        HttpUrl(value)
        return value


class ReplyRecipients(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    resource_id: str = Field(min_length=1, max_length=128)
    solution_id: str = Field(min_length=1, max_length=128)
    to: list[str] = Field(default_factory=list, max_length=50)
    cc: list[str] = Field(default_factory=list, max_length=50)

    @field_validator("to", "cc")
    @classmethod
    def addresses(cls, values):
        return list(dict.fromkeys(ProjectMemberInput(email=value).email for value in values))


class ReplyDraftRequest(ReplyRecipients):
    model_id: str | None = Field(default=None, min_length=1, max_length=128)
    force_draft: bool = False
    attachment_names: list[str] = Field(default_factory=list, max_length=20)
    links: list[ReplyLink] = Field(default_factory=list, max_length=20)


class ReplyDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    subject: str = Field(min_length=1, max_length=500, pattern=r"^[^\r\n]+$")
    body: str = Field(default="", max_length=50000)
    should_reply: bool
    note: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def meaningful_reply(self):
        if self.should_reply and not self.body.strip():
            raise ValueError("Nháp phản hồi cần có nội dung.")
        return self


class ReplySendRequest(ReplyRecipients):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)
    request_id: UUID
    subject: str = Field(min_length=1, max_length=500, pattern=r"^[^\r\n]+$")
    body: str = Field(min_length=1, max_length=50000)
    resource_ids: list[str] = Field(default_factory=list, max_length=20)
    links: list[ReplyLink] = Field(default_factory=list, max_length=20)
    save_new_emails_to_project: bool = False
    approved: Literal[True]

    @field_validator("subject", "body")
    @classmethod
    def nonblank_reviewed_text(cls, value):
        if not value.strip():
            raise ValueError("Tiêu đề và nội dung không được để trống.")
        return value
