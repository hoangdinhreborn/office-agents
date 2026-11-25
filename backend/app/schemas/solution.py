from pydantic import BaseModel, ConfigDict, Field


class SolutionOptionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title_markdown: str = Field(min_length=1, max_length=12000)
    pros_cons_markdown: str = Field(min_length=1, max_length=12000)


class RefineSolutionsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    constraint: str = Field(default="", max_length=2000)
    revision: int = Field(ge=0)


class GeneratedSolutions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    solution_options: list[SolutionOptionPayload] = Field(min_length=1, max_length=3)


class StoredSolutionOption(SolutionOptionPayload):
    id: str


class ResourceSolutionsResponse(BaseModel):
    resource_id: str
    solution_options: list[StoredSolutionOption]
    constraint_history: list[str]
    solution_revision: int
