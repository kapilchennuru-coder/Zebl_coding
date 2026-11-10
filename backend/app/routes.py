import csv
import hashlib
import html
import io
import os
import re
import secrets
import zipfile
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel, EmailStr
from reportlab.lib.pagesizes import landscape, letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from pypdf import PdfReader
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .auth_routes import me_json, strong
from .models import *  # noqa: F403
from .models import now
from .engine import MODEL, REFERENCE, engine, validate  # must follow models: models also exports a database "engine"
from .security import (audit, current_user, encounter_scope, get_db, get_encounter, hash_password, is_global, need, org_scope)

router = APIRouter(prefix="/api")
UPLOAD_DIR = Path(os.getenv("ZEBL_UPLOAD_DIR", "./uploads_private"))
ALLOWED = {".pdf", ".txt", ".csv", ".docx", ".xlsx", ".png", ".jpg", ".jpeg"}
MAX_UPLOAD = 10 * 1024 * 1024
OPEN_STATES = ["assigned", "in_progress", "rejected"]


def page_of(q, page, size, ser):
    total = q.count()
    return dict(items=[ser(x) for x in q.offset((page - 1) * size).limit(size).all()], total=total, page=page, size=size)


def sort_by(q, sort, mapping, default):
    desc = sort.startswith("-") if sort else False
    col = mapping.get((sort or "").lstrip("-"), default)
    return q.order_by(col.desc() if desc else col.asc())


def notify(db, org_id, user_id, kind, title, link=None):
    if user_id:
        db.add(Notification(org_id=org_id, user_id=user_id, kind=kind, title=title, link=link))


def enc_json(e):
    return dict(id=e.id, external_id=e.external_id, fin=e.fin, patient=f"{e.patient.last_name}, {e.patient.first_name}", patient_id=e.patient_id,
                mrn=e.patient.mrn, provider=e.provider.name, facility=e.facility.name, date_of_service=e.date_of_service.isoformat(),
                encounter_type=e.encounter_type, doc_status=e.doc_status, coding_status=e.coding_status, qa_status=e.qa_status,
                coder=e.coder.full_name if e.coder else None, coder_id=e.assigned_coder_id, auditor=e.auditor.full_name if e.auditor else None,
                priority=e.priority, queue=e.queue.name if e.queue else None, due_at=e.due_at.isoformat() if e.due_at else None,
                overdue=bool(e.due_at and e.due_at < now() and e.coding_status not in ("approved", "pending_qa")))


# ---- Dashboard and analytics ------------------------------------------------
@router.get("/dashboard")
def dashboard(days: int = Query(30, ge=1, le=365), user: User = Depends(need("dashboard.view")), db: Session = Depends(get_db)):
    since = date.today() - timedelta(days=days)
    enc = encounter_scope(db, user).filter(Encounter.date_of_service >= since).all()
    by = Counter(e.coding_status for e in enc)
    ids = [e.id for e in enc]
    sess = db.query(CodingSession).filter(CodingSession.encounter_id.in_(ids)).all() if ids else []
    sids = [s.id for s in sess]
    recs = db.query(CodingRecommendation).filter(CodingRecommendation.session_id.in_(sids)).all() if sids else []
    acc, rej = sum(r.status == "accepted" for r in recs), sum(r.status == "rejected" for r in recs)
    rev = db.query(CodingReview).filter(CodingReview.session_id.in_(sids)).all() if sids else []
    appr = sum(r.decision == "approved" for r in rev)
    tat = [(s.submitted_at - s.started_at).total_seconds() / 3600 for s in sess if s.submitted_at]
    daily, prod = Counter(), Counter()
    for s in sess:
        if s.submitted_at:
            daily[s.submitted_at.date().isoformat()] += 1
            prod[s.coder.full_name] += 1
    gaps = db.query(func.count(CodingValidation.id)).filter(CodingValidation.session_id.in_(sids), CodingValidation.severity == "error").scalar() if sids else 0
    logs = org_scope(db.query(CodingAuditLog), CodingAuditLog, user).filter(CodingAuditLog.action.like("coding.%")).order_by(CodingAuditLog.id.desc()).limit(8).all() if "audit.view" in user.perms or "reports.view" in user.perms else []
    return dict(total=len(enc), pending=by["unassigned"] + by["assigned"], in_progress=by["in_progress"], completed=by["approved"], pending_qa=by["pending_qa"],
                rejected=by["rejected"], escalated=by["escalated"], on_hold=by["on_hold"],
                accuracy=round(100 * appr / len(rev), 1) if rev else None, ai_acceptance=round(100 * acc / (acc + rej), 1) if acc + rej else None,
                turnaround_hours=round(sum(tat) / len(tat), 1) if tat else None, exceptions=gaps,
                trend=[dict(day=k, submitted=daily[k]) for k in sorted(daily)], productivity=[dict(coder=k, submitted=v) for k, v in prod.most_common(8)],
                queue=[dict(status=k, count=v) for k, v in by.most_common()],
                activity=[dict(action=l.action, entity_id=l.entity_id, user=l.user.full_name if l.user else "System", at=l.created_at.isoformat()) for l in logs])


def analytics_data(db, user):
    enc = encounter_scope(db, user).all()
    ids = [e.id for e in enc]
    sess = db.query(CodingSession).filter(CodingSession.encounter_id.in_(ids)).all() if ids else []
    sids = [s.id for s in sess]
    if not sids:
        return dict(sessions=[], recs=[], reviews=[], dx=[], procs=[], validations=[])
    return dict(sessions=sess, recs=db.query(CodingRecommendation).filter(CodingRecommendation.session_id.in_(sids)).all(),
                reviews=db.query(CodingReview).filter(CodingReview.session_id.in_(sids)).all(),
                dx=db.query(SelectedDiagnosisCode).filter(SelectedDiagnosisCode.session_id.in_(sids)).all(),
                procs=db.query(SelectedProcedureCode).filter(SelectedProcedureCode.session_id.in_(sids)).all(),
                validations=db.query(CodingValidation).filter(CodingValidation.session_id.in_(sids)).all())


@router.get("/analytics")
def analytics(user: User = Depends(need("analytics.view")), db: Session = Depends(get_db)):
    d = analytics_data(db, user)
    code = defaultdict(Counter)
    for r in d["recs"]:
        code[r.code][r.status] += 1
    n = len(d["reviews"]) or 1
    return dict(total_recommendations=len(d["recs"]), rejection_rate=round(100 * sum(r.decision == "rejected" for r in d["reviews"]) / n, 1) if d["reviews"] else None,
                code_accuracy=[dict(code=k, accepted=v["accepted"], rejected=v["rejected"], pending=v["pending"]) for k, v in sorted(code.items(), key=lambda x: -sum(x[1].values()))[:12]],
                rejection_reasons=[dict(reason=k, count=v) for k, v in Counter(r.reason for r in d["reviews"] if r.reason).most_common()],
                deficiencies=[dict(rule=k, count=v) for k, v in Counter(v.rule for v in d["validations"] if v.severity != "info").most_common(8)])


# ---- Patients ---------------------------------------------------------------
def patient_json(p, count=None, latest=None):
    return dict(id=p.id, mrn=p.mrn, first_name=p.first_name, last_name=p.last_name, dob=p.dob.isoformat(), gender=p.gender, status=p.status, encounters=count, latest=latest)


@router.get("/patients")
def patients(request: Request, q: str = "", status: str = "", sort: str = "last_name", page: int = Query(1, ge=1), size: int = Query(15, le=100),
             user: User = Depends(need("patients.view")), db: Session = Depends(get_db)):
    visible = encounter_scope(db, user).with_entities(Encounter.patient_id)
    base = org_scope(db.query(Patient), Patient, user).filter(Patient.deleted_at.is_(None), Patient.id.in_(visible))
    if q:
        like = f"%{q}%"
        base = base.filter(or_(Patient.first_name.ilike(like), Patient.last_name.ilike(like), Patient.mrn.ilike(like)))
    if status:
        base = base.filter(Patient.status == status)
    base = sort_by(base, sort, dict(last_name=Patient.last_name, first_name=Patient.first_name, mrn=Patient.mrn, dob=Patient.dob, status=Patient.status), Patient.last_name)
    def ser(p):
        rows = encounter_scope(db, user).filter(Encounter.patient_id == p.id).with_entities(Encounter.date_of_service).all()
        return patient_json(p, len(rows), max((r[0] for r in rows), default=None).isoformat() if rows else None)
    audit(db, request, user, "phi.list_patients", "patient", None, f"q={bool(q)}")
    db.commit()
    return page_of(base, page, size, ser)


@router.get("/patients/{pid}")
def patient_detail(pid: int, request: Request, user: User = Depends(need("patients.view")), db: Session = Depends(get_db)):
    encs = encounter_scope(db, user).filter(Encounter.patient_id == pid).order_by(Encounter.date_of_service.desc()).all()
    p = org_scope(db.query(Patient), Patient, user).filter(Patient.id == pid).first()
    if not p or not encs:
        raise HTTPException(404, "Patient not found.")
    audit(db, request, user, "phi.view_patient", "patient", pid)
    db.commit()
    data = patient_json(p, len(encs), encs[0].date_of_service.isoformat())
    if "patients.contact" in user.perms:
        data.update(phone=p.phone, email=p.email)
    data["organization"] = db.get(Organization, p.org_id).name
    data["history"] = [enc_json(e) for e in encs]
    data["documents"] = [dict(id=d.id, title=d.title, type=d.doc_type, encounter=e.external_id, date=e.date_of_service.isoformat()) for e in encs for d in e.live_documents]
    logs = db.query(CodingAuditLog).filter(CodingAuditLog.entity == "patient", CodingAuditLog.entity_id == str(pid)).order_by(CodingAuditLog.id.desc()).limit(15).all()
    data["audit"] = [dict(action=l.action, user=l.user.full_name if l.user else "System", at=l.created_at.isoformat()) for l in logs]
    return data


