import secrets
from datetime import timedelta

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from .models import PasswordReset, User, now
from .security import (COOKIE, DUMMY_HASH, LOCK_MINUTES, MAX_ATTEMPTS, audit, current_user, get_db, hash_password, load_session,
                       new_session, rate_limit, sha, verify_password)

router = APIRouter(prefix="/api/auth")
BAD = "Incorrect email or password. Check your details and try again."


class LoginIn(BaseModel):
    email: str
    password: str
    remember: bool = False


class CodeIn(BaseModel):
    code: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: str


def me_json(u):
    return dict(id=u.id, email=u.email, full_name=u.full_name, roles=u.role_names, permissions=sorted(u.perms), org_id=u.org_id,
                org_name=u.organization.name, mfa_enabled=u.mfa_enabled)


def strong(p):
    if len(p) < 12 or p.lower() == p or p.upper() == p or not any(c.isdigit() for c in p):
        raise HTTPException(422, "Use at least 12 characters with upper case, lower case and a number.")


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    rate_limit(request, "login")
    u = db.query(User).filter(User.email == body.email.strip().lower(), User.deleted_at.is_(None)).first()
    t = now()
    if not u:
        verify_password(DUMMY_HASH, body.password)  # keeps response time the same for unknown accounts
        audit(db, request, None, "auth.login_failed", detail="unknown account")
        db.commit()
        raise HTTPException(401, BAD)
    if u.locked_until and u.locked_until > t:
        audit(db, request, u, "auth.login_blocked", "user", u.id)
        db.commit()
        raise HTTPException(423, f"Account temporarily locked. Try again in {LOCK_MINUTES} minutes or ask your administrator to unlock it.")
    if not verify_password(u.password_hash, body.password) or not u.is_active:
        u.failed_attempts += 1
        if u.failed_attempts >= MAX_ATTEMPTS:
            u.locked_until = t + timedelta(minutes=LOCK_MINUTES)
            u.failed_attempts = 0
            audit(db, request, u, "auth.locked", "user", u.id)
        audit(db, request, u, "auth.login_failed", "user", u.id)
        db.commit()
        raise HTTPException(401, BAD)
    u.failed_attempts = 0
    new_session(db, response, u, u.mfa_enabled, body.remember)
    if not u.mfa_enabled:
        u.last_login_at = t
        audit(db, request, u, "auth.login", "user", u.id)
    db.commit()
    return dict(mfa_required=u.mfa_enabled, user=None if u.mfa_enabled else me_json(u))


@router.post("/mfa")
def mfa(body: CodeIn, request: Request, response: Response, db: Session = Depends(get_db)):
    rate_limit(request, "mfa")
    s = load_session(request, db)
    if not s or not s.mfa_pending or s.revoked_at or s.expires_at < now():
        raise HTTPException(401, "Your sign-in timed out. Start again.")
    if not pyotp.TOTP(s.user.mfa_secret).verify(body.code.strip(), valid_window=1):
        audit(db, request, s.user, "auth.mfa_failed", "user", s.user_id)
        db.commit()
        raise HTTPException(401, "That code is incorrect. Check your app and try again.")
    s.revoked_at = now()
    new_session(db, response, s.user, False, False)
    s.user.last_login_at = now()
    audit(db, request, s.user, "auth.login", "user", s.user_id, "with MFA")
    db.commit()
    return dict(user=me_json(s.user))


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    s = load_session(request, db)
    if s:
        s.revoked_at = now()
        audit(db, request, s.user, "auth.logout", "user", s.user_id)
        db.commit()
    response.delete_cookie(COOKIE, path="/")
    return dict(ok=True)


@router.get("/me")
def me(user: User = Depends(current_user)):
    return me_json(user)


@router.post("/mfa/setup")
def mfa_setup(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.mfa_enabled:
        raise HTTPException(409, "MFA is already on.")
    user.mfa_secret = pyotp.random_base32()
    db.commit()
    return dict(secret=user.mfa_secret, uri=pyotp.TOTP(user.mfa_secret).provisioning_uri(user.email, issuer_name="ZEBL Coding Agent"))


@router.post("/mfa/enable")
def mfa_enable(body: CodeIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not user.mfa_secret or not pyotp.TOTP(user.mfa_secret).verify(body.code.strip(), valid_window=1):
        raise HTTPException(422, "That code is incorrect.")
    user.mfa_enabled = True
    audit(db, request, user, "auth.mfa_enabled", "user", user.id)
    db.commit()
    return me_json(user)


@router.post("/forgot")
def forgot(body: ForgotIn, request: Request, db: Session = Depends(get_db)):
    rate_limit(request, "forgot", 10)
    u = db.query(User).filter_by(email=body.email.lower()).first()
    dev_token = None
    if u and u.is_active:
        token = secrets.token_urlsafe(32)
        db.add(PasswordReset(user_id=u.id, token_hash=sha(token), expires_at=now() + timedelta(minutes=30)))
        audit(db, request, u, "auth.reset_requested", "user", u.id)
        db.commit()
        dev_token = token
    # No mail provider is connected. In development the token is printed to the server log only.
    if dev_token:
        import os
        if os.getenv("ZEBL_ENV", "development") == "development":
            print(f"[dev only] password reset token for {u.email}: {dev_token}")
    return dict(ok=True)


@router.post("/reset")
def reset(body: ResetIn, request: Request, db: Session = Depends(get_db)):
    rate_limit(request, "reset", 10)
    strong(body.password)
    r = db.query(PasswordReset).filter_by(token_hash=sha(body.token)).first()
    if not r or r.used_at or r.expires_at < now():
        raise HTTPException(400, "This reset link is invalid or has expired.")
    u = db.get(User, r.user_id)
    u.password_hash = hash_password(body.password)
    u.failed_attempts, u.locked_until, r.used_at = 0, None, now()
    audit(db, request, u, "auth.password_reset", "user", u.id)
    db.commit()
    return dict(ok=True)
