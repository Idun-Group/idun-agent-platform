from __future__ import annotations

from pydantic import BaseModel, model_validator


class CorrectionAgentArguments(BaseModel):
    model_name: str
    language: str

    @model_validator(mode="after")
    def validate_model(self) -> CorrectionAgentArguments:
        for field, value in self.model_dump().items():
            if value is None or (isinstance(value, str) and not value.strip()):
                raise ValueError(f"Field {field} cannot be empty!")
        return self