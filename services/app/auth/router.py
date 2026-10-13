"""Authentication Service: register, login (JWT), whoami, admin user management (RBAC)."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import User, get_db
from app.core.metrics import LOGINS
from app.core.security import (create_token, get_current_user, hash_password,
                               require_admin, verify_password)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    id: int
    username: str
    role: str


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(409, "Username already taken")
    role = "admin" if body.username == get_settings().bootstrap_admin else "user"
    user = User(username=body.username, password_hash=hash_password(body.password), role=role)
    db.add(user)
    db.commit()
    return UserOut(id=user.id, username=user.username, role=user.role)


@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == form.username))
    if not user or not verify_password(form.password, user.password_hash):
        LOGINS.labels(result="fail").inc()
        raise HTTPException(401, "Invalid credentials")
    LOGINS.labels(result="ok").inc()
    return {"access_token": create_token(user), "token_type": "bearer", "role": user.role}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut(id=user.id, username=user.username, role=user.role)


@router.get("/users", response_model=list[UserOut])
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [UserOut(id=u.id, username=u.username, role=u.role) for u in db.scalars(select(User))]
