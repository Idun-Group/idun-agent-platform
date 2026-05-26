"""ADK agent with structured input/output schemas.

Demonstrates an ADK agent with Pydantic input_schema and output_schema.
The engine auto-discovers these from the agent's properties.
"""

from pydantic import BaseModel, Field

from google.adk.agents import LlmAgent


class CountryInput(BaseModel):
    country: str = Field(description="Name of the country")


class CapitalOutput(BaseModel):
    capital: str = Field(description="Capital city of the country")


root_agent = LlmAgent(
    name="capital_agent",
    model="gemini-2.0-flash",
    instruction=(
        "You are a geography expert. Given a country, respond ONLY with a JSON "
        'object containing the capital. Format: {"capital": "capital_name"}'
    ),
    input_schema=CountryInput,
    output_schema=CapitalOutput,
)
