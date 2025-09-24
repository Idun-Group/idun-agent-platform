"""JWT token handling for authentication."""

from datetime import datetime, timedelta
from typing import Any, Dict, Optional
import jwt
from passlib.context import CryptContext

from app.core.settings import get_settings
from app.core.logging import get_logger
from app.core.errors import AuthenticationError

logger = get_logger(__name__)


class JWTHandler:
    """JWT token handler for authentication."""
    
    def __init__(self) -> None:
        """Initialize JWT handler."""
        self.settings = get_settings()
        self.pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    
    def create_access_token(
        self, 
        subject: str, 
        tenant_id: str,
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """Create JWT access token."""
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(
                minutes=self.settings.auth.access_token_expire_minutes
            )
        
        payload = {
            "sub": subject,
            "tenant_id": tenant_id,
            "exp": expire,
            "iat": datetime.utcnow(),
            "type": "access"
        }
        
        return jwt.encode(
            payload, 
            self.settings.auth.secret_key, 
            algorithm=self.settings.auth.algorithm
        )
    
    def create_refresh_token(
        self, 
        subject: str, 
        tenant_id: str
    ) -> str:
        """Create JWT refresh token."""
        expire = datetime.utcnow() + timedelta(
            days=self.settings.auth.refresh_token_expire_days
        )
        
        payload = {
            "sub": subject,
            "tenant_id": tenant_id,
            "exp": expire,
            "iat": datetime.utcnow(),
            "type": "refresh"
        }
        
        return jwt.encode(
            payload, 
            self.settings.auth.secret_key, 
            algorithm=self.settings.auth.algorithm
        )
    
    def verify_token(self, token: str, token_type: str = "access") -> Dict[str, Any]:
        """Verify and decode JWT token."""
        try:
            payload = jwt.decode(
                token, 
                self.settings.auth.secret_key, 
                algorithms=[self.settings.auth.algorithm]
            )
            
            if payload.get("type") != token_type:
                raise AuthenticationError("Invalid token type")
            
            return payload
            
        except jwt.ExpiredSignatureError:
            raise AuthenticationError("Token has expired")
        except jwt.JWTError as e:
            raise AuthenticationError(f"Invalid token: {str(e)}")
    
    def hash_password(self, password: str) -> str:
        """Hash password using bcrypt."""
        return self.pwd_context.hash(password)
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify password against hash."""
        return self.pwd_context.verify(plain_password, hashed_password)


# Global instance
_jwt_handler: Optional[JWTHandler] = None


def get_jwt_handler() -> JWTHandler:
    """Get JWT handler instance."""
    global _jwt_handler
    if _jwt_handler is None:
        _jwt_handler = JWTHandler()
    return _jwt_handler
