import os, tempfile

_tmp = tempfile.mkdtemp()
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ["ZEBL_UPLOAD_DIR"] = f"{_tmp}/up"

import pyotp, pytest
from fastapi.testclient import TestClient

from app.main import app
from app import seed
from app.models import Encounter, SessionLocal, User
from app.security import reset_rate_limits

H = {"X-ZEBL-CSRF": "1"}
creds = seed.run(count=60, seed=3)


def login(email):
    c = TestClient(app, headers=H)
    r = c.post("/api/auth/login", json={"email": email, "password": creds[email]})
    assert r.status_code == 200, r.text
    return c


@pytest.fixture(autouse=True)
def _limits():
    reset_rate_limits()


def uid(email):
    db = SessionLocal(); u = db.query(User).filter_by(email=email).first(); db.close(); return u.id


def enc_for(status, coder_email=None, org_slug_id=1, note_ok=True):
    db = SessionLocal()
    q = db.query(Encounter).filter_by(org_id=org_slug_id, coding_status=status)
    if coder_email:
        q = q.filter_by(assigned_coder_id=uid(coder_email))
    rows = [e for e in q.all() if not note_ok or "complexity" in e.documents[0].text]
    db.close()
    return rows[0]


def test_csrf_header_required():
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"email": "x", "password": "y"}).status_code == 403


def test_no_plaintext_password():
    db = SessionLocal(); u = db.query(User).first(); db.close()
    assert u.password_hash.startswith("$argon2")


def test_requires_login():
    assert TestClient(app).get("/api/encounters").status_code == 401


def test_bad_password_and_lockout():
    email = "biller@harborview.example"
    c = TestClient(app, headers=H)
    for _ in range(5):
        assert c.post("/api/auth/login", json={"email": email, "password": "wrong"}).status_code == 401
    r = c.post("/api/auth/login", json={"email": email, "password": creds[email]})
    assert r.status_code == 423
    db = SessionLocal(); u = db.query(User).filter_by(email=email).first(); u.locked_until = None; db.commit(); db.close()


def test_rate_limit():
    c = TestClient(app, headers=H)
    codes = [c.post("/api/auth/login", json={"email": "nobody@x.example", "password": "z"}).status_code for _ in range(21)]
    assert codes[-1] == 429


def test_mfa_flow():
    email = "biller@meridian.example"
    c = login(email)
    secret = c.post("/api/auth/mfa/setup").json()["secret"]
    assert c.post("/api/auth/mfa/enable", json={"code": pyotp.TOTP(secret).now()}).status_code == 200
    d = TestClient(app, headers=H)
    r = d.post("/api/auth/login", json={"email": email, "password": creds[email]})
    assert r.json()["mfa_required"] is True
    assert d.get("/api/auth/me").status_code == 401  # pending session has no access
    assert d.post("/api/auth/mfa", json={"code": "000000"}).status_code == 401
    assert d.post("/api/auth/mfa", json={"code": pyotp.TOTP(secret).now()}).status_code == 200
    assert d.get("/api/auth/me").status_code == 200
    db = SessionLocal(); u = db.query(User).filter_by(email=email).first(); u.mfa_enabled = False; db.commit(); db.close()


def test_tenant_isolation():
    a = login("manager@meridian.example")
    b_enc = enc_for("approved", org_slug_id=2, note_ok=False)
    assert a.get(f"/api/encounters/{b_enc.id}").status_code == 404
    assert a.get(f"/api/encounters/{b_enc.id}/workspace").status_code == 404
    assert a.post("/api/assistant", json={"message": "summarize", "encounter_id": b_enc.id}).status_code == 404
    assert all(i["external_id"] for i in a.get("/api/encounters?size=100").json()["items"])
    other = login("manager@harborview.example").get("/api/encounters?size=100").json()["items"]
    mine = a.get("/api/encounters?size=100").json()["items"]
    assert not {i["id"] for i in other} & {i["id"] for i in mine}


def test_coder_sees_only_assigned():
    c = login("coder1@meridian.example")
    me = uid("coder1@meridian.example")
    items = c.get("/api/encounters?size=100").json()["items"]
    assert items and all(i["coder_id"] == me for i in items)
    other = enc_for("in_progress", "coder2@meridian.example", note_ok=False)
    assert c.get(f"/api/encounters/{other.id}").status_code == 404


def test_biller_only_approved_and_cannot_code():
    c = login("biller@meridian.example")
    items = c.get("/api/encounters?size=100").json()["items"]
    assert items and all(i["coding_status"] == "approved" for i in items)
    assert c.post(f"/api/encounters/{items[0]['id']}/generate").status_code == 403
    assert c.get("/api/users").status_code == 403


def test_role_permissions():
    assert login("coder1@meridian.example").get("/api/audit").status_code == 403
    assert login("coder1@meridian.example").post("/api/encounters/assign", json={"encounter_ids": [1], "coder_id": 1}).status_code == 403
    assert login("auditor@meridian.example").get("/api/users").status_code == 403
    assert login("admin@meridian.example").get("/api/users").status_code == 200
    assert login("superadmin@zebl.example").get("/api/organizations").status_code == 200
    assert login("admin@meridian.example").get("/api/organizations").status_code == 403


def test_admin_cannot_grant_super_admin():
    a = login("admin@meridian.example")
    r = a.patch(f"/api/users/{uid('biller@meridian.example')}", json={"role": "Super Admin"})
    assert r.status_code == 403


def test_full_workflow_and_human_gate():
    email = "coder1@meridian.example"
    e = enc_for("assigned", email)
    c = login(email)
    w = c.post(f"/api/encounters/{e.id}/generate").json()
    assert w["session"]["model_version"] == "mock-rules-v0" and w["recommendations"]
    assert w["diagnoses"] == []  # AI output is never auto-selected
    assert c.post(f"/api/encounters/{e.id}/submit", json={"attested": False}).status_code == 422
    assert c.post(f"/api/encounters/{e.id}/submit", json={"attested": True}).status_code == 409  # no codes chosen
    for r in w["recommendations"]:
        w = c.post(f"/api/encounters/{e.id}/recommendations/{r['id']}", json={"action": "accept"}).json()
    assert all(rec["evidence"] for rec in w["recommendations"])
    w = c.post(f"/api/encounters/{e.id}/submit", json={"attested": True}).json()
    assert w["coding_status"] == "pending_qa"
    assert c.post(f"/api/encounters/{e.id}/generate").status_code == 403 or c.post(f"/api/encounters/{e.id}/validate").status_code in (404, 409)
    a = login("auditor@meridian.example")
    assert a.post(f"/api/qa/{e.id}/review", json={"decision": "rejected"}).status_code == 422
    r = a.post(f"/api/qa/{e.id}/review", json={"decision": "rejected", "reason": "Unsupported code"})
    assert r.json()["coding_status"] == "rejected"
    n = c.get("/api/notifications").json()["items"]
    assert any("returned" in x["title"] for x in n)
    assert c.post(f"/api/encounters/{e.id}/submit", json={"attested": True}).status_code == 200
    assert a.post(f"/api/qa/{e.id}/review", json={"decision": "approved"}).json()["coding_status"] == "approved"


def test_abstains_on_thin_note():
    from app.engine import engine
    recs, gaps, abstained = engine.generate([(1, "n", "Follow up visit.")], lambda s, c: c)
    assert abstained and not recs and gaps


def test_negation_not_coded():
    from app.engine import engine
    recs, _, _ = engine.generate([(1, "n", "Patient denies hypertension today. Long enough note for the abstain check to pass here.")], lambda s, c: c)
    assert "I10" not in [r["code"] for r in recs]


def test_reports_export():
    c = login("manager@meridian.example")
    r = c.get("/api/reports/icd/export?fmt=csv")
    assert r.status_code == 200 and r.text.startswith("Code,Count")
    p = c.get("/api/reports/daily/export?fmt=pdf")
    assert p.status_code == 200 and p.content[:4] == b"%PDF"
    assert c.get("/api/reports/audit/preview").status_code == 403


def test_upload_rules():
    c = login("coder1@meridian.example")
    assert c.post("/api/uploads", data={"category": "Charts"}, files={"files": ("x.exe", b"MZ")}).status_code == 422
    r = c.post("/api/uploads", data={"category": "Charts"}, files={"files": ("n.txt", b"synthetic")})
    assert r.status_code == 200
    fid = r.json()[0]["id"]
    assert c.get(f"/api/uploads/{fid}/file").content == b"synthetic"
    assert login("manager@harborview.example").get(f"/api/uploads/{fid}/file").status_code == 404


def test_phi_access_logged():
    m = login("manager@meridian.example")
    e = m.get("/api/encounters").json()["items"][0]
    m.get(f"/api/encounters/{e['id']}")
    logs = login("admin@meridian.example").get("/api/audit?q=phi.view_encounter").json()
    assert logs["total"] >= 1


def test_document_pdf_is_real_scoped_and_audited():
    c = login("coder1@meridian.example")
    e = enc_for("in_progress", "coder1@meridian.example", note_ok=False)
    w = c.get(f"/api/encounters/{e.id}/workspace").json()
    d = w["documents"][0]
    assert d["pages"] >= 1 and d["size"] > 0 and d["status"] == "extracted"
    r = c.get(f"/api/encounters/{e.id}/documents/{d['id']}/pdf")
    assert r.status_code == 200 and r.content.startswith(b"%PDF") and r.headers["cache-control"] == "no-store"
    assert login("manager@harborview.example").get(f"/api/encounters/{e.id}/documents/{d['id']}/pdf").status_code == 404
    assert c.get(f"/api/encounters/{e.id}/documents/999999/pdf").status_code == 404
    assert TestClient(app).get(f"/api/encounters/{e.id}/documents/{d['id']}/pdf").status_code == 401
    logs = login("admin@meridian.example").get("/api/audit?q=phi.view_document").json()
    assert logs["total"] >= 1


def test_agent_events_are_recorded_and_labelled():
    email = "coder2@meridian.example"
    e = enc_for("assigned", email)
    c = login(email)
    assert c.get(f"/api/encounters/{e.id}/agent-events").json()["events"] == []
    assert c.post(f"/api/encounters/{e.id}/generate").status_code == 200
    ev = c.get(f"/api/encounters/{e.id}/agent-events").json()
    assert {x["agent"] for x in ev["events"]} >= {"Document Ingestion Agent", "ICD-10-CM Coding Agent", "Coding Validation Agent"}
    assert all(x["source"] == "mock-engine" and x["duration_ms"] is not None for x in ev["events"])
    states = {a["name"]: a["state"] for a in ev["agents"]}
    assert states["OCR / PDF Extraction Agent"] == "not_connected" and states["ICD-10-CM Coding Agent"] == "mock"
    assert login("manager@harborview.example").get(f"/api/encounters/{e.id}/agent-events").status_code == 404


# ---- Encounter documents and the auditor role --------------------------------------------------
import io, zipfile
from reportlab.pdfgen import canvas as rl_canvas


def pdf_bytes(lines):
    b = io.BytesIO(); c = rl_canvas.Canvas(b); y = 800
    for ln in lines:
        c.drawString(60, y, ln); y -= 16
    c.showPage(); c.save()
    return b.getvalue()


def docx_bytes(paras):
    xml = "<w:document><w:body>" + "".join(f"<w:p><w:r><w:t>{p}</w:t></w:r></w:p>" for p in paras) + "</w:body></w:document>"
    b = io.BytesIO(); z = zipfile.ZipFile(b, "w"); z.writestr("word/document.xml", xml); z.close()
    return b.getvalue()


def put(c, eid, name, data, doc_type="progress"):
    return c.post(f"/api/encounters/{eid}/documents", files=[("files", (name, data))], data={"doc_type": doc_type})


