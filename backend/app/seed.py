"""Synthetic development data only. Run: python -m app.seed

Passwords are random per run and written to .dev-credentials.txt (git ignored). Refuses to run in production.
"""
import os
import random
import secrets
import sys
from datetime import date, timedelta

from .engine import MODEL, REFERENCE, engine as ai
from .models import *  # noqa: F403
from .models import Base, SessionLocal, engine, now
from .security import hash_password

P = {
    "dashboard.view": "See the overview dashboard", "patients.view": "View patients", "patients.contact": "View patient contact details",
    "encounters.view": "View encounters", "encounters.view_all": "See every encounter in the organization", "encounters.view_assigned": "See assigned encounters only",
    "encounters.view_qa": "See encounters in QA", "encounters.view_billing": "See approved encounters only", "cases.assign": "Assign and manage cases",
    "queues.view": "View work queues", "codes.view": "Use code catalogs", "coding.perform": "Code encounters", "ai.generate": "Generate AI suggestions",
    "qa.review": "Review and approve coding", "analytics.view": "View analytics", "reports.view": "View reports", "reports.export": "Export reports",
    "audit.view": "View audit logs", "users.manage_org": "Manage organization users", "users.manage_all": "Manage all users", "roles.manage": "Edit role permissions",
    "org.manage_all": "Access every organization", "settings.view": "View settings", "settings.manage": "Change settings", "assistant.use": "Use the assistant",
    "casecraft.use": "Create cases from a chart", "ar.view": "View AR follow-up", "ar.manage": "Work AR follow-up", "policy.view": "View policy reviews", "policy.manage": "Manage policy reviews",
    "uploads.view": "View uploads", "uploads.manage": "Upload documents",
    "documents.view": "See the Documents section", "documents.delete": "Delete encounter documents", "documents.reprocess": "Retry document processing",
}
NEW_PERMS = {"documents.view", "documents.delete", "documents.reprocess"}
BASE = {"dashboard.view", "encounters.view", "codes.view", "assistant.use"}
ROLES = {
    "Super Admin": ("Full access across organizations", set(P)),
    "Administrator": ("Runs one organization", BASE | {"patients.view", "patients.contact", "encounters.view_all", "cases.assign", "queues.view", "analytics.view", "reports.view", "reports.export", "audit.view", "users.manage_org", "settings.view", "settings.manage", "ar.view", "policy.view", "policy.manage", "uploads.view", "uploads.manage", "casecraft.use", "documents.view", "documents.delete", "documents.reprocess"}),
    "Coding Manager": ("Assigns, reviews and monitors coding", BASE | {"patients.view", "encounters.view_all", "cases.assign", "queues.view", "qa.review", "analytics.view", "reports.view", "reports.export", "policy.view", "uploads.view", "casecraft.use", "documents.view", "documents.reprocess"}),
    "Medical Coder": ("Codes assigned encounters", BASE | {"patients.view", "encounters.view_assigned", "queues.view", "coding.perform", "ai.generate", "casecraft.use", "uploads.view", "uploads.manage", "policy.view", "documents.view", "documents.reprocess"}),
    "Coding Auditor": ("Reviews completed coding", BASE | {"patients.view", "encounters.view_qa", "qa.review", "reports.view", "reports.export", "analytics.view", "policy.view", "documents.view"}),
    "Biller": ("Works approved encounters", BASE | {"encounters.view_billing", "ar.view", "ar.manage", "reports.view", "policy.view", "uploads.view"}),
}
ICD = [("E11.65", "Type 2 diabetes mellitus with hyperglycemia", "Endocrine", True), ("E11.9", "Type 2 diabetes mellitus without complications", "Endocrine", True), ("E11", "Type 2 diabetes mellitus (category)", "Endocrine", False),
       ("E78.5", "Hyperlipidemia, unspecified", "Endocrine", True), ("I10", "Essential (primary) hypertension", "Circulatory", True), ("J44.1", "Chronic obstructive pulmonary disease with (acute) exacerbation", "Respiratory", True),
       ("J44.9", "Chronic obstructive pulmonary disease, unspecified", "Respiratory", True), ("N18.30", "Chronic kidney disease, stage 3 unspecified", "Genitourinary", True), ("F33.1", "Major depressive disorder, recurrent, moderate", "Mental", True),
       ("M17.0", "Bilateral primary osteoarthritis of knee", "Musculoskeletal", True), ("M17.11", "Unilateral primary osteoarthritis, right knee", "Musculoskeletal", True), ("M17.12", "Unilateral primary osteoarthritis, left knee", "Musculoskeletal", True),
       ("M54.50", "Low back pain, unspecified", "Musculoskeletal", True), ("G47.33", "Obstructive sleep apnea (adult) (pediatric)", "Nervous", True), ("Z79.4", "Long term (current) use of insulin", "Status", True), ("Z68.35", "Body mass index [BMI] 35.0-35.9, adult", "Status", True)]