# ---- Encounters and queues --------------------------------------------------
def filtered_encounters(db, user, q="", status="", priority="", coder_id=None, field="all"):
    base = encounter_scope(db, user).join(Patient, Encounter.patient_id == Patient.id)
    if q:
        like = f"%{q}%"
        options = dict(job=[Encounter.external_id], fin=[Encounter.fin], dos=[func.cast(Encounter.date_of_service, String)],
                       all=[Encounter.external_id, Encounter.fin, Patient.last_name, Patient.first_name, Patient.mrn])
        base = base.filter(or_(*[c.ilike(like) for c in options.get(field, options["all"])]))
    if status:
        base = base.filter(Encounter.coding_status == status)
    if priority:
        base = base.filter(Encounter.priority == priority)
    if coder_id:
        base = base.filter(Encounter.assigned_coder_id == coder_id)
    return base


@router.get("/encounters")
def encounters(q: str = "", field: str = "all", status: str = "", priority: str = "", coder_id: Optional[int] = None, sort: str = "-date_of_service",
               page: int = Query(1, ge=1), size: int = Query(15, le=100), user: User = Depends(need("encounters.view")), db: Session = Depends(get_db)):
    base = filtered_encounters(db, user, q, status, priority, coder_id, field)
    base = sort_by(base, sort, dict(date_of_service=Encounter.date_of_service, external_id=Encounter.external_id, priority=Encounter.priority,
                                    coding_status=Encounter.coding_status, due_at=Encounter.due_at, patient=Patient.last_name), Encounter.date_of_service)
    return page_of(base, page, size, enc_json)


def session_for(db, e):
    return db.query(CodingSession).filter_by(encounter_id=e.id).order_by(CodingSession.id.desc()).first()


def codes_json(db, s):
    dx = db.query(SelectedDiagnosisCode).filter_by(session_id=s.id).order_by(SelectedDiagnosisCode.sequence).all()
    pr = db.query(SelectedProcedureCode).filter_by(session_id=s.id).all()
    return dict(diagnoses=[dict(id=d.id, code=d.code, description=d.description, sequence=d.sequence, source=d.source) for d in dx],
                procedures=[dict(id=p.id, code=p.code, system=p.code_system, description=p.description, units=p.units, source=p.source, modifiers=[m.modifier for m in p.modifiers]) for p in pr])


PDF_FONT, PDF_SIZE, PDF_LEAD, PDF_MARGIN = "Helvetica", 10.5, 15, 54


def doc_layout(d):
    """Wrap a document into pages of lines. The same layout feeds the page count and the rendered PDF."""
    width = letter[0] - 2 * PDF_MARGIN
    lines = []
    for para in (d.text or "").split("\n"):
        cur = ""
        words = para.split()
        if not words:
            lines.append("")
            continue
        for w in words:
            t = (cur + " " + w).strip()
            if stringWidth(t, PDF_FONT, PDF_SIZE) <= width:
                cur = t
            else:
                lines.append(cur)
                cur = w
        lines.append(cur)
    per_page = int((letter[1] - 2 * PDF_MARGIN - 40) / PDF_LEAD)
    return [lines[i:i + per_page] for i in range(0, len(lines), per_page)] or [[]]


def doc_pdf(e, d):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter, invariant=1)
    pages, ver = doc_layout(d), (d.versions[-1].version if d.versions else 1)
    c.setTitle(d.title)
    for n, lines in enumerate(pages, 1):
        c.setFont("Helvetica-Bold", 12)
        c.drawString(PDF_MARGIN, letter[1] - PDF_MARGIN, d.title)
        c.setFont("Helvetica", 8.5)
        c.setFillGray(.4)
        c.drawString(PDF_MARGIN, letter[1] - PDF_MARGIN - 14, f"{e.external_id} | Version {ver} | Synthetic demo document | Page {n} of {len(pages)}")
        c.setFillGray(0)
        c.setFont(PDF_FONT, PDF_SIZE)
        y = letter[1] - PDF_MARGIN - 40
        for ln in lines:
            c.drawString(PDF_MARGIN, y, ln)
            y -= PDF_LEAD
        c.showPage()
    c.save()
    return buf.getvalue()


DOC_EXTS = {".pdf", ".docx", ".txt", ".jpg", ".jpeg", ".png", ".tif", ".tiff"}
DOC_TYPES = ["clinical_note", "progress", "operative_report", "discharge_summary", "lab_report", "imaging_report", "physician_documentation", "other"]
LOCKED = ("pending_qa", "approved")
MIME = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".tif": "image/tiff", ".tiff": "image/tiff",
        ".txt": "text/plain; charset=utf-8", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
DOC_VIEWS = dict(all=None, queue=("uploaded", "queued", "processing"), extracted=("extracted", "reviewed"), failed=("failed", "needs_attention"))
WORKING = ("uploaded", "queued", "processing")


def sniff_ok(ext, data):
    """The file's first bytes must match its extension, so a renamed file is refused."""
    if ext == ".pdf":
        return data[:5] == b"%PDF-"
    if ext == ".png":
        return data[:8] == b"\x89PNG\r\n\x1a\n"
    if ext in (".jpg", ".jpeg"):
        return data[:3] == b"\xff\xd8\xff"
    if ext in (".tif", ".tiff"):
        return data[:4] in (b"II*\x00", b"MM\x00*")
    if ext == ".docx":
        return data[:4] == b"PK\x03\x04"
    return ext == ".txt" and b"\x00" not in data[:4096]


def extract_text(data, ext):
    """Returns (text, pages, method, attention note). Only text that really is in the file comes back. OCR is not connected."""
    if ext == ".txt":
        text = data.decode("utf-8", errors="replace").strip()
        return text, None, "text", None if text else "The file is empty."
    if ext == ".pdf":
        r = PdfReader(io.BytesIO(data))
        if r.is_encrypted:
            raise ValueError("The PDF is password protected.")
        text = "\n\n".join(t for t in ((pg.extract_text() or "").strip() for pg in r.pages) if t)
        return text, len(r.pages), "pdf-text", None if len(text) >= 20 else "No text layer was found. OCR is not connected, so this scan needs a text version."
    if ext == ".docx":
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            if z.getinfo("word/document.xml").file_size > 8_000_000:
                raise ValueError("The document is too large to read safely.")
            xml = z.read("word/document.xml").decode("utf-8", errors="replace")
        paras = ["".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.S)) for p in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S)]
        text = html.unescape("\n".join(paras)).strip()
        return text, None, "docx", None if text else "No text was found in this document."
    return "", 1, "none", "OCR is not connected, so text cannot be read from this image."


def log_doc(db, d, v, event, detail="", user=None):
    db.add(DocumentEvent(org_id=d.org_id, document_id=d.id, version=v.version if v else None, event=event, status=d.status, detail=(detail or "")[:300], user_id=user.id if user else None))


def process_document(did, vid):
    """Runs after the upload response. It really reads the stored file, and records every state it passes through."""
    db = SessionLocal()
    try:
        d, v = db.get(ClinicalDocument, did), db.get(ClinicalDocumentVersion, vid)
        if not d or not v or d.deleted_at:
            return
        d.status, d.status_detail = "processing", None
        log_doc(db, d, v, "processing", "Reading the file")
        db.commit()
        outcome, detail = "extracted", ""
        try:
            text, pages, method, note = extract_text((UPLOAD_DIR / v.stored_name).read_bytes(), Path(v.filename).suffix.lower())
            v.content, v.page_count, v.extract_method = text, pages, method
            if v.version != max(x.version for x in d.versions):  # a newer version arrived while this one was being read
                log_doc(db, d, v, "superseded", "A newer version replaced this one before reading finished")
                db.commit()
                return
            if note:
                d.status, d.status_detail, outcome, detail = "needs_attention", note, "needs_attention", note
            else:
                d.status, d.status_detail, detail = "extracted", None, f"{len(text)} characters read" + (f" from {pages} page(s)" if pages else "")
        except Exception as ex:
            db.rollback()
            d, v = db.get(ClinicalDocument, did), db.get(ClinicalDocumentVersion, vid)
            d.status, d.status_detail, outcome = "failed", f"{type(ex).__name__}: {ex}"[:240], "failed"
            detail = d.status_detail
        log_doc(db, d, v, outcome, detail)
        db.commit()
    finally:
        db.close()


def doc_json(d):
    v = d.versions[-1] if d.versions else None
    ext = Path(v.filename).suffix.lower() if v and v.filename else ""
    viewer = "image" if ext in (".jpg", ".jpeg", ".png") else "none" if ext in (".tif", ".tiff") else "pdf"
    who = (v.uploader.full_name if v and v.uploader else d.uploader.full_name if d.uploader else "Synthetic seed data")
    return dict(id=d.id, type=d.doc_type, title=d.title, text=d.text, version=v.version if v else 1, versions=len(d.versions), status=d.status, status_detail=d.status_detail,
                pages=(v.page_count if v and v.page_count else len(doc_layout(d))), size=(v.size if v and v.size else len(d.text.encode("utf8"))), filename=v.filename if v else None,
                created_at=(v.created_at if v else d.created_at).isoformat(), uploaded_by=who, source=d.source, viewer=viewer, method=v.extract_method if v else None)


def documents_json(e):
    return [doc_json(d) for d in e.live_documents]


def fresh_docs(db, e):
    db.expire(e, ["documents"])
    return documents_json(e)


def doc_for(db, user, did):
    d = db.get(ClinicalDocument, did)
    if not d or d.deleted_at:
        raise HTTPException(404, "Document not found.")
    return get_encounter(db, user, d.encounter_id), d  # raises 404 when the encounter is outside this user's scope


def not_locked(e):
    if e.coding_status in LOCKED:
        raise HTTPException(409, "Documents cannot be changed while the encounter is in QA or approved.")


