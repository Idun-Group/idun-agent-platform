"""Password hashing utilities."""

import bcrypt


def hash_password(password: str, salt: str) -> bytes:
    """Hash a password using bcrypt.

    Args:
        password: Plain text password to hash.

    Returns:
        Hashed password string.
    """
    hashed = bcrypt.hashpw(
        password.encode("utf-8"),
        salt=salt.encode("utf-8"),
    )
    return hashed


def verify_password(plain_password: str, hashed_password: bytes) -> bool:
    """Verify a password against a hash.

    Args:
        plain_password: Plain text password to verify.
        hashed_password: Hashed password to compare against.

    Returns:
        True if password matches, False otherwise.
    """
    encoded_pwd = plain_password.encode("utf-8")
    return bcrypt.checkpw(encoded_pwd, hashed_password)
