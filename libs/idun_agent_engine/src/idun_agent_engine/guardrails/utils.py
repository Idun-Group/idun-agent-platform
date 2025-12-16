"""Guardrails utility functions."""

import subprocess
import time

from idun_agent_schema.engine.guardrails import Guardrails
from idun_agent_schema.engine.guardrails_v2 import GuardrailsV2


def install_guardrails(guardrails_obj: Guardrails | GuardrailsV2) -> None:
    """Install all guardrails before initializing them."""
    from guardrails import install

    if not isinstance(guardrails_obj, Guardrails) and not isinstance(
        guardrails_obj, GuardrailsV2
    ):
        raise ValueError(
            f"Cannot parse guardrails. Expected guardrails or guardrailsV2 but received {type(guardrails_obj)}"
        )

    all_guards = list(guardrails_obj.input) + list(guardrails_obj.output)

    if not all_guards:
        return

    api_key = all_guards[0].api_key

    try:
        print("Configuring guardrails...")
        subprocess.run(
            [
                "guardrails",
                "configure",
                "--token",
                api_key,
                "--disable-remote-inferencing",
                "--disable-metrics",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        print(f"Error configuring guardrails: {e.stderr}")
        return

    for guard in all_guards:
        try:
            print(f"Installing {guard.guard_url}...")
            install(guard.guard_url, quiet=False, install_local_models=True)
            print(f"Successfully installed {guard.guard_url}")
            time.sleep(2)
        except Exception as e:
            print(f"Error installing {guard.guard_url}: {e}")