def docs_of(c, eid):
    return c.get(f"/api/encounters/{eid}/documents").json()


NOTE = ["Patient seen for follow up. Essential hypertension, stable on current therapy.", "Moderate complexity medical decision making. EKG obtained and interpreted."]


def test_upload_pdf_txt_docx_are_read_and_audited():
    email = "coder1@meridian.example"
    e = enc_for("in_progress", email, note_ok=False)
    c = login(email)
    raw = pdf_bytes(NOTE)
    assert put(c, e.id, "cardiology-visit.pdf", raw).status_code == 200
    assert put(c, e.id, "plain.txt", b"Type 2 diabetes mellitus without complication. Low complexity visit.").status_code == 200
    assert put(c, e.id, "letter.docx", docx_bytes(["Obstructive sleep apnea, adherent to CPAP.", "Moderate complexity."])).status_code == 200
    d = {x["title"]: x for x in docs_of(c, e.id)}
    assert d["cardiology-visit"]["status"] == "extracted" and d["cardiology-visit"]["pages"] == 1 and "hypertension" in d["cardiology-visit"]["text"].lower()
    assert d["cardiology-visit"]["uploaded_by"] and d["cardiology-visit"]["method"] == "pdf-text"
    assert "diabetes" in d["plain"]["text"] and "sleep apnea" in d["letter"]["text"]
    r = c.get(f"/api/encounters/{e.id}/documents/{d['cardiology-visit']['id']}/pdf")
    assert r.status_code == 200 and r.content == raw  # an uploaded PDF is served as it was uploaded
    assert c.get(f"/api/encounters/{e.id}/documents/{d['plain']['id']}/pdf").content.startswith(b"%PDF")  # text files render to a PDF
    assert c.get(f"/api/encounters/{e.id}/documents/{d['cardiology-visit']['id']}/file?download=1").headers["content-disposition"].startswith("attachment")
    logs = login("admin@meridian.example").get("/api/audit?q=documents.uploaded").json()
    assert logs["total"] >= 3


def test_upload_refusals_and_permissions():
    email = "coder1@meridian.example"
    e = enc_for("in_progress", email, note_ok=False)
    c = login(email)
    assert put(c, e.id, "tool.exe", b"MZ....").status_code == 422
    assert put(c, e.id, "fake.pdf", b"just some text").status_code == 422  # contents do not match the extension
    assert put(c, e.id, "empty.txt", b"").status_code == 422
    assert c.post(f"/api/encounters/{e.id}/documents", files=[("files", ("a.txt", b"Some note text here.")), ("files", ("b.exe", b"MZ"))], data={"doc_type": "progress"}).status_code == 422
    before = len(docs_of(c, e.id))
    assert put(c, e.id, "bad-type.txt", b"Valid text.", doc_type="nonsense").status_code == 422
    assert len(docs_of(c, e.id)) == before  # a refused batch leaves nothing behind
    assert put(c, e.id, "dup.txt", b"Duplicate check text body.").status_code == 200
    assert put(c, e.id, "dup-again.txt", b"Duplicate check text body.").status_code == 409
    assert put(c, e.id, "toobig.txt", b"x" * (10 * 1024 * 1024 + 1)).status_code == 413
    for who in ("auditor@meridian.example", "biller@meridian.example", "manager@meridian.example"):
        assert put(login(who), e.id, "x.txt", b"Not allowed to upload.").status_code in (403, 404)
    assert put(login("admin@harborview.example"), e.id, "x.txt", b"Other organization.").status_code == 404
    assert put(TestClient(app, headers=H), e.id, "x.txt", b"No session.").status_code == 401


