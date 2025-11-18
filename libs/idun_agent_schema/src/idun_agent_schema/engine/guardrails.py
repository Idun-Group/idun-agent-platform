"""
Description
EngineConfig contient un champ guardrails
Nouveau schema: GuardrailS contenants une liste de input Guardrail et output Guardrail
Nouveau schema Guardrail
Definir un premier type de guardrails GuardrailBanList (Type, wordsList) qui hérite de Guardrail
"""

from pydantic import BaseModel

from .guardrails_type import GuardrailType


class Guardrail(BaseModel):
    """Base Class for defining guardrails."""

    type: GuardrailType


class Guardrails(BaseModel):
    """Class for specifying the engine's Guardrails config."""

    enabled: bool
    input: Guardrail
    output: Guardrail


class GuardrailsHub(Guardrail):
    """TODO."""

    type: GuardrailType = GuardrailType.GuardrailsHub


class BanList(GuardrailsHub):
    """TODO."""

    banned_words: list[str]


class CustomLLMGuard(Guardrail):
    """TODO."""

    type: GuardrailType = GuardrailType.CustomLLM
    model: str
    task: str
