from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ProjectIcon = Literal[
    "briefcase", "file-text", "scale", "building", "users", "calendar-event", "chart-bar", "folder",
    "mail", "receipt", "clipboard-list", "target", "database", "bulb", "shield-check", "rocket",
    "book", "calculator", "presentation", "world",
]


class ProjectMemberInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    email: str = Field(max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    role: Literal["nội bộ", "khách"] | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower()

    @model_validator(mode="after")
    def default_role(self):
        if self.role is None:
            self.role = "nội bộ" if self.email.endswith("@soviectech.vn") else "khách"
        return self


class ProjectConfigInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    mail_label_id: str | None = Field(None, min_length=1, max_length=255)
    mail_label_name: str | None = Field(None, min_length=1, max_length=255)
    mail_sync_interval_minutes: int = Field(60, ge=30, le=720)
    default_reminder_minutes: Literal[10, 15, 30, 60] = 30
    collect_rl_feedback: bool = True

    @model_validator(mode="after")
    def label_pair(self):
        if bool(self.mail_label_id) != bool(self.mail_label_name):
            raise ValueError("Nhãn Gmail cần cả ID và tên nhãn.")
        return self


class ProjectCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    title: str = Field(min_length=2, max_length=80)
    icon: ProjectIcon = "briefcase"
    members: list[ProjectMemberInput] = Field(default_factory=list)
    config: ProjectConfigInput = Field(default_factory=ProjectConfigInput)

    @field_validator("members")
    @classmethod
    def unique_members(cls, members):
        if len({m.email for m in members}) != len(members):
            raise ValueError("Email thành viên bị trùng trong dự án.")
        return members


class ProjectUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    title: str | None = Field(None, min_length=2, max_length=80)
    icon: ProjectIcon | None = None
    members: list[ProjectMemberInput] | None = None
    config: ProjectConfigInput | None = None

    @model_validator(mode="after")
    def valid_update(self):
        if any(getattr(self, key) is None for key in self.model_fields_set):
            raise ValueError("Không được đặt trường cập nhật thành null.")
        if self.members is not None:
            ProjectCreate.unique_members(self.members)
        return self
