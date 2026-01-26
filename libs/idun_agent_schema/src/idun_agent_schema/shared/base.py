from pydantic.alias_generators import to_camel
from pydantic_settings import BaseSettings, SettingsConfigDict


class SharedBaseModel(BaseSettings):
    """Inherit from this if you want:
    1. CamelCase JSON support (Frontend friendly)
    2. Environment Variable fallback
    """

    model_config = SettingsConfigDict(
        # JS/Frontend Formatting
        alias_generator=to_camel,
        populate_by_name=True,
        case_sensitive=False,
        # Env Var Support
        # This will read from env vars if the field is missing in the init
        # env_ignore_empty=True,
        # extra='ignore' # Good practice for env loading
    )