def test_image_needs_attention_and_corrupt_pdf_fails_with_retry():
    email = "coder1@meridian.example"
    e = enc_for("in_progress", email, note_ok=False)
    c = login(email)
    assert put(c, e.id, "scan.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 64).status_code == 200
    assert put(c, e.id, "broken.pdf", b"%PDF-1.4\nthis is not a real pdf").status_code == 200
    d = {x["title"]: x for x in docs_of(c, e.id)}
    assert d["scan"]["status"] == "needs_attention" and "OCR is not connected" in d["scan"]["status_detail"] and d["scan"]["viewer"] == "image"
    assert d["broken"]["status"] == "failed" and d["broken"]["status_detail"]
    failed = c.get("/api/documents?view=failed&size=100").json()
    assert {"scan", "broken"} <= {x["title"] for x in failed["items"]} and failed["counts"]["failed"] >= 2
    assert c.post(f"/api/documents/{d['broken']['id']}/reprocess").status_code == 200  # retry runs again, and fails again honestly
    assert {x["title"]: x for x in docs_of(c, e.id)}["broken"]["status"] == "failed"
    hist = c.get(f"/api/documents/{d['broken']['id']}/history").json()
    names = [x["event"] for x in hist["events"]]
    assert names.count("failed") == 2 and "reprocessed" in names
    assert login("biller@meridian.example").post(f"/api/documents/{d['broken']['id']}/reprocess").status_code in (403, 404)
    assert login("auditor@meridian.example").post(f"/api/documents/{d['broken']['id']}/reprocess").status_code in (403, 404)


def test_replace_creates_a_version_and_history():
    email = "coder1@meridian.example"
    e = enc_for("in_progress", email, note_ok=False)
    c = login(email)
    assert put(c, e.id, "labs.txt", b"Initial lab report, glucose elevated.").status_code == 200
    d = next(x for x in docs_of(c, e.id) if x["title"] == "labs")
    r = c.post(f"/api/documents/{d['id']}/replace", files={"file": ("labs-v2.txt", b"Corrected lab report, glucose normal today.")})
    assert r.status_code == 200 and next(x for x in r.json() if x["id"] == d["id"])["status"] in ("queued", "extracted")  # the reply is sent before reading finishes
    d2 = next(x for x in docs_of(c, e.id) if x["id"] == d["id"])
    assert d2["status"] == "extracted" and d2["version"] == 2 and d2["versions"] == 2 and "corrected" in d2["text"].lower() and d2["filename"] == "labs-v2.txt"
    h = c.get(f"/api/documents/{d['id']}/history").json()
    assert [v["version"] for v in h["versions"]] == [1, 2] and "replaced" in [x["event"] for x in h["events"]]
    assert c.post(f"/api/documents/{d['id']}/replace", files={"file": ("same.txt", b"Corrected lab report, glucose normal today.")}).status_code == 409
    assert login("auditor@meridian.example").post(f"/api/documents/{d['id']}/replace", files={"file": ("z.txt", b"Auditors cannot replace.")}).status_code in (403, 404)


def test_delete_rules_and_review():
    email = "coder1@meridian.example"
    e = enc_for("in_progress", email, note_ok=False)
    c = login(email)
    assert put(c, e.id, "to-remove.txt", b"A note that can be removed again.").status_code == 200
    d = next(x for x in docs_of(c, e.id) if x["title"] == "to-remove")
    assert c.delete(f"/api/documents/{d['id']}").status_code == 403  # coders cannot delete
    assert c.post(f"/api/documents/{d['id']}/reviewed").status_code == 200
    assert c.post(f"/api/documents/{d['id']}/reviewed").status_code == 409  # already reviewed
    a = login("admin@meridian.example")
    r = a.delete(f"/api/documents/{d['id']}")
    assert r.status_code == 200 and d["id"] not in [x["id"] for x in r.json()]
    assert c.get(f"/api/encounters/{e.id}/documents/{d['id']}/pdf").status_code == 404
    assert a.delete(f"/api/documents/{d['id']}").status_code == 404
    events = a.get("/api/documents-events?size=100").json()["items"]
    assert any(x["event"] == "deleted" and x["document_id"] == d["id"] for x in events)  # history keeps the record
    # a document that codes were suggested from cannot be deleted
    assert put(c, e.id, "supports-codes.txt", b"Essential hypertension, stable. Moderate complexity decision making. EKG obtained.").status_code == 200
    w = c.post(f"/api/encounters/{e.id}/generate").json()
    assert w["recommendations"]
    assert a.delete(f"/api/documents/{w['recommendations'][0]['document_id']}").status_code == 409


def test_generate_waits_for_documents_still_processing():
    email = "coder1@meridian.example"
    e = enc_for("in_progress", email, note_ok=False)
    db = SessionLocal()
    from app.models import ClinicalDocument
    d = db.query(ClinicalDocument).filter_by(encounter_id=e.id).first()
    d.status = "processing"; db.commit()
    c = login(email)
    r = c.post(f"/api/encounters/{e.id}/generate")
    assert r.status_code == 409 and "still being processed" in r.json()["detail"]
    d.status = "extracted"; db.commit(); db.close()
    assert c.post(f"/api/encounters/{e.id}/generate").status_code == 200


def test_documents_lists_respect_roles_and_scope():
    coder = login("coder1@meridian.example")
    mine = {i["id"] for i in coder.get("/api/encounters?size=100").json()["items"]}
    rows = coder.get("/api/documents?view=all&size=100").json()
    assert rows["items"] and {x["encounter_id"] for x in rows["items"]} <= mine
    assert set(rows["counts"]) == {"all", "queue", "extracted", "failed"}
    assert coder.get("/api/documents?view=bogus").status_code == 422
    assert login("biller@meridian.example").get("/api/documents").status_code == 403
    assert TestClient(app).get("/api/documents").status_code == 401
    other = {x["encounter_id"] for x in login("manager@harborview.example").get("/api/documents?size=100").json()["items"]}
    assert other and not other & {x["encounter_id"] for x in login("manager@meridian.example").get("/api/documents?size=100").json()["items"]}
    q = coder.get("/api/documents?view=queue").json()
    assert q["total"] == q["counts"]["queue"]


def test_auditor_is_read_only_but_can_review_evidence():
    a = login("auditor@meridian.example")
    items = a.get("/api/documents?size=100").json()["items"]
    qa_enc = {i["id"]: i["coding_status"] for i in a.get("/api/encounters?size=100").json()["items"]}
    assert items and {x["encounter_id"] for x in items} <= set(qa_enc)  # only encounters in QA, approved or returned
    assert set(qa_enc.values()) <= {"pending_qa", "approved", "rejected"}
    x = items[0]
    w = a.get(f"/api/encounters/{x['encounter_id']}/workspace").json()
    assert w["can_edit"] is False and w["documents"]
    assert a.get(f"/api/encounters/{x['encounter_id']}/documents/{x['id']}/pdf").status_code == 200
    assert a.get(f"/api/documents/{x['id']}/history").status_code == 200
    assert a.post(f"/api/encounters/{x['encounter_id']}/generate").status_code in (403, 404)
    assert a.delete(f"/api/documents/{x['id']}").status_code == 403
    assert put(a, x["encounter_id"], "no.txt", b"Auditors cannot upload.").status_code == 403
    assert a.get("/api/qa/queue?status=approved").status_code == 200
    hidden = enc_for("assigned", "coder1@meridian.example")  # still with the coder, so invisible to the auditor
    assert a.get(f"/api/encounters/{hidden.id}/workspace").status_code == 404


def test_permission_sync_is_idempotent_and_additive():
    from app.seed import ensure_permissions
    from app.models import Permission, Role
    db = SessionLocal()
    role = db.query(Role).filter_by(name="Coding Auditor").first()
    role.permissions = [p for p in role.permissions if p.code != "documents.view"]; db.commit()  # an admin removed it on purpose
    ensure_permissions(db); ensure_permissions(db)
    db.refresh(role)
    assert "documents.view" not in {p.code for p in role.permissions}  # not re-added behind the admin's back
    assert db.query(Permission).filter_by(code="documents.view").count() == 1
    role.permissions.append(db.query(Permission).filter_by(code="documents.view").first()); db.commit(); db.close()
