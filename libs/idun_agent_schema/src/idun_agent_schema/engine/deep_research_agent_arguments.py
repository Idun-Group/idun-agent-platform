from __future__ import annotations

from pydantic import BaseModel, model_validator


class DeepResearchAgentArguments(BaseModel):
    model: str
    project: str
    region: str
    tavily_api_key: str
    prompt: str

    @model_validator(mode="after")
    def validate_model(self) -> DeepResearchAgentArguments:
        for field, value in self.model_dump().items():
            if value is None or (isinstance(value, str) and not value.strip()):
                raise ValueError(f"Field {field} cannot be empty!")
        return self