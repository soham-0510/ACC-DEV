"""JWT auth + RBAC + password hashing + encryption at rest + SHA-256."""
import base64
import hashlib
import hmac
import os
from datetime import timedelta

import jwt
from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .config import get_settings
from .db import User, get_db, now

settings = get_settings()
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
_fernet = Fernet(settings.encryption_key.encode())

PBKDF2_ROUNDS = 310_000  # OWASP recommendation for PBKDF2-SHA256


# ---------- passwords ----------
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_password(password: str, stored: str) -> bool:
    _, rounds, salt_b64, dk_b64 = stored.split("$")
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt_b64), int(rounds))
    return hmac.compare_digest(dk, base64.b64decode(dk_b64))


# ---------- JWT ----------
def create_token(user: User) -> str:
    payload = {"sub": str(user.id), "username": user.username, "role": user.role,
               "exp": now() + timedelta(minutes=settings.jwt_expiry_minutes)}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def get_current_user(token: str = Depends(oauth2), db: Session = Depends(get_db)) -> User:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = db.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return user


# ---------- integrity + encryption ----------
def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encrypt(data: bytes) -> bytes:
    return _fernet.encrypt(data)


def decrypt(data: bytes) -> bytes:
    return _fernet.decrypt(data)