NOTES_IDX = {"E11.65": dict(use_additional="Use additional code to identify control using insulin (Z79.4)", excludes="Excludes1: type 1 diabetes mellitus (E10.-)", specificity_note="Requires documented link to hyperglycemia"),
             "J44.1": dict(includes="Decompensated COPD", code_first=None, use_additional="Use additional code for tobacco use"), "M17.11": dict(laterality="right"), "M17.12": dict(laterality="left"), "M17.0": dict(laterality="bilateral")}
# Own-words descriptions. Official CPT text requires an AMA license, so licensed stays False.
CPT = [("99213", "Established patient office visit, low complexity", "E/M", "Office", 1, None, "25"), ("99214", "Established patient office visit, moderate complexity", "E/M", "Office", 1, None, "25"),
       ("20610", "Large joint injection or aspiration", "Surgery", "Musculoskeletal", 2, "99213X", "RT,LT,50"), ("93000", "Electrocardiogram with interpretation", "Medicine", "Cardiovascular", 1, None, None), ("71046", "Chest x-ray, two views", "Radiology", "Diagnostic", 1, None, None), ("36415", "Routine venipuncture", "Surgery", "Vascular", 2, None, None)]
HCPCS = [("J3301", "Injection, triamcinolone acetonide, per 10 mg", "Drug", 8), ("A4253", "Blood glucose test strips, per 50", "Supply", 3), ("E0601", "Continuous positive airway pressure device", "Equipment", 1), ("G0439", "Annual wellness visit, subsequent", "Service", 1), ("J1100", "Injection, dexamethasone sodium phosphate, 1 mg", "Drug", 20)]
NOTES = [
    "Type 2 diabetes with hyperglycemia, A1c 9.2% today. Continue basal insulin. Essential hypertension is controlled. Moderate complexity decision making.",
    "COPD with acute exacerbation, increased cough and wheeze. Chest x-ray reviewed. Hyperlipidemia on statin. Moderate complexity decision making.",
    "Primary osteoarthritis of the right knee with worsening pain. Intra-articular injection performed with triamcinolone 40 mg. Low complexity decision making.",
    "Obstructive sleep apnea, adherent to CPAP. Hypertension stable. EKG obtained and interpreted. Low complexity decision making.",
    "Type 2 diabetes without complication, using test strips daily. Ckd stage 3 monitored. Hyperlipidemia stable. Moderate complexity decision making.",
    "Major depressive disorder, recurrent, moderate. Low back pain managed conservatively. Denies suicidal ideation. Moderate complexity decision making.",
    "Patient with diabetes presents for follow up. Knee pain persists. Heart failure noted in history.",
    "Follow up visit.",
]
FIRST = "Avery Blake Casey Dana Elliot Finley Gray Harper Indigo Jordan Kendall Logan Morgan Noel Oakley Parker Quinn Riley Sawyer Taylor".split()
LAST = "Ashdown Brightwell Calloway Dunmore Eastlake Fenwick Galloway Hartwell Ironwood Jessup Kingsley Lockhart Merriweather Northcott Oakhurst Pemberton Quimby Rutledge Stanhope Thorne".split()
PWD = {}


def mk_user(db, org, name, email, role):
    pw = secrets.token_urlsafe(14) + "aA1"
    PWD[email] = pw
    u = User(org_id=org.id, full_name=name, email=email, password_hash=hash_password(pw), roles=[role])
    db.add(u); db.flush()
    return u


