"""Authentication, sessions, permissions and audit helpers. Every access rule is enforced here on the server."""
import hashlib
import os
import secrets
import time
from collections import defaultdict
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .models import CodingAuditLog, Encounter, SessionLocal, User, UserSession, now

COOKIE = "zebl_session"
SECURE_COOKIES = os.getenv("ZEBL_ENV", "development") == "production"
IDLE_MINUTES = int(os.getenv("ZEBL_IDLE_MINUTES", "30"))
MAX_ATTEMPTS = 5
LOCK_MINUTES = 15
hasher = PasswordHasher()
DUMMY_HASH = hasher.hash(secrets.token_urlsafe(16))
_hits = defaultdict(list)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(p):
    return hasher.hash(p)


def verify_password(h, p):
    try:
        return hasher.verify(h, p)
    except (VerificationError, Exception):
        return False


def sha(t):
    return hashlib.sha256(t.encode()).hexdigest()


def client_ip(request):
    return request.client.host if request.client else ""


def rate_limit(request, bucket, limit=20, window=300):
    key, t = f"{bucket}:{client_ip(request)}", time.time()
    _hits[key] = [x for x in _hits[key] if t - x < window]
    if len(_hits[key]) >= limit:
        raise HTTPException(429, "Too many attempts. Wait a few minutes and try again.")
    _hits[key].append(t)


def reset_rate_limits():
    _hits.clear()


def audit(db, request, user, action, entity=None, entity_id=None, detail=None, org_id=None):
    db.add(CodingAuditLog(org_id=org_id or (user.org_id if user else None), user_id=user.id if user else None, action=action,
                          entity=entity, entity_id=str(entity_id) if entity_id is not None else None, detail=detail,
                          ip=client_ip(request) if request else None))


def new_session(db, response, user, mfa_pending, remember):
    token = secrets.token_urlsafe(40)
    hours = 168 if remember else 12
    if mfa_pending:
        hours = 0.17
    db.add(UserSession(user_id=user.id, token_hash=sha(token), mfa_pending=mfa_pending, expires_at=now() + timedelta(hours=hours)))
    response.set_cookie(COOKIE, token, httponly=True, secure=SECURE_COOKIES, samesite="strict", path="/",
                        max_age=int(hours * 3600) if remember else None)


def load_session(request, db):
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    return db.query(UserSession).filter_by(token_hash=sha(token)).first()


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    s = load_session(request, db)
    t = now()
    if not s or s.revoked_at or s.expires_at < t or s.mfa_pending:
        raise HTTPException(401, "Sign in to continue.")
    if s.last_seen_at and s.last_seen_at < t - timedelta(minutes=IDLE_MINUTES):
        s.revoked_at = t
        db.commit()
        raise HTTPException(401, "session_expired")
    if not s.user.is_active or s.user.deleted_at:
        raise HTTPException(401, "Sign in to continue.")
    s.last_seen_at = t
    db.commit()
    return s.user


def need(*codes):
    def dep(user: User = Depends(current_user)) -> User:
        if not set(codes) & user.perms:
            raise HTTPException(403, "You do not have permission to do this.")
        return user
    return dep


def is_global(user):
    return "org.manage_all" in user.perms


def org_scope(query, model, user):
    return query if is_global(user) else query.filter(model.org_id == user.org_id)


def encounter_scope(db, user):
    """Which encounters this user may see. Applied to every encounter read, including the assistant."""
    q = org_scope(db.query(Encounter), Encounter, user).filter(Encounter.archived_at.is_(None))
    p = user.perms
    if "encounters.view_all" in p:
        return q
    if "encounters.view_qa" in p:
        return q.filter(Encounter.coding_status.in_(["pending_qa", "approved", "rejected"]))
    if "encounters.view_billing" in p:
        return q.filter(Encounter.coding_status == "approved")
    if "encounters.view_assigned" in p:
        return q.filter(Encounter.assigned_coder_id == user.id)
    return q.filter(False)


def get_encounter(db, user, encounter_id):
    e = encounter_scope(db, user).filter(Encounter.id == encounter_id).first()
    if not e:
        raise HTTPException(404, "Encounter not found.")
    return e
