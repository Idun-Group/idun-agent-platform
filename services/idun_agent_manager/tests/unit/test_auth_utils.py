"""Unit tests for password hashing utilities."""

from app.core.security import hash_password, verify_password


class TestHashPassword:
    def test_returns_string(self):
        result = hash_password("password123")
        assert isinstance(result, str)

    def test_hash_starts_with_bcrypt_prefix(self):
        result = hash_password("password123")
        assert result.startswith("$2b$")

    def test_different_passwords_produce_different_hashes(self):
        hash1 = hash_password("password123")
        hash2 = hash_password("different456")
        assert hash1 != hash2

    def test_same_password_produces_different_hashes(self):
        hash1 = hash_password("password123")
        hash2 = hash_password("password123")
        assert hash1 != hash2


class TestVerifyPassword:
    def test_correct_password_returns_true(self):
        hashed = hash_password("mypassword")
        assert verify_password("mypassword", hashed) is True

    def test_wrong_password_returns_false(self):
        hashed = hash_password("mypassword")
        assert verify_password("wrongpassword", hashed) is False

    def test_empty_password_returns_false(self):
        hashed = hash_password("mypassword")
        assert verify_password("", hashed) is False

    def test_case_sensitive(self):
        hashed = hash_password("MyPassword")
        assert verify_password("mypassword", hashed) is False
        assert verify_password("MYPASSWORD", hashed) is False
        assert verify_password("MyPassword", hashed) is True
