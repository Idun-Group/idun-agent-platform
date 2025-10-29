"""Auth router (minimal) exposing only encrypt_payload utility for reuse.

Full auth flows are intentionally omitted for the MVP.
"""

import hashlib
import os

from fastapi import APIRouter

router = APIRouter()


def encrypt_payload(payload: str) -> bytes:
    """Derive a deterministic key for a payload using scrypt.

    Salt is taken from AUTH__SECRET_KEY environment variable.
    Returns 32-byte derived key.
    """
    secret = os.environ.get("AUTH__SECRET_KEY")
    if not secret:
        raise ValueError("AUTH__SECRET_KEY environment variable is required")
    return hashlib.scrypt(
        password=payload.encode(),
        salt=secret.encode(),
        n=16384,
        r=8,
        p=1,
        dklen=32,
    )
