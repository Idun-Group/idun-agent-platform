from __future__ import annotations

from pydantic import BaseModel, model_validator


class TranslationAgentArguments(BaseModel):
    model: str
    project: str
    region: str
    llm_key: str
    prompt: str

    @model_validator(mode="after")
    def validate_model(self) -> TranslationAgentArguments:
        for field, value in self.model_dump().items():
            if value is None:
                raise ValueError(f"Field {field} cannot be empty!")
        return TranslationAgentArguments