async def read_upload(f):
    name = Path(f.filename or "file").name
    ext = Path(name).suffix.lower()
    if ext not in DOC_EXTS:
        raise HTTPException(422, f"{name}: this file type is not allowed. Use PDF, DOCX, TXT, JPEG, PNG or TIFF.")
    data = await f.read(MAX_UPLOAD + 1)
    if not data:
        raise HTTPException(422, f"{name}: the file is empty.")
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, f"{name}: files must be under 10 MB.")
    if not sniff_ok(ext, data):
        raise HTTPException(422, f"{name}: the contents do not match the file type.")
    return name, ext, data


def store_version(d, user, name, ext, data):
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored = secrets.token_hex(16) + ext
    (UPLOAD_DIR / stored).write_bytes(data)
    v = ClinicalDocumentVersion(version=max((x.version for x in d.versions), default=0) + 1, content="", filename=name[:200], stored_name=stored, content_type=MIME[ext],
                                size=len(data), uploaded_by_id=user.id, sha256=hashlib.sha256(data).hexdigest())
    d.versions.append(v)
    return v


def has_digest(e, digest):
    return any(v.sha256 == digest for d in e.live_documents for v in d.versions)


@router.get("/encounters/{eid}/documents")
def encounter_documents(eid: int, user: User = Depends(need("encounters.view")), db: Session = Depends(get_db)):
    return documents_json(get_encounter(db, user, eid))


@router.post("/encounters/{eid}/documents")
async def upload_documents(eid: int, request: Request, background: BackgroundTasks, files: List[UploadFile] = File(...), doc_type: str = Form("other"),
                           user: User = Depends(need("uploads.manage")), db: Session = Depends(get_db)):
    e = get_encounter(db, user, eid)
    not_locked(e)
    if doc_type not in DOC_TYPES:
        raise HTTPException(422, "Choose a document type from the list.")
    if len(files) > 10:
        raise HTTPException(422, "Upload at most 10 files at a time.")
    items, seen = [], set()
    for f in files:  # validate everything first so a bad file does not leave a partial upload behind
        name, ext, data = await read_upload(f)
        digest = hashlib.sha256(data).hexdigest()
        if digest in seen or has_digest(e, digest):
            raise HTTPException(409, f"{name}: this file is already attached to this encounter.")
        seen.add(digest)
        items.append((name, ext, data))
    jobs = []
    for name, ext, data in items:
        d = ClinicalDocument(org_id=e.org_id, encounter_id=e.id, doc_type=doc_type, title=Path(name).stem[:160] or "Document", status="queued", source="upload", uploaded_by_id=user.id)
        db.add(d)
        db.flush()
        v = store_version(d, user, name, ext, data)
        db.flush()
        log_doc(db, d, v, "uploaded", f"{name}, {len(data)} bytes", user)
        log_doc(db, d, v, "queued", "Waiting for text extraction")
        audit(db, request, user, "documents.uploaded", "document", d.id, name)
        jobs.append((d.id, v.id))
    db.commit()
    for j in jobs:
        background.add_task(process_document, *j)
    return fresh_docs(db, e)


@router.post("/documents/{did}/replace")
async def replace_document(did: int, request: Request, background: BackgroundTasks, file: UploadFile = File(...), user: User = Depends(need("uploads.manage")), db: Session = Depends(get_db)):
    e, d = doc_for(db, user, did)
    not_locked(e)
    name, ext, data = await read_upload(file)
    if has_digest(e, hashlib.sha256(data).hexdigest()):
        raise HTTPException(409, f"{name}: this exact file is already attached to this encounter.")
    v = store_version(d, user, name, ext, data)
    d.status, d.status_detail = "queued", None
    db.flush()
    log_doc(db, d, v, "replaced", f"Version {v.version} uploaded as {name}. Suggestions made from the earlier version may be out of date.", user)
    audit(db, request, user, "documents.replaced", "document", d.id, f"version {v.version}")
    db.commit()
    background.add_task(process_document, d.id, v.id)
    return fresh_docs(db, e)


@router.post("/documents/{did}/reprocess")
def reprocess_document(did: int, request: Request, background: BackgroundTasks, user: User = Depends(need("documents.reprocess")), db: Session = Depends(get_db)):
    e, d = doc_for(db, user, did)
    not_locked(e)
    v = d.versions[-1] if d.versions else None
    if d.status in WORKING:
        raise HTTPException(409, "This document is already being processed.")
    if not v or not v.stored_name:
        raise HTTPException(409, "This document has no uploaded file to read again.")
    d.status, d.status_detail = "queued", None
    log_doc(db, d, v, "reprocessed", "Retry requested", user)
    audit(db, request, user, "documents.reprocessed", "document", d.id)
    db.commit()
    background.add_task(process_document, d.id, v.id)
    return fresh_docs(db, e)


@router.post("/documents/{did}/reviewed")
def mark_reviewed(did: int, request: Request, user: User = Depends(need("coding.perform", "qa.review")), db: Session = Depends(get_db)):
    e, d = doc_for(db, user, did)
    if d.status != "extracted":
        raise HTTPException(409, "Only a document whose text was extracted can be marked reviewed.")
    d.status = "reviewed"
    log_doc(db, d, d.versions[-1] if d.versions else None, "reviewed", "Marked reviewed", user)
    audit(db, request, user, "documents.reviewed", "document", d.id)
    db.commit()
    return fresh_docs(db, e)


@router.delete("/documents/{did}")
def delete_document(did: int, request: Request, user: User = Depends(need("documents.delete")), db: Session = Depends(get_db)):
    e, d = doc_for(db, user, did)
    not_locked(e)
    used = db.query(CodingRecommendation).filter(CodingRecommendation.document_id == d.id, CodingRecommendation.status != "rejected").count()
    if used:
        raise HTTPException(409, "Codes were suggested or accepted from this document. Reject those suggestions first, or keep the document for the record.")
    d.deleted_at = now()  # retained in the database and on disk. Nothing is erased
    log_doc(db, d, d.versions[-1] if d.versions else None, "deleted", "Removed from the encounter. The record is retained", user)
    audit(db, request, user, "documents.deleted", "document", d.id, d.title)
    db.commit()
    return fresh_docs(db, e)


@router.get("/documents/{did}/history")
def document_history(did: int, user: User = Depends(need("documents.view")), db: Session = Depends(get_db)):
    e, d = doc_for(db, user, did)
    events = db.query(DocumentEvent).filter_by(document_id=d.id).order_by(DocumentEvent.id).all()
    return dict(title=d.title, encounter=e.external_id, status=d.status,
                versions=[dict(version=v.version, filename=v.filename or "Seed note", size=v.size or len(v.content.encode("utf8")), pages=v.page_count, method=v.extract_method, characters=len(v.content),
                               uploaded_by=v.uploader.full_name if v.uploader else "Synthetic seed data", at=v.created_at.isoformat()) for v in d.versions],
                events=[dict(id=x.id, event=x.event, status=x.status, detail=x.detail, version=x.version, user=x.user.full_name if x.user else "System", at=x.created_at.isoformat()) for x in events])


def scoped_docs(db, user, deleted=False):
    ids = encounter_scope(db, user).with_entities(Encounter.id).subquery()
    q = db.query(ClinicalDocument).join(Encounter, Encounter.id == ClinicalDocument.encounter_id).filter(ClinicalDocument.encounter_id.in_(select(ids.c.id)))
    return q if deleted else q.filter(ClinicalDocument.deleted_at.is_(None))


@router.get("/documents")
def documents_list(view: str = "all", q: str = "", page: int = Query(1, ge=1), size: int = Query(15, le=100), user: User = Depends(need("documents.view")), db: Session = Depends(get_db)):
    if view not in DOC_VIEWS:
        raise HTTPException(422, "Unknown view.")
    base = scoped_docs(db, user)
    if q.strip():
        like = f"%{q.strip()}%"
        base = base.filter(or_(ClinicalDocument.title.ilike(like), Encounter.external_id.ilike(like)))
    counts = {k: (base.filter(ClinicalDocument.status.in_(st)) if st else base).count() for k, st in DOC_VIEWS.items()}
    rows = base.filter(ClinicalDocument.status.in_(DOC_VIEWS[view])) if DOC_VIEWS[view] else base

    def row(d):
        j = doc_json(d)
        j.update(encounter_id=d.encounter_id, encounter_status=d.encounter.coding_status, encounter=d.encounter.external_id, patient=f"{d.encounter.patient.last_name}, {d.encounter.patient.first_name}", preview=" ".join(d.text.split())[:160], characters=len(d.text))
        j.pop("text")
        return j
    out = page_of(rows.order_by(ClinicalDocument.id.desc()), page, size, row)
    out["counts"] = counts
    return out


@router.get("/documents-events")
def documents_events(page: int = Query(1, ge=1), size: int = Query(20, le=100), user: User = Depends(need("documents.view")), db: Session = Depends(get_db)):
    ids = scoped_docs(db, user, deleted=True).with_entities(ClinicalDocument.id).subquery()  # history keeps deleted documents
    q = db.query(DocumentEvent).filter(DocumentEvent.document_id.in_(select(ids.c.id))).order_by(DocumentEvent.id.desc())

    def row(x):
        d = db.get(ClinicalDocument, x.document_id)
        return dict(id=x.id, at=x.created_at.isoformat(), event=x.event, status=x.status, detail=x.detail, version=x.version, user=x.user.full_name if x.user else "System",
                    document=d.title, document_id=d.id, encounter=d.encounter.external_id, encounter_id=d.encounter_id, encounter_status=d.encounter.coding_status)
    return page_of(q, page, size, row)


def find_doc(e, did):
    d = next((x for x in e.live_documents if x.id == did), None)
    if not d:
        raise HTTPException(404, "Document not found.")
    return d