def org_data(db, slug, name, roles, count, rnd):
    org = Organization(name=name, slug=slug); db.add(org); db.flush()
    d = f"{slug}.example"
    admin = mk_user(db, org, f"{name} Admin", f"admin@{d}", roles["Administrator"])
    mgr = mk_user(db, org, "Rowan Hale", f"manager@{d}", roles["Coding Manager"])
    coders = [mk_user(db, org, n, f"coder{i}@{d}", roles["Medical Coder"]) for i, n in enumerate(["Sage Whitlock", "Emery Vance", "Reese Holloway"], 1)]
    auditor = mk_user(db, org, "Marlowe Finch", f"auditor@{d}", roles["Coding Auditor"])
    mk_user(db, org, "Tatum Reyes", f"biller@{d}", roles["Biller"])
    provs = [Provider(org_id=org.id, name=n, npi=str(1000000000 + rnd.randrange(8999999)), specialty=s) for n, s in [("Dr. Lane Corwin", "Internal Medicine"), ("Dr. Shiloh Aldous", "Orthopedics"), ("Dr. Remy Tolland", "Pulmonology")]]
    facs = [Facility(org_id=org.id, name=f"{name} {k}", kind=k) for k in ("Main Clinic", "Hospital")]
    queues = [WorkQueue(org_id=org.id, name=n, sla_hours=h) for n, h in [("Outpatient", 48), ("Inpatient", 72), ("Priority", 24)]]
    db.add_all(provs + facs + queues); db.flush()
    pts = []
    for i in range(count // 3):
        p = Patient(org_id=org.id, mrn=f"{slug[:2].upper()}{100000 + i}", first_name=rnd.choice(FIRST), last_name=rnd.choice(LAST), dob=date(1940, 1, 1) + timedelta(days=rnd.randrange(22000)), gender=rnd.choice(["Female", "Male", "Nonbinary"]), phone=f"555-01{rnd.randrange(10, 99)}", email=f"patient{i}@{d}")
        pts.append(p)
    db.add_all(pts); db.flush()
    lookup = lambda sys, c: {x[0]: x[1] for x in ICD}.get(c) or {x[0]: x[1] for x in CPT}.get(c) or {x[0]: x[1] for x in HCPCS}.get(c) or c
    states = ["unassigned"] * 3 + ["assigned"] * 3 + ["in_progress"] * 2 + ["pending_qa"] * 3 + ["approved"] * 6 + ["rejected", "escalated", "on_hold"]
    for i in range(count):
        st = rnd.choice(states); note = rnd.choice(NOTES[:6]) if st in ("pending_qa", "approved", "rejected") else rnd.choice(NOTES)
        dos = date.today() - timedelta(days=rnd.randrange(0, 45)); coder = None if st == "unassigned" else rnd.choice(coders)
        e = Encounter(org_id=org.id, external_id=f"ENC-{20000 + i}", fin=f"F{500000 + i}", patient_id=rnd.choice(pts).id, provider_id=rnd.choice(provs).id, facility_id=rnd.choice(facs).id, queue_id=rnd.choice(queues).id, date_of_service=dos,
                      encounter_type=rnd.choice(["Office visit", "Inpatient", "Telehealth"]), coding_status=st, qa_status={"pending_qa": "pending", "approved": "approved", "rejected": "rejected"}.get(st, "not_started"), assigned_coder_id=coder.id if coder else None, priority=rnd.choice(["routine", "routine", "high", "urgent"]), due_at=now() + timedelta(hours=rnd.randrange(-24, 96)), doc_status="incomplete" if note == NOTES[-1] else "complete")
        db.add(e); db.flush()
        doc = ClinicalDocument(org_id=org.id, encounter_id=e.id, doc_type="progress", title="Progress note"); db.add(doc); db.flush()
        db.add(ClinicalDocumentVersion(document_id=doc.id, content=note))
        if coder and st in ("assigned", "in_progress", "rejected"):
            db.add(TaskAssignment(org_id=org.id, encounter_id=e.id, assignee_id=coder.id, assigned_by_id=mgr.id, title=f"Code encounter {e.external_id}", due_at=e.due_at))
            db.add(Notification(org_id=org.id, user_id=coder.id, kind="assignment", title=f"{e.external_id} was assigned to you", link=f"/workspace/{e.id}"))
        if st in ("pending_qa", "approved", "rejected"):
            start = now() - timedelta(days=rnd.randrange(0, 21), hours=rnd.randrange(2, 30))
            s = CodingSession(org_id=org.id, encounter_id=e.id, coder_id=coder.id, status={"pending_qa": "submitted", "approved": "approved", "rejected": "open"}[st], ai_status="complete", model_version=MODEL, reference_version=REFERENCE, started_at=start, submitted_at=start + timedelta(hours=rnd.randrange(1, 40)))
            db.add(s); db.flush()
            recs, _, _ = ai.generate([(doc.id, doc.title, note)], lookup)
            seq = 0
            for r in recs:
                ok = rnd.random() > .15
                rr = CodingRecommendation(session_id=s.id, model_version=MODEL, status="accepted" if ok else "rejected", **r); db.add(rr); db.flush()
                if ok and r["code_system"] == "ICD10":
                    seq += 1; db.add(SelectedDiagnosisCode(session_id=s.id, code=r["code"], description=r["description"], sequence=seq, source="ai", recommendation_id=rr.id))
                elif ok:
                    db.add(SelectedProcedureCode(session_id=s.id, code_system=r["code_system"], code=r["code"], description=r["description"], source="ai", recommendation_id=rr.id))
            if st != "pending_qa":
                db.add(CodingReview(session_id=s.id, reviewer_id=auditor.id, decision="approved" if st == "approved" else "rejected", reason=None if st == "approved" else rnd.choice(["Unsupported code", "Wrong sequencing", "Missing modifier"]), comment="Synthetic review"))
        if st == "approved" and rnd.random() < .5:
            db.add(ArFollowup(org_id=org.id, job_id=f"AR-{7000 + i}", encounter_id=e.id, payer=rnd.choice(["Northgate Health Plan", "Summit Mutual", "Federal Program A"]), balance_cents=rnd.randrange(4000, 180000), age_days=rnd.randrange(5, 120), status=rnd.choice(["open", "in_progress", "appealed"])))
    db.add_all([PolicyReview(org_id=org.id, payer="Northgate Health Plan", title="Joint injection frequency limits", code_scope="20610", summary="Synthetic summary. Limits repeat injections on the same joint within 90 days.", effective_date=date(2026, 10, 1)),
                PolicyReview(org_id=org.id, payer="Summit Mutual", title="CPAP supply replacement schedule", code_scope="E0601", summary="Synthetic summary. Requires adherence documentation for continued coverage.", effective_date=date(2026, 7, 1), status="applied")])
    for k, v, c in [("sla_warning_hours", "8", "Workflow"), ("require_mfa", "false", "Security"), ("idle_timeout_minutes", "30", "Security"), ("audit_retention_years", "6", "Audit"), ("rag_top_k", "5", "RAG"), ("code_set_version", "FY2027", "References"), ("ehr_integration", "Not connected", "Integrations")]:
        db.add(SystemSetting(org_id=org.id, key=k, value=v, category=c))
    return org


def run(count=90, seed=11):
    Base.metadata.drop_all(engine); Base.metadata.create_all(engine)
    db = SessionLocal(); rnd = random.Random(seed); PWD.clear()
    perms = {c: Permission(code=c, description=d) for c, d in P.items()}; db.add_all(perms.values())
    roles = {n: Role(name=n, description=d, permissions=[perms[c] for c in ps]) for n, (d, ps) in ROLES.items()}; db.add_all(roles.values()); db.flush()
    for x in ICD:
        db.add(DiagnosisCode(code=x[0], description=x[1], chapter=x[2], billable=x[3], **NOTES_IDX.get(x[0], {})))
    for x in CPT:
        db.add(ProcedureCode(code=x[0], description=x[1], category=x[2], section=x[3], max_units=x[4], bundled_with=x[5], suggested_modifiers=x[6], effective_date=date(2026, 1, 1)))
    for x in HCPCS:
        db.add(HcpcsCode(code=x[0], description=x[1], kind=x[2], max_units=x[3], effective_date=date(2026, 1, 1)))
    a = org_data(db, "meridian", "Meridian Physicians", roles, count, rnd)
    org_data(db, "harborview", "Harborview Medical", roles, count // 2, rnd)
    mk_user(db, a, "Platform Owner", "superadmin@zebl.example", roles["Super Admin"])
    db.add(AiModelRegistry(name=MODEL, version="0", role="All coding agents (rule mock)", mode="mock", is_active=True))
    for n, r in [("BioMistral", "Clinical extraction"), ("Qwen coding model", "ICD-10-CM, CPT, HCPCS")]:
        db.add(AiModelRegistry(name=n, version="not deployed", role=r, mode="planned"))
    db.commit(); db.close()
    return dict(PWD)


if __name__ == "__main__":
    if os.getenv("ZEBL_ENV", "development") != "development":
        sys.exit("Seeding is only allowed in development.")
    creds = run()
    with open(".dev-credentials.txt", "w", encoding="utf8") as f:
        f.write("Synthetic development accounts. Regenerated on every seed.\n")
        f.writelines(f"{k}\t{v}\n" for k, v in creds.items())
    print(f"Seeded {len(creds)} synthetic users. Passwords are in backend/.dev-credentials.txt")


def ensure_permissions(db):
    """Adds permissions introduced after a database was seeded. A permission is attached to roles only when it is first
    created, so a later change an administrator makes to a role is never undone."""
    have = {p.code: p for p in db.query(Permission).all()}
    fresh = set()
    for code in NEW_PERMS:
        if code not in have:
            have[code] = Permission(code=code, description=P[code])
            db.add(have[code])
            fresh.add(code)
    db.flush()
    for name, (_, perms) in ROLES.items():
        role = db.query(Role).filter_by(name=name).first()
        for code in (fresh & perms) if role else ():
            if have[code] not in role.permissions:
                role.permissions.append(have[code])
    db.commit()