def doc_file_response(e, d, *, original, download=False):
    v = d.versions[-1] if d.versions else None
    ext = Path(v.filename).suffix.lower() if v and v.filename else ""
    if v and v.stored_name and (original or ext == ".pdf"):
        if original is False and ext != ".pdf":
            raise HTTPException(415, "This document is not a PDF.")
        inline = ext in (".pdf", ".png", ".jpg", ".jpeg") and not download
        return FileResponse(UPLOAD_DIR / v.stored_name, media_type=MIME[ext], filename=v.filename, content_disposition_type="inline" if inline else "attachment",
                            headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"})
    if v and v.stored_name and ext in (".jpg", ".jpeg", ".png", ".tif", ".tiff") and not original:
        raise HTTPException(415, "This document is an image, not a PDF.")
    return Response(doc_pdf(e, d), media_type="application/pdf", headers={"Content-Disposition": f'{"attachment" if download else "inline"}; filename="document-{d.id}.pdf"', "Cache-Control": "no-store"})


@router.get("/encounters/{eid}/documents/{did}/pdf")
def document_pdf(eid: int, did: int, request: Request, user: User = Depends(need("encounters.view")), db: Session = Depends(get_db)):
    e = get_encounter(db, user, eid)
    d = find_doc(e, did)
    audit(db, request, user, "phi.view_document", "document", did)
    db.commit()
    return doc_file_response(e, d, original=False)


@router.get("/encounters/{eid}/documents/{did}/file")
def document_file(eid: int, did: int, request: Request, download: bool = False, user: User = Depends(need("encounters.view")), db: Session = Depends(get_db)):
    e = get_encounter(db, user, eid)
    d = find_doc(e, did)
    audit(db, request, user, "phi.download_document" if download else "phi.view_document", "document", did)
    db.commit()
    return doc_file_response(e, d, original=True, download=download)


def review_json(r):
    return dict(id=r.id, decision=r.decision, reason=r.reason, comment=r.comment, reviewer=r.reviewer.full_name, at=r.created_at.isoformat(),
                codes=[dict(code=c.code, system=c.code_system, action=c.action) for c in r.codes])


@router.get("/encounters/{eid}")
def encounter_detail(eid: int, request: Request, user: User = Depends(need("encounters.view")), db: Session = Depends(get_db)):
    e = get_encounter(db, user, eid)
    audit(db, request, user, "phi.view_encounter", "encounter", eid)
    db.commit()
    data = enc_json(e)
    data["dob"], data["gender"] = e.patient.dob.isoformat(), e.patient.gender
    data["documents"] = documents_json(e)
    sessions = db.query(CodingSession).filter_by(encounter_id=e.id).order_by(CodingSession.id.desc()).all()
    data["sessions"] = [dict(id=s.id, coder=s.coder.full_name, status=s.status, started=s.started_at.isoformat(), submitted=s.submitted_at.isoformat() if s.submitted_at else None, **codes_json(db, s)) for s in sessions]
    data["reviews"] = [review_json(r) for r in db.query(CodingReview).filter(CodingReview.session_id.in_([s.id for s in sessions] or [0])).order_by(CodingReview.id.desc()).all()]
    data["uploads"] = []
    return data


class AssignIn(BaseModel):
    encounter_ids: List[int]
    coder_id: int
    priority: Optional[str] = None


@router.post("/encounters/assign")
def assign(body: AssignIn, request: Request, user: User = Depends(need("cases.assign")), db: Session = Depends(get_db)):
    coder = db.get(User, body.coder_id)
    if not coder or not coder.is_active or (coder.org_id != user.org_id and not is_global(user)) or "coding.perform" not in coder.perms:
        raise HTTPException(422, "Choose an active coder in this organization.")
    done = 0
    for eid in body.encounter_ids:
        e = get_encounter(db, user, eid)
        if e.org_id != coder.org_id:
            raise HTTPException(422, "That coder belongs to a different organization.")
        if e.coding_status in ("approved", "pending_qa"):
            continue
        e.assigned_coder_id = coder.id
        if e.coding_status in ("unassigned", "assigned"):
            e.coding_status = "assigned"
        if body.priority:
            e.priority = body.priority
        db.add(TaskAssignment(org_id=e.org_id, encounter_id=e.id, assignee_id=coder.id, assigned_by_id=user.id, title=f"Code encounter {e.external_id}", due_at=e.due_at))
        notify(db, e.org_id, coder.id, "assignment", f"{e.external_id} was assigned to you", f"/workspace/{e.id}")
        audit(db, request, user, "cases.assign", "encounter", e.id, f"coder={coder.id}")
        done += 1
    db.commit()
    return dict(assigned=done)


class StatusIn(BaseModel):
    action: str
    note: Optional[str] = None


@router.post("/encounters/{eid}/status")
def set_status(eid: int, body: StatusIn, request: Request, user: User = Depends(need("cases.assign", "coding.perform")), db: Session = Depends(get_db)):
    e = get_encounter(db, user, eid)
    if body.action == "hold":
        e.coding_status = "on_hold"
    elif body.action == "resume":
        e.coding_status = "assigned" if e.assigned_coder_id else "unassigned"
    elif body.action == "escalate":
        e.coding_status = "escalated"
        for m in db.query(User).filter_by(org_id=e.org_id, is_active=True).all():
            if "cases.assign" in m.perms and "users.manage_org" not in m.perms:
                notify(db, e.org_id, m.id, "escalation", f"{e.external_id} was escalated", f"/encounters/{e.id}")
    elif body.action == "archive":
        if "cases.assign" not in user.perms:
            raise HTTPException(403, "You do not have permission to do this.")
        e.archived_at = now()
    else:
        raise HTTPException(422, "Unknown action.")
    audit(db, request, user, f"cases.{body.action}", "encounter", e.id, body.note)
    db.commit()
    return dict(ok=True)


@router.get("/queues/summary")
def queue_summary(user: User = Depends(need("queues.view")), db: Session = Depends(get_db)):
    enc = encounter_scope(db, user).all()
    counts = Counter(e.coding_status for e in enc)
    load = Counter(e.coder.full_name for e in enc if e.coder and e.coding_status in OPEN_STATES)
    return dict(counts=counts, overdue=sum(1 for e in enc if e.due_at and e.due_at < now() and e.coding_status in ["unassigned", *OPEN_STATES]),
                workload=[dict(coder=k, open=v) for k, v in load.most_common()],
                queues=[dict(id=q.id, name=q.name, sla_hours=q.sla_hours) for q in org_scope(db.query(WorkQueue), WorkQueue, user).all()])


@router.get("/coders")
def coders(user: User = Depends(need("cases.assign")), db: Session = Depends(get_db)):
    rows = org_scope(db.query(User), User, user).filter(User.is_active.is_(True), User.deleted_at.is_(None)).all()
    return [dict(id=u.id, name=u.full_name, org_id=u.org_id) for u in rows if "coding.perform" in u.perms]


# ---- Code catalogs ----------------------------------------------------------
CATALOG = dict(ICD10=DiagnosisCode, CPT=ProcedureCode, HCPCS=HcpcsCode)


def code_row(db, system, code):
    return db.query(CATALOG[system]).filter_by(code=code).first()


def row_json(c):
    return {k: (v.isoformat() if isinstance(v, date) else v) for k, v in c.__dict__.items() if not k.startswith("_")}


@router.get("/codes/{system}")
def code_search(system: str, q: str = "", page: int = Query(1, ge=1), size: int = Query(20, le=100), user: User = Depends(need("codes.view")), db: Session = Depends(get_db)):
    m = CATALOG.get(system)
    if not m:
        raise HTTPException(404, "Unknown code system.")
    base = db.query(m)
    if q:
        base = base.filter(or_(m.code.ilike(f"%{q}%"), m.description.ilike(f"%{q}%")))
    return page_of(base.order_by(m.code), page, size, row_json)


# ---- Coding workspace -------------------------------------------------------
def editable_session(db, user, eid):
    if "coding.perform" not in user.perms:
        raise HTTPException(403, "You do not have permission to do this.")
    e = get_encounter(db, user, eid)
    if e.assigned_coder_id != user.id and "cases.assign" not in user.perms:
        raise HTTPException(403, "This encounter is assigned to another coder.")
    if e.coding_status not in ("assigned", "in_progress", "rejected"):
        raise HTTPException(409, "This encounter cannot be edited in its current status.")
    s = db.query(CodingSession).filter_by(encounter_id=e.id, status="open").order_by(CodingSession.id.desc()).first()
    if not s:
        s = CodingSession(org_id=e.org_id, encounter_id=e.id, coder_id=user.id, status="open", reference_version=REFERENCE)
        db.add(s)
        db.flush()
    if e.coding_status != "in_progress":
        e.coding_status = "in_progress"
    return e, s


def workspace_json(db, user, e):
    s = session_for(db, e)
    data = enc_json(e)
    data.update(dob=e.patient.dob.isoformat(), gender=e.patient.gender, documents=documents_json(e), session=None, recommendations=[], validations=[], diagnoses=[], procedures=[], reviews=[],
                can_edit=("coding.perform" in user.perms and (e.assigned_coder_id == user.id or "cases.assign" in user.perms) and e.coding_status in ("assigned", "in_progress", "rejected")))
    if s:
        recs = db.query(CodingRecommendation).filter_by(session_id=s.id).all()
        data["session"] = dict(id=s.id, status=s.status, ai_status=s.ai_status, model_version=s.model_version, reference_version=s.reference_version, checklist=s.checklist)
        data["recommendations"] = [dict(id=r.id, system=r.code_system, code=r.code, description=r.description, evidence=r.evidence, document_id=r.document_id, rationale=r.rationale,
                                        guideline=r.guideline, confidence=r.confidence, basis=r.basis, status=r.status) for r in recs]
        data["validations"] = [dict(severity=v.severity, rule=v.rule, message=v.message) for v in db.query(CodingValidation).filter_by(session_id=s.id).all()]
        data.update(codes_json(db, s))
        data["reviews"] = [review_json(r) for r in db.query(CodingReview).filter_by(session_id=s.id).order_by(CodingReview.id.desc()).all()]
    return data


@router.get("/encounters/{eid}/workspace")
def workspace(eid: int, request: Request, user: User = Depends(need("encounters.view")), db: Session = Depends(get_db)):
    e = get_encounter(db, user, eid)
    audit(db, request, user, "phi.open_workspace", "encounter", eid)
    db.commit()
    return workspace_json(db, user, e)


def lookup_desc(db):
    return lambda system, code: (lambda r: r.description if r is not None else code)(code_row(db, system, code))


AGENTS = [("Document Ingestion Agent", "active", "Loads the stored document text for the encounter."),
          ("OCR / PDF Extraction Agent", "not_connected", "Not connected. Documents here already hold text, so no OCR runs."),
          ("Clinical Documentation Agent", "not_connected", "Not connected. Documentation gap rules run inside the mock coding engine."),
          ("Diagnosis Extraction Agent", "not_connected", "Not connected. No clinical NLP model is installed."),
          ("ICD-10-CM Coding Agent", "mock", "Keyword rule mock. Not a trained model."),
          ("CPT Coding Agent", "mock", "Keyword rule mock. Not a trained model."),
          ("HCPCS Coding Agent", "mock", "Keyword rule mock. Not a trained model."),
          ("Coding Guidelines Retrieval Agent", "not_connected", "Not connected. Needs the Qdrant retrieval service."),
          ("Coding Validation Agent", "active", "Rule checks on the selected codes. Demo edits, not licensed NCCI tables."),
          ("Independent Audit Agent", "not_connected", "Not connected. QA review is done by a human auditor.")]


def event_json(r):
    ms = int((r.completed_at - r.started_at).total_seconds() * 1000) if r.completed_at else None
    return dict(id=r.id, run_id=r.run_id, seq=r.seq, agent=r.agent, task=r.task, status=r.status, started_at=r.started_at.isoformat(),
                completed_at=r.completed_at.isoformat() if r.completed_at else None, duration_ms=ms, result=r.result, error=r.error, source=r.source)


@router.post("/encounters/{eid}/generate")
def generate(eid: int, request: Request, user: User = Depends(need("ai.generate")), db: Session = Depends(get_db)):
    e, s = editable_session(db, user, eid)
    if any(d.status in WORKING for d in e.live_documents):
        raise HTTPException(409, "A document is still being processed. Try again when it finishes.")
    run, seq = secrets.token_hex(6), [0]

    def log(agent, task, status, t0, t1, result="", error=""):
        seq[0] += 1
        db.add(AgentEvent(org_id=e.org_id, encounter_id=e.id, session_id=s.id, run_id=run, seq=seq[0], agent=agent, task=task, status=status,
                          started_at=t0, completed_at=t1, result=result[:500], error=error[:500]))

    db.query(CodingRecommendation).filter_by(session_id=s.id, status="pending").delete()
    db.query(CodingValidation).filter_by(session_id=s.id).delete()
    existing = {r.code for r in db.query(CodingRecommendation).filter_by(session_id=s.id).all()}
    t0 = now()
    documents = [(d.id, d.title, d.text) for d in e.live_documents]
    log("Document Ingestion Agent", f"Loaded {len(documents)} stored document(s)", "completed", t0, now(), f"{sum(len(x[2]) for x in documents)} characters of stored text. No OCR was needed.")
    t1 = now()
    try:
        recs, gaps, abstained = engine.generate(documents, lookup_desc(db))
    except Exception as ex:  # record the failure so it shows in Agent Activity, then report it
        log("ICD-10-CM Coding Agent", "Rule engine run", "failed", t1, now(), error=f"{type(ex).__name__}: {ex}")
        s.ai_status = "failed"
        db.commit()
        raise HTTPException(500, "The coding engine failed. Details are in Agent Activity.")
    t2 = now()
    for r in recs:
        if r["code"] not in existing:
            db.add(CodingRecommendation(session_id=s.id, model_version=MODEL, **r))
    by = Counter(r["code_system"] for r in recs)
    for agent, system in (("ICD-10-CM Coding Agent", "ICD10"), ("CPT Coding Agent", "CPT"), ("HCPCS Coding Agent", "HCPCS")):
        log(agent, f"Matched {system} keyword rules (all three systems run in one engine pass)", "requires_review" if abstained else "completed", t1, t2,
            "Abstained: documentation too short to support a code." if abstained else f"{by.get(system, 0)} suggestion(s). The coder must confirm each against the note.")
    t3 = now()
    for g in gaps:
        db.add(CodingValidation(session_id=s.id, **g))
    worst = "warning" if any(g["severity"] in ("error", "warning") for g in gaps) else "completed"
    log("Coding Validation Agent", "Stored documentation gap checks", worst, t3, now(), f"{len(gaps)} documentation finding(s)." if gaps else "No documentation gaps found by the rule checks.")
    s.ai_status, s.model_version = "abstained" if abstained else "complete", MODEL
    audit(db, request, user, "coding.ai_generated", "encounter", e.id, f"model={MODEL} reference={REFERENCE} count={len(recs)}")
    db.commit()
    return workspace_json(db, user, e)


@router.get("/encounters/{eid}/agent-events")
def agent_events(eid: int, user: User = Depends(need("encounters.view")), db: Session = Depends(get_db)):
    e = get_encounter(db, user, eid)
    rows = db.query(AgentEvent).filter_by(encounter_id=e.id).order_by(AgentEvent.id.desc()).limit(60).all()
    return dict(agents=[dict(name=n, state=st, note=note) for n, st, note in AGENTS], events=[event_json(r) for r in reversed(rows)],
                source_note="Events are real timings from the keyword rule mock. No trained model ran.")


class RecIn(BaseModel):
    action: str


def next_seq(db, sid):
    return (db.query(func.max(SelectedDiagnosisCode.sequence)).filter_by(session_id=sid).scalar() or 0) + 1


def add_code(db, s, system, code, description, source, rec_id=None):
    if system == "ICD10":
        if not db.query(SelectedDiagnosisCode).filter_by(session_id=s.id, code=code).first():
            db.add(SelectedDiagnosisCode(session_id=s.id, code=code, description=description, sequence=next_seq(db, s.id), source=source, recommendation_id=rec_id))
    elif not db.query(SelectedProcedureCode).filter_by(session_id=s.id, code=code).first():
        db.add(SelectedProcedureCode(session_id=s.id, code_system=system, code=code, description=description, source=source, recommendation_id=rec_id))


@router.post("/encounters/{eid}/recommendations/{rid}")
def decide_rec(eid: int, rid: int, body: RecIn, request: Request, user: User = Depends(need("coding.perform")), db: Session = Depends(get_db)):
    e, s = editable_session(db, user, eid)
    r = db.query(CodingRecommendation).filter_by(id=rid, session_id=s.id).first()
    if not r or body.action not in ("accept", "reject"):
        raise HTTPException(404, "Suggestion not found.")
    r.status = "accepted" if body.action == "accept" else "rejected"
    if body.action == "accept":
        add_code(db, s, r.code_system, r.code, r.description, "ai", r.id)
    audit(db, request, user, f"coding.ai_{r.status}", "encounter", e.id, r.code)
    db.commit()
    return workspace_json(db, user, e)


class CodeIn(BaseModel):
    system: str
    code: str


@router.post("/encounters/{eid}/codes")
def manual_code(eid: int, body: CodeIn, request: Request, user: User = Depends(need("coding.perform")), db: Session = Depends(get_db)):
    e, s = editable_session(db, user, eid)
    if body.system not in CATALOG:
        raise HTTPException(422, "Unknown code system.")
    c = code_row(db, body.system, body.code)
    if c is None:
        raise HTTPException(404, "That code is not in the catalog.")
    add_code(db, s, body.system, c.code, c.description, "manual")
    audit(db, request, user, "coding.code_added", "encounter", e.id, c.code)
    db.commit()
    return workspace_json(db, user, e)


@router.delete("/encounters/{eid}/codes/{system}/{sel_id}")
def remove_code(eid: int, system: str, sel_id: int, request: Request, user: User = Depends(need("coding.perform")), db: Session = Depends(get_db)):
    e, s = editable_session(db, user, eid)
    m = SelectedDiagnosisCode if system == "ICD10" else SelectedProcedureCode
    row = db.query(m).filter_by(id=sel_id, session_id=s.id).first()
    if not row:
        raise HTTPException(404, "Code not found.")
    code = row.code
    db.delete(row)
    db.flush()
    if m is SelectedDiagnosisCode:
        for i, d in enumerate(db.query(m).filter_by(session_id=s.id).order_by(m.sequence).all(), 1):
            d.sequence = i
    audit(db, request, user, "coding.code_removed", "encounter", e.id, code)
    db.commit()
    return workspace_json(db, user, e)


class PrimaryIn(BaseModel):
    selected_id: int


@router.post("/encounters/{eid}/primary")
def set_primary(eid: int, body: PrimaryIn, request: Request, user: User = Depends(need("coding.perform")), db: Session = Depends(get_db)):
    e, s = editable_session(db, user, eid)
    rows = db.query(SelectedDiagnosisCode).filter_by(session_id=s.id).order_by(SelectedDiagnosisCode.sequence).all()
    if body.selected_id not in [r.id for r in rows]:
        raise HTTPException(404, "Code not found.")
    rows.sort(key=lambda r: (r.id != body.selected_id, r.sequence))
    for i, r in enumerate(rows, 1):
        r.sequence = i
    audit(db, request, user, "coding.sequence_changed", "encounter", e.id)
    db.commit()
    return workspace_json(db, user, e)


class ProcIn(BaseModel):
    units: int
    modifiers: List[str] = []


@router.put("/encounters/{eid}/procedures/{sel_id}")
def update_proc(eid: int, sel_id: int, body: ProcIn, request: Request, user: User = Depends(need("coding.perform")), db: Session = Depends(get_db)):
    e, s = editable_session(db, user, eid)
    p = db.query(SelectedProcedureCode).filter_by(id=sel_id, session_id=s.id).first()
    if not p:
        raise HTTPException(404, "Code not found.")
    for m in body.modifiers:
        if not re.fullmatch(r"[A-Za-z0-9]{2}", m):
            raise HTTPException(422, "Modifiers have 2 characters.")
    p.units = body.units
    p.modifiers = [CodingModifier(modifier=m.upper()) for m in dict.fromkeys(body.modifiers)]
    audit(db, request, user, "coding.procedure_updated", "encounter", e.id, p.code)
    db.commit()
    return workspace_json(db, user, e)


def run_validation(db, e, s):
    dx = db.query(SelectedDiagnosisCode).filter_by(session_id=s.id).all()
    pr = db.query(SelectedProcedureCode).filter_by(session_id=s.id).all()
    recs = db.query(CodingRecommendation).filter_by(session_id=s.id).all()
    db.query(CodingValidation).filter_by(session_id=s.id).delete()
    found = validate(dx, pr, recs, lambda sys, c: code_row(db, sys, c)) + (engine.gaps(" ".join(d.text for d in e.live_documents)) if s.ai_status == "complete" else [])
    for v in found:
        db.add(CodingValidation(session_id=s.id, **v))
    return found


@router.post("/encounters/{eid}/validate")
def validate_codes(eid: int, request: Request, user: User = Depends(need("coding.perform")), db: Session = Depends(get_db)):
    e, s = editable_session(db, user, eid)
    run_validation(db, e, s)
    audit(db, request, user, "coding.validated", "encounter", e.id)
    db.commit()
    return workspace_json(db, user, e)


class SubmitIn(BaseModel):
    attested: bool = False


@router.post("/encounters/{eid}/submit")
def submit(eid: int, body: SubmitIn, request: Request, user: User = Depends(need("coding.perform")), db: Session = Depends(get_db)):
    e, s = editable_session(db, user, eid)
    if not body.attested:
        raise HTTPException(422, "Confirm that you reviewed the codes against the documentation.")
    found = run_validation(db, e, s)
    errors = [v for v in found if v["severity"] == "error"]
    if errors:
        db.commit()
        raise HTTPException(409, "Fix the validation errors before submitting: " + " ".join(v["message"] for v in errors))
    s.status, s.submitted_at = "submitted", now()
    e.coding_status, e.qa_status = "pending_qa", "pending"
    for t in db.query(TaskAssignment).filter_by(encounter_id=e.id, status="open", assignee_id=e.assigned_coder_id).all():
        t.status, t.closed_at = "closed", now()
    if e.assigned_auditor_id:
        notify(db, e.org_id, e.assigned_auditor_id, "pending_qa", f"{e.external_id} is ready for QA", f"/qa/{e.id}")
    else:
        for m in db.query(User).filter_by(org_id=e.org_id, is_active=True).all():
            if "qa.review" in m.perms and "users.manage_all" not in m.perms:
                notify(db, e.org_id, m.id, "pending_qa", f"{e.external_id} is ready for QA", f"/qa/{e.id}")
    audit(db, request, user, "coding.submitted", "encounter", e.id, f"session={s.id} model={s.model_version} reference={s.reference_version}")
    db.commit()
    return workspace_json(db, user, e)


# ---- QA ---------------------------------------------------------------------
@router.get("/qa/queue")
def qa_queue(q: str = "", status: str = "pending_qa", page: int = Query(1, ge=1), size: int = Query(15, le=100), user: User = Depends(need("qa.review")), db: Session = Depends(get_db)):
    base = filtered_encounters(db, user, q, status).order_by(Encounter.due_at)
    return page_of(base, page, size, enc_json)


class ReviewIn(BaseModel):
    decision: str
    reason: Optional[str] = None
    comment: Optional[str] = None
    add_codes: List[CodeIn] = []
    remove_codes: List[CodeIn] = []


@router.post("/qa/{eid}/review")
def qa_review(eid: int, body: ReviewIn, request: Request, user: User = Depends(need("qa.review")), db: Session = Depends(get_db)):
    e = get_encounter(db, user, eid)
    if e.coding_status != "pending_qa":
        raise HTTPException(409, "This encounter is not waiting for QA.")
    if body.decision not in ("approved", "rejected"):
        raise HTTPException(422, "Choose approve or return for correction.")
    if body.decision == "rejected" and not body.reason:
        raise HTTPException(422, "Choose a rejection reason.")
    s = session_for(db, e)
    if s.coder_id == user.id:
        raise HTTPException(403, "You cannot review your own coding.")
    r = CodingReview(session_id=s.id, reviewer_id=user.id, decision=body.decision, reason=body.reason, comment=body.comment)
    r.codes = [CodingReviewCode(code_system=c.system, code=c.code, action="added") for c in body.add_codes] + [CodingReviewCode(code_system=c.system, code=c.code, action="removed") for c in body.remove_codes]
    db.add(r)
    e.assigned_auditor_id = user.id
    if body.decision == "approved":
        e.coding_status, e.qa_status, e.completed_at, s.status = "approved", "approved", now(), "approved"
        notify(db, e.org_id, s.coder_id, "approved", f"{e.external_id} was approved", f"/encounters/{e.id}")
    else:
        e.coding_status, e.qa_status, s.status = "rejected", "rejected", "open"
        notify(db, e.org_id, s.coder_id, "rejected", f"{e.external_id} was returned: {body.reason}", f"/workspace/{e.id}")
    audit(db, request, user, f"coding.qa_{body.decision}", "encounter", e.id, body.reason)
    db.commit()
    return workspace_json(db, user, e)


# ---- Notifications, tasks ---------------------------------------------------
@router.get("/notifications")
def notifications(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(Notification).filter_by(user_id=user.id).order_by(Notification.id.desc()).limit(50).all()
    return dict(unread=sum(1 for n in rows if not n.read_at), items=[dict(id=n.id, kind=n.kind, title=n.title, link=n.link, read=bool(n.read_at), at=n.created_at.isoformat()) for n in rows])


@router.post("/notifications/read")
def read_all(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter_by(user_id=user.id, read_at=None).update(dict(read_at=now()))
    db.commit()
    return dict(ok=True)


@router.get("/tasks")
def tasks(status: str = "open", user: User = Depends(current_user), db: Session = Depends(get_db)):
    all_rows = db.query(TaskAssignment).filter_by(assignee_id=user.id).order_by(TaskAssignment.due_at).all()
    return dict(open=sum(t.status == "open" for t in all_rows), closed=sum(t.status == "closed" for t in all_rows),
                items=[dict(id=t.id, title=t.title, kind=t.kind, status=t.status, due_at=t.due_at.isoformat() if t.due_at else None, encounter_id=t.encounter_id) for t in all_rows if t.status == status])


@router.post("/tasks/{tid}/close")
def close_task(tid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = db.query(TaskAssignment).filter_by(id=tid, assignee_id=user.id).first()
    if not t:
        raise HTTPException(404, "Task not found.")
    t.status, t.closed_at = "closed", now()
    db.commit()
    return dict(ok=True)


# ---- CaseCraft: create a case from a pasted chart ---------------------------
class CaseIn(BaseModel):
    patient_id: int
    encounter_type: str = "Office visit"
    note: str


@router.post("/casecraft")
def casecraft(body: CaseIn, request: Request, user: User = Depends(need("casecraft.use")), db: Session = Depends(get_db)):
    if len(body.note.strip()) < 10:
        raise HTTPException(422, "Paste the clinical note first.")
    p = org_scope(db.query(Patient), Patient, user).filter(Patient.id == body.patient_id).first()
    if not p:
        raise HTTPException(404, "Patient not found.")
    n = (db.query(func.count(Encounter.id)).filter_by(org_id=p.org_id).scalar() or 0) + 30001
    e = Encounter(org_id=p.org_id, external_id=f"ENC-{n}", fin=f"F{n}", patient_id=p.id, provider_id=db.query(Provider).filter_by(org_id=p.org_id).first().id,
                  facility_id=db.query(Facility).filter_by(org_id=p.org_id).first().id, date_of_service=date.today(), encounter_type=body.encounter_type,
                  coding_status="assigned", assigned_coder_id=user.id if "coding.perform" in user.perms else None, due_at=now() + timedelta(hours=48))
    db.add(e)
    db.flush()
    d = ClinicalDocument(org_id=p.org_id, encounter_id=e.id, doc_type="progress", title="Pasted clinical note", source="pasted", uploaded_by_id=user.id)
    db.add(d)
    db.flush()
    db.add(ClinicalDocumentVersion(document_id=d.id, content=body.note.strip()))
    audit(db, request, user, "casecraft.created", "encounter", e.id)
    db.commit()
    sentences = re.split(r"(?<=[.])\s+", body.note.strip())
    return dict(id=e.id, external_id=e.external_id, summary=" ".join(sentences[:2]), cdi_issues=engine.gaps(body.note), mode="mock")


# ---- AR follow-up, policy review, uploads -----------------------------------
def ar_json(a):
    return dict(id=a.id, job_id=a.job_id, encounter=a.encounter.external_id, patient=f"{a.encounter.patient.last_name}, {a.encounter.patient.first_name}", payer=a.payer, balance=a.balance_cents / 100, age_days=a.age_days, status=a.status, note=a.note)


@router.get("/ar")
def ar_list(q: str = "", status: str = "", page: int = Query(1, ge=1), size: int = Query(15, le=100), user: User = Depends(need("ar.view")), db: Session = Depends(get_db)):
    base = org_scope(db.query(ArFollowup), ArFollowup, user).filter(ArFollowup.archived_at.is_(None))
    if q:
        base = base.filter(or_(ArFollowup.job_id.ilike(f"%{q}%"), ArFollowup.payer.ilike(f"%{q}%")))
    if status:
        base = base.filter(ArFollowup.status == status)
    return page_of(base.order_by(ArFollowup.age_days.desc()), page, size, ar_json)


class ArIn(BaseModel):
    status: str
    note: Optional[str] = None


@router.post("/ar/{aid}")
def ar_update(aid: int, body: ArIn, request: Request, user: User = Depends(need("ar.manage")), db: Session = Depends(get_db)):
    a = org_scope(db.query(ArFollowup), ArFollowup, user).filter(ArFollowup.id == aid).first()
    if not a or body.status not in ("open", "in_progress", "appealed", "resolved"):
        raise HTTPException(404, "Follow-up not found.")
    a.status, a.note = body.status, body.note or a.note
    audit(db, request, user, "ar.updated", "ar", a.id, body.status)
    db.commit()
    return ar_json(a)


@router.get("/policies")
def policies(q: str = "", user: User = Depends(need("policy.view")), db: Session = Depends(get_db)):
    base = org_scope(db.query(PolicyReview), PolicyReview, user)
    if q:
        base = base.filter(or_(PolicyReview.payer.ilike(f"%{q}%"), PolicyReview.title.ilike(f"%{q}%"), PolicyReview.code_scope.ilike(f"%{q}%")))
    return [dict(id=p.id, payer=p.payer, title=p.title, code_scope=p.code_scope, summary=p.summary, status=p.status, effective_date=p.effective_date.isoformat() if p.effective_date else None) for p in base.order_by(PolicyReview.id.desc()).all()]


class PolicyStatus(BaseModel):
    status: str


@router.post("/policies/{pid}")
def policy_status(pid: int, body: PolicyStatus, request: Request, user: User = Depends(need("policy.manage")), db: Session = Depends(get_db)):
    p = org_scope(db.query(PolicyReview), PolicyReview, user).filter(PolicyReview.id == pid).first()
    if not p or body.status not in ("in_review", "applied", "dismissed"):
        raise HTTPException(404, "Policy not found.")
    p.status = body.status
    audit(db, request, user, "policy.updated", "policy", p.id, body.status)
    db.commit()
    return dict(ok=True)


def upload_json(u):
    return dict(id=u.id, category=u.category, filename=u.filename, size=u.size, content_type=u.content_type, user=u.user.full_name, at=u.created_at.isoformat())


@router.post("/uploads")
async def upload(request: Request, category: str = Form(...), files: List[UploadFile] = File(...), user: User = Depends(need("uploads.manage")), db: Session = Depends(get_db)):
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    out = []
    for f in files:
        ext = Path(f.filename or "").suffix.lower()
        if ext not in ALLOWED:
            raise HTTPException(422, f"{f.filename}: this file type is not allowed.")
        data = await f.read()
        if len(data) > MAX_UPLOAD:
            raise HTTPException(413, f"{f.filename}: files must be under 10 MB.")
        stored = secrets.token_hex(16) + ext
        (UPLOAD_DIR / stored).write_bytes(data)
        u = Upload(org_id=user.org_id, user_id=user.id, category=category[:40], filename=Path(f.filename).name[:200], stored_name=stored, content_type=f.content_type, size=len(data))
        db.add(u)
        out.append(u)
    db.flush()
    for u in out:
        audit(db, request, user, "uploads.created", "upload", u.id, u.category)
    db.commit()
    return [upload_json(u) for u in out]


@router.get("/uploads")
def uploads(category: str = "", user: User = Depends(need("uploads.view")), db: Session = Depends(get_db)):
    base = org_scope(db.query(Upload), Upload, user).filter(Upload.deleted_at.is_(None))
    if category:
        base = base.filter(Upload.category == category)
    return [upload_json(u) for u in base.order_by(Upload.id.desc()).all()]


@router.get("/uploads/{uid}/file")
def upload_file(uid: int, request: Request, user: User = Depends(need("uploads.view")), db: Session = Depends(get_db)):
    u = org_scope(db.query(Upload), Upload, user).filter(Upload.id == uid).first()
    if not u:
        raise HTTPException(404, "File not found.")
    audit(db, request, user, "phi.view_upload", "upload", uid)
    db.commit()
    inline = Path(u.filename).suffix.lower() in (".pdf", ".png", ".jpg", ".jpeg", ".txt")
    return FileResponse(UPLOAD_DIR / u.stored_name, filename=u.filename, media_type=u.content_type or "application/octet-stream",
                        content_disposition_type="inline" if inline else "attachment", headers={"X-Content-Type-Options": "nosniff"})


# ---- Reports ----------------------------------------------------------------
REPORTS = dict(daily="Daily coding", monthly="Monthly coding", productivity="Coder productivity", icd="ICD-10 distribution", cpt="CPT distribution",
               qa="QA findings", rejection="Rejection analysis", turnaround="Coding turnaround", ai="AI performance", audit="Audit")


def report_rows(db, user, kind):
    d = analytics_data(db, user)
    sub = [s for s in d["sessions"] if s.submitted_at]
    if kind in ("daily", "monthly"):
        fmt = "%Y-%m-%d" if kind == "daily" else "%Y-%m"
        c = Counter(s.submitted_at.strftime(fmt) for s in sub)
        return ["Period", "Submitted"], [[k, c[k]] for k in sorted(c, reverse=True)]
    if kind == "productivity":
        c = Counter(s.coder.full_name for s in sub)
        return ["Coder", "Submitted"], [list(x) for x in c.most_common()]
    if kind == "icd":
        return ["Code", "Count"], [list(x) for x in Counter(x.code for x in d["dx"]).most_common()]
    if kind == "cpt":
        return ["Code", "Count"], [list(x) for x in Counter(x.code for x in d["procs"] if x.code_system == "CPT").most_common()]
    if kind == "qa":
        return ["Reviewer", "Decision", "Reason", "Date"], [[r.reviewer.full_name, r.decision, r.reason or "", r.created_at.date().isoformat()] for r in d["reviews"]]
    if kind == "rejection":
        return ["Reason", "Count"], [list(x) for x in Counter(r.reason for r in d["reviews"] if r.decision == "rejected").most_common()]
    if kind == "turnaround":
        return ["Encounter", "Coder", "Hours"], [[s.encounter.external_id, s.coder.full_name, round((s.submitted_at - s.started_at).total_seconds() / 3600, 1)] for s in sub]
    if kind == "ai":
        c = defaultdict(Counter)
        for r in d["recs"]:
            c[r.code][r.status] += 1
        return ["Code", "Accepted", "Rejected", "Pending"], [[k, v["accepted"], v["rejected"], v["pending"]] for k, v in sorted(c.items())]
    if kind == "audit":
        if "audit.view" not in user.perms:
            raise HTTPException(403, "You do not have permission to do this.")
        rows = org_scope(db.query(CodingAuditLog), CodingAuditLog, user).order_by(CodingAuditLog.id.desc()).limit(1000).all()
        return ["When", "User", "Action", "Entity", "ID", "IP"], [[r.created_at.isoformat(timespec="seconds"), r.user.full_name if r.user else "", r.action, r.entity or "", r.entity_id or "", r.ip or ""] for r in rows]
    raise HTTPException(404, "Unknown report.")


@router.get("/reports")
def report_list(user: User = Depends(need("reports.view")), db: Session = Depends(get_db)):
    jobs = org_scope(db.query(ReportJob), ReportJob, user).order_by(ReportJob.id.desc()).limit(10).all()
    return dict(types=[dict(id=k, name=v) for k, v in REPORTS.items() if k != "audit" or "audit.view" in user.perms],
                recent=[dict(type=REPORTS[j.report_type], fmt=j.fmt, rows=j.row_count, user=j.user.full_name, at=j.created_at.isoformat()) for j in jobs])


@router.get("/reports/{kind}/preview")
def report_preview(kind: str, user: User = Depends(need("reports.view")), db: Session = Depends(get_db)):
    head, rows = report_rows(db, user, kind)
    return dict(columns=head, rows=rows[:100], total=len(rows))


@router.get("/reports/{kind}/export")
def report_export(kind: str, request: Request, fmt: str = "csv", user: User = Depends(need("reports.export")), db: Session = Depends(get_db)):
    if fmt not in ("csv", "pdf"):
        raise HTTPException(422, "Choose CSV or PDF.")
    head, rows = report_rows(db, user, kind)
    db.add(ReportJob(org_id=user.org_id, user_id=user.id, report_type=kind, fmt=fmt, row_count=len(rows)))
    audit(db, request, user, "reports.export", "report", kind, fmt)
    db.commit()
    name = f"zebl-{kind}-{date.today().isoformat()}.{fmt}"
    disp = {"Content-Disposition": f'attachment; filename="{name}"'}
    if fmt == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(head)
        w.writerows([[("'" + c if isinstance(c, str) and c[:1] in "=+-@" else c) for c in r] for r in rows])  # blocks spreadsheet formula injection
        return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers=disp)
    pdf = io.BytesIO()
    c = canvas.Canvas(pdf, pagesize=landscape(letter))
    W, H = landscape(letter)
    def header():
        c.setFont("Helvetica-Bold", 14); c.drawString(40, H - 44, f"ZEBL {REPORTS[kind]} report")
        c.setFont("Helvetica", 9); c.drawString(40, H - 60, f"{user.organization.name}, generated {date.today().isoformat()}, synthetic development data")
        c.setFont("Helvetica-Bold", 9)
        for i, h in enumerate(head):
            c.drawString(40 + i * (W - 80) / len(head), H - 84, h)
        c.setFont("Helvetica", 9)
    header()
    y = H - 102
    for r in rows:
        if y < 40:
            c.showPage(); header(); y = H - 102
        for i, v in enumerate(r):
            c.drawString(40 + i * (W - 80) / len(head), y, str(v)[:44])
        y -= 15
    c.save()
    pdf.seek(0)
    return StreamingResponse(pdf, media_type="application/pdf", headers=disp)


# ---- Users, roles, audit, settings ------------------------------------------
def user_json(u):
    return dict(id=u.id, email=u.email, full_name=u.full_name, org_id=u.org_id, organization=u.organization.name, roles=u.role_names, is_active=u.is_active, mfa_enabled=u.mfa_enabled, locked=bool(u.locked_until and u.locked_until > now()), last_login_at=u.last_login_at.isoformat() if u.last_login_at else None)


def user_mgmt(user=Depends(need("users.manage_org", "users.manage_all"))):
    return user


def target_user(db, actor, uid):
    u = org_scope(db.query(User), User, actor).filter(User.id == uid, User.deleted_at.is_(None)).first()
    if not u:
        raise HTTPException(404, "User not found.")
    return u


def check_role_grant(actor, names):
    if "Super Admin" in names and "users.manage_all" not in actor.perms:
        raise HTTPException(403, "Only a Super Admin can grant that role.")


@router.get("/users")
def users(q: str = "", page: int = Query(1, ge=1), size: int = Query(15, le=100), user: User = Depends(user_mgmt), db: Session = Depends(get_db)):
    base = org_scope(db.query(User), User, user).filter(User.deleted_at.is_(None))
    if q:
        base = base.filter(or_(User.full_name.ilike(f"%{q}%"), User.email.ilike(f"%{q}%")))
    return page_of(base.order_by(User.full_name), page, size, user_json)


class UserIn(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: str
    org_id: Optional[int] = None


@router.post("/users")
def create_user(body: UserIn, request: Request, actor: User = Depends(user_mgmt), db: Session = Depends(get_db)):
    strong(body.password)
    check_role_grant(actor, [body.role])
    if db.query(User).filter_by(email=body.email.lower()).first():
        raise HTTPException(409, "A user with this email already exists.")
    role = db.query(Role).filter_by(name=body.role).first()
    if not role:
        raise HTTPException(422, "Unknown role.")
    u = User(email=body.email.lower(), full_name=body.full_name, password_hash=hash_password(body.password), org_id=body.org_id if body.org_id and is_global(actor) else actor.org_id, roles=[role])
    db.add(u)
    db.flush()
    audit(db, request, actor, "users.created", "user", u.id, body.role)
    db.commit()
    return user_json(u)


class UserPatch(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    unlock: Optional[bool] = None


@router.patch("/users/{uid}")
def update_user(uid: int, body: UserPatch, request: Request, actor: User = Depends(user_mgmt), db: Session = Depends(get_db)):
    u = target_user(db, actor, uid)
    if "Super Admin" in u.role_names and "users.manage_all" not in actor.perms:
        raise HTTPException(403, "Only a Super Admin can change this account.")
    if body.full_name:
        u.full_name = body.full_name
    if body.role:
        check_role_grant(actor, [body.role])
        role = db.query(Role).filter_by(name=body.role).first()
        if not role:
            raise HTTPException(422, "Unknown role.")
        u.roles = [role]
    if body.is_active is not None:
        if u.id == actor.id:
            raise HTTPException(409, "You cannot deactivate your own account.")
        u.is_active = body.is_active
        if not body.is_active:
            db.query(UserSession).filter_by(user_id=u.id, revoked_at=None).update(dict(revoked_at=now()))
    if body.unlock:
        u.locked_until, u.failed_attempts = None, 0
    audit(db, request, actor, "users.updated", "user", u.id, body.model_dump_json(exclude_none=True))
    db.commit()
    return user_json(u)


@router.get("/users/{uid}/activity")
def user_activity(uid: int, actor: User = Depends(user_mgmt), db: Session = Depends(get_db)):
    u = target_user(db, actor, uid)
    rows = db.query(CodingAuditLog).filter_by(user_id=u.id).order_by(CodingAuditLog.id.desc()).limit(30).all()
    return [dict(action=r.action, entity=r.entity, entity_id=r.entity_id, ip=r.ip, at=r.created_at.isoformat()) for r in rows]


@router.get("/roles")
def roles(actor: User = Depends(need("users.manage_org", "users.manage_all", "roles.manage")), db: Session = Depends(get_db)):
    return dict(roles=[dict(name=r.name, description=r.description, permissions=sorted(p.code for p in r.permissions)) for r in db.query(Role).order_by(Role.id).all()],
                permissions=[dict(code=p.code, description=p.description) for p in db.query(Permission).order_by(Permission.code).all()])


class RolePermIn(BaseModel):
    permission: str
    enabled: bool


@router.post("/roles/{name}/permissions")
def set_role_perm(name: str, body: RolePermIn, request: Request, actor: User = Depends(need("roles.manage")), db: Session = Depends(get_db)):
    role, perm = db.query(Role).filter_by(name=name).first(), db.query(Permission).filter_by(code=body.permission).first()
    if not role or not perm:
        raise HTTPException(404, "Role or permission not found.")
    if name == "Super Admin":
        raise HTTPException(409, "Super Admin permissions are fixed.")
    if body.enabled and perm not in role.permissions:
        role.permissions.append(perm)
    if not body.enabled and perm in role.permissions:
        role.permissions.remove(perm)
    audit(db, request, actor, "roles.updated", "role", name, f"{body.permission}={body.enabled}")
    db.commit()
    return dict(ok=True)


@router.get("/organizations")
def organizations(user: User = Depends(need("org.manage_all")), db: Session = Depends(get_db)):
    return [dict(id=o.id, name=o.name) for o in db.query(Organization).all()]


@router.get("/audit")
def audit_log(q: str = "", page: int = Query(1, ge=1), size: int = Query(25, le=100), user: User = Depends(need("audit.view")), db: Session = Depends(get_db)):
    base = org_scope(db.query(CodingAuditLog), CodingAuditLog, user)
    if q:
        base = base.filter(CodingAuditLog.action.ilike(f"%{q}%"))
    return page_of(base.order_by(CodingAuditLog.id.desc()), page, size, lambda r: dict(id=r.id, action=r.action, entity=r.entity, entity_id=r.entity_id, detail=r.detail, ip=r.ip, user=r.user.full_name if r.user else "Unknown", at=r.created_at.isoformat()))


@router.get("/settings")
def settings(user: User = Depends(need("settings.view")), db: Session = Depends(get_db)):
    rows = db.query(SystemSetting).filter_by(org_id=user.org_id).order_by(SystemSetting.category, SystemSetting.key).all()
    models = db.query(AiModelRegistry).all()
    return dict(settings=[dict(key=r.key, value=r.value, category=r.category) for r in rows], models=[dict(id=m.id, name=m.name, version=m.version, role=m.role, mode=m.mode, is_active=m.is_active) for m in models], can_edit="settings.manage" in user.perms)


class SettingIn(BaseModel):
    key: str
    value: str


@router.put("/settings")
def put_setting(body: SettingIn, request: Request, user: User = Depends(need("settings.manage")), db: Session = Depends(get_db)):
    r = db.query(SystemSetting).filter_by(org_id=user.org_id, key=body.key).first()
    if not r:
        raise HTTPException(404, "Unknown setting.")
    r.value = body.value[:500]
    audit(db, request, user, "settings.updated", "setting", body.key, body.value[:80])
    db.commit()
    return dict(ok=True)


# ---- Assistant (mock). Reads only what encounter_scope allows. ---------------
class AskIn(BaseModel):
    message: str
    encounter_id: Optional[int] = None


@router.post("/assistant")
def assistant(body: AskIn, request: Request, user: User = Depends(need("assistant.use")), db: Session = Depends(get_db)):
    msg, sources = body.message.lower(), []
    e = get_encounter(db, user, body.encounter_id) if body.encounter_id else None
    context = e.external_id if e else None
    m = re.search(r"\b([A-TV-Z]\d{2}(?:\.\w{1,4})?|\d{5}|[A-V]\d{4})\b", body.message, re.I)
    row = None
    if m:
        for system in CATALOG:
            row = code_row(db, system, m.group(1).upper()) or row
    if e:
        audit(db, request, user, "phi.assistant_read", "encounter", e.id)
        db.commit()
    if row is not None:
        reply = f"{row.code}: {row.description}."
        sources.append("ZEBL demo code catalog")
    elif e and re.search(r"missing|gap|cdi|documentation", msg):
        gaps = engine.gaps(" ".join(d.text for d in e.live_documents))
        reply = " ".join(g["message"] for g in gaps) or "The rule checks found no documentation gaps in this encounter."
        sources += [d.title for d in e.live_documents]
    elif e and re.search(r"summar", msg):
        text = " ".join(d.text for d in e.live_documents)
        reply = " ".join(re.split(r"(?<=[.])\s+", text)[:3])
        sources += [d.title for d in e.live_documents]
    elif e and re.search(r"valid|error|warning", msg):
        s = session_for(db, e)
        rows = db.query(CodingValidation).filter_by(session_id=s.id).all() if s else []
        reply = " ".join(v.message for v in rows) or "No validation has been run on this encounter yet."
    elif re.search(r"workflow|how do i|submit", msg):
        reply = "Open an encounter, generate suggestions, accept or reject each one against the note, set the primary diagnosis, validate, then submit for QA. A coder must approve every code."
    else:
        reply = "I can explain a code, summarize this encounter, list documentation gaps, or explain validation results. Ask about one of those." if e else "Open an encounter for chart questions, or ask me about a code such as E11.65."
    return dict(reply=reply, sources=sources, context=context, mode="mock", model=MODEL)
