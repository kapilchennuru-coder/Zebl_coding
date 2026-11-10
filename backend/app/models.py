"""Relational schema. Coding decisions live in structured tables, never in JSON blobs."""
import os
from datetime import datetime, timezone

from sqlalchemy import (Boolean, Column, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text,
                        UniqueConstraint, create_engine)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./zebl_dev.db")
engine = create_engine(DATABASE_URL, pool_pre_ping=True,
                       connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
Base = declarative_base()


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def pk():
    return Column(Integer, primary_key=True)


def org_fk():
    return Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)


def created():
    return Column(DateTime, default=now, nullable=False)


class Organization(Base):
    __tablename__ = "organizations"
    id = pk(); name = Column(String(160), nullable=False); slug = Column(String(80), unique=True, nullable=False)
    is_active = Column(Boolean, default=True); created_at = created(); deleted_at = Column(DateTime)


class Role(Base):
    __tablename__ = "roles"
    id = pk(); name = Column(String(60), unique=True, nullable=False); description = Column(String(255))
    permissions = relationship("Permission", secondary="role_permissions", lazy="selectin")


class Permission(Base):
    __tablename__ = "permissions"
    id = pk(); code = Column(String(80), unique=True, nullable=False); description = Column(String(255))


class RolePermission(Base):
    __tablename__ = "role_permissions"
    role_id = Column(Integer, ForeignKey("roles.id"), primary_key=True)
    permission_id = Column(Integer, ForeignKey("permissions.id"), primary_key=True)


class UserRole(Base):
    __tablename__ = "user_roles"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    role_id = Column(Integer, ForeignKey("roles.id"), primary_key=True)


class User(Base):
    __tablename__ = "users"
    id = pk(); org_id = org_fk()
    email = Column(String(190), unique=True, nullable=False); full_name = Column(String(160), nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    failed_attempts = Column(Integer, default=0, nullable=False); locked_until = Column(DateTime)
    mfa_secret = Column(String(64)); mfa_enabled = Column(Boolean, default=False, nullable=False)
    last_login_at = Column(DateTime); created_at = created(); deleted_at = Column(DateTime)
    roles = relationship("Role", secondary="user_roles", lazy="selectin")
    organization = relationship("Organization", lazy="joined")

    @property
    def perms(self):
        return {p.code for r in self.roles for p in r.permissions}

    @property
    def role_names(self):
        return [r.name for r in self.roles]


class UserSession(Base):
    __tablename__ = "user_sessions"
    id = pk(); user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False)
    mfa_pending = Column(Boolean, default=False, nullable=False)
    created_at = created(); last_seen_at = Column(DateTime, default=now); expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime)
    user = relationship("User", lazy="joined")


class PasswordReset(Base):
    __tablename__ = "password_resets"
    id = pk(); user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token_hash = Column(String(64), unique=True, nullable=False); expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime)


class Patient(Base):
    __tablename__ = "patients"
    id = pk(); org_id = org_fk()
    mrn = Column(String(40), nullable=False); first_name = Column(String(80), nullable=False)
    last_name = Column(String(80), nullable=False, index=True); dob = Column(Date, nullable=False)
    gender = Column(String(20)); phone = Column(String(30)); email = Column(String(190))
    status = Column(String(20), default="active", nullable=False); created_at = created(); deleted_at = Column(DateTime)
    __table_args__ = (UniqueConstraint("org_id", "mrn"),)


class Provider(Base):
    __tablename__ = "providers"
    id = pk(); org_id = org_fk(); name = Column(String(160), nullable=False); npi = Column(String(10)); specialty = Column(String(80))


class Facility(Base):
    __tablename__ = "facilities"
    id = pk(); org_id = org_fk(); name = Column(String(160), nullable=False); kind = Column(String(60))


class WorkQueue(Base):
    __tablename__ = "work_queues"
    id = pk(); org_id = org_fk(); name = Column(String(120), nullable=False); sla_hours = Column(Integer, default=48)
    is_active = Column(Boolean, default=True)


class Encounter(Base):
    __tablename__ = "encounters"
    id = pk(); org_id = org_fk()
    external_id = Column(String(30), nullable=False); fin = Column(String(30))
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    provider_id = Column(Integer, ForeignKey("providers.id"), nullable=False)
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=False)
    queue_id = Column(Integer, ForeignKey("work_queues.id"))
    date_of_service = Column(Date, nullable=False, index=True); encounter_type = Column(String(40), nullable=False)
    doc_status = Column(String(30), default="complete", nullable=False)
    coding_status = Column(String(30), default="unassigned", nullable=False, index=True)
    qa_status = Column(String(30), default="not_started", nullable=False)
    assigned_coder_id = Column(Integer, ForeignKey("users.id"), index=True)
    assigned_auditor_id = Column(Integer, ForeignKey("users.id"))
    priority = Column(String(12), default="routine", nullable=False)
    due_at = Column(DateTime); completed_at = Column(DateTime); created_at = created(); archived_at = Column(DateTime)
    patient = relationship("Patient", lazy="joined"); provider = relationship("Provider", lazy="joined")
    facility = relationship("Facility", lazy="joined"); queue = relationship("WorkQueue", lazy="joined")
    coder = relationship("User", foreign_keys=[assigned_coder_id], lazy="joined")
    auditor = relationship("User", foreign_keys=[assigned_auditor_id], lazy="joined")
    documents = relationship("ClinicalDocument", lazy="selectin", back_populates="encounter")

    @property
    def live_documents(self):
        return [d for d in self.documents if d.deleted_at is None]
    __table_args__ = (UniqueConstraint("org_id", "external_id"), Index("ix_enc_org_status", "org_id", "coding_status"),)


class ClinicalDocument(Base):
    __tablename__ = "clinical_documents"
    id = pk(); org_id = org_fk(); encounter_id = Column(Integer, ForeignKey("encounters.id"), nullable=False, index=True)
    doc_type = Column(String(40), nullable=False); title = Column(String(160), nullable=False); created_at = created()
    status = Column(String(24), default="extracted", server_default="extracted", nullable=False)  # uploaded, queued, processing, extracted, reviewed, failed, needs_attention
    status_detail = Column(String(240)); source = Column(String(12), default="seed", server_default="seed", nullable=False)
    uploaded_by_id = Column(Integer, ForeignKey("users.id")); deleted_at = Column(DateTime)
    uploader = relationship("User", foreign_keys=[uploaded_by_id], lazy="joined")
    encounter = relationship("Encounter", back_populates="documents")
    versions = relationship("ClinicalDocumentVersion", lazy="selectin", order_by="ClinicalDocumentVersion.version")

    @property
    def text(self):
        return self.versions[-1].content if self.versions else ""


class ClinicalDocumentVersion(Base):
    __tablename__ = "clinical_document_versions"
    id = pk(); document_id = Column(Integer, ForeignKey("clinical_documents.id"), nullable=False, index=True)
    version = Column(Integer, default=1, nullable=False); content = Column(Text, nullable=False); created_at = created()
    filename = Column(String(200)); stored_name = Column(String(80)); content_type = Column(String(80)); size = Column(Integer)
    page_count = Column(Integer); extract_method = Column(String(30)); sha256 = Column(String(64))
    uploaded_by_id = Column(Integer, ForeignKey("users.id")); uploader = relationship("User", foreign_keys=[uploaded_by_id], lazy="joined")


class DocumentEvent(Base):
    """What happened to a document: upload, each processing step, replacement, review, deletion."""
    __tablename__ = "document_events"
    id = pk(); org_id = org_fk(); document_id = Column(Integer, ForeignKey("clinical_documents.id"), nullable=False, index=True)
    version = Column(Integer); event = Column(String(30), nullable=False); status = Column(String(24)); detail = Column(String(300))
    user_id = Column(Integer, ForeignKey("users.id")); created_at = created()
    user = relationship("User", lazy="joined")


class DiagnosisCode(Base):
    __tablename__ = "diagnosis_codes"
    id = pk(); code = Column(String(10), nullable=False, index=True); description = Column(String(255), nullable=False)
    chapter = Column(String(80)); billable = Column(Boolean, default=True, nullable=False)
    includes = Column(Text); excludes = Column(Text); code_first = Column(Text); use_additional = Column(Text)
    specificity_note = Column(String(255)); laterality = Column(String(20)); encounter_character = Column(String(20))
    code_set_version = Column(String(12), default="FY2027", nullable=False)
    __table_args__ = (UniqueConstraint("code", "code_set_version"),)


class ProcedureCode(Base):
    __tablename__ = "procedure_codes"
    id = pk(); code = Column(String(10), nullable=False, index=True); description = Column(String(255), nullable=False)
    category = Column(String(80)); section = Column(String(80)); instructions = Column(Text); suggested_modifiers = Column(String(60))
    max_units = Column(Integer, default=1); bundled_with = Column(String(120)); effective_date = Column(Date)
    licensed = Column(Boolean, default=False, nullable=False)


class HcpcsCode(Base):
    __tablename__ = "hcpcs_codes"
    id = pk(); code = Column(String(10), nullable=False, index=True); description = Column(String(255), nullable=False)
    kind = Column(String(40)); max_units = Column(Integer, default=1); effective_date = Column(Date); coverage_ref = Column(String(120))


class CodingSession(Base):
    __tablename__ = "coding_sessions"
    id = pk(); org_id = org_fk(); encounter_id = Column(Integer, ForeignKey("encounters.id"), nullable=False, index=True)
    coder_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(20), default="open", nullable=False)
    ai_status = Column(String(20), default="not_run", nullable=False)
    model_version = Column(String(60)); reference_version = Column(String(40))
    checklist = Column(Integer, default=0, nullable=False)
    started_at = created(); submitted_at = Column(DateTime)
    encounter = relationship("Encounter", lazy="joined"); coder = relationship("User", lazy="joined")


class CodingRecommendation(Base):
    __tablename__ = "coding_recommendations"
    id = pk(); session_id = Column(Integer, ForeignKey("coding_sessions.id"), nullable=False, index=True)
    code_system = Column(String(10), nullable=False); code = Column(String(10), nullable=False); description = Column(String(255))
    evidence = Column(Text); document_id = Column(Integer, ForeignKey("clinical_documents.id"))
    rationale = Column(Text); guideline = Column(String(160)); confidence = Column(Float)
    basis = Column(String(12), default="documented", nullable=False); status = Column(String(12), default="pending", nullable=False)
    model_version = Column(String(60)); created_at = created()


class SelectedDiagnosisCode(Base):
    __tablename__ = "selected_diagnosis_codes"
    id = pk(); session_id = Column(Integer, ForeignKey("coding_sessions.id"), nullable=False, index=True)
    code = Column(String(10), nullable=False); description = Column(String(255)); sequence = Column(Integer, default=1, nullable=False)
    source = Column(String(10), default="manual", nullable=False)
    recommendation_id = Column(Integer, ForeignKey("coding_recommendations.id"))
    __table_args__ = (UniqueConstraint("session_id", "code"),)


class SelectedProcedureCode(Base):
    __tablename__ = "selected_procedure_codes"
    id = pk(); session_id = Column(Integer, ForeignKey("coding_sessions.id"), nullable=False, index=True)
    code_system = Column(String(10), nullable=False); code = Column(String(10), nullable=False); description = Column(String(255))
    units = Column(Integer, default=1, nullable=False); source = Column(String(10), default="manual", nullable=False)
    recommendation_id = Column(Integer, ForeignKey("coding_recommendations.id"))
    modifiers = relationship("CodingModifier", lazy="selectin", cascade="all, delete-orphan")
    __table_args__ = (UniqueConstraint("session_id", "code"),)


class CodingModifier(Base):
    __tablename__ = "coding_modifiers"
    id = pk(); selected_procedure_id = Column(Integer, ForeignKey("selected_procedure_codes.id"), nullable=False, index=True)
    modifier = Column(String(4), nullable=False)


class CodingValidation(Base):
    __tablename__ = "coding_validations"
    id = pk(); session_id = Column(Integer, ForeignKey("coding_sessions.id"), nullable=False, index=True)
    severity = Column(String(10), nullable=False); rule = Column(String(60), nullable=False); message = Column(Text, nullable=False); created_at = created()


class CodingReview(Base):
    __tablename__ = "coding_reviews"
    id = pk(); session_id = Column(Integer, ForeignKey("coding_sessions.id"), nullable=False, index=True)
    reviewer_id = Column(Integer, ForeignKey("users.id"), nullable=False); decision = Column(String(12), nullable=False)
    reason = Column(String(80)); comment = Column(Text); created_at = created()
    reviewer = relationship("User", lazy="joined")
    codes = relationship("CodingReviewCode", lazy="selectin", cascade="all, delete-orphan")


class CodingReviewCode(Base):
    __tablename__ = "coding_review_codes"
    id = pk(); review_id = Column(Integer, ForeignKey("coding_reviews.id"), nullable=False, index=True)
    code_system = Column(String(10), nullable=False); code = Column(String(10), nullable=False)
    action = Column(String(10), nullable=False)  # added or removed


class CodingAuditLog(Base):
    __tablename__ = "coding_audit_logs"
    id = pk(); org_id = Column(Integer, ForeignKey("organizations.id"), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    action = Column(String(60), nullable=False, index=True); entity = Column(String(40)); entity_id = Column(String(40))
    detail = Column(Text); ip = Column(String(45)); created_at = created()
    user = relationship("User", lazy="joined")


class TaskAssignment(Base):
    __tablename__ = "task_assignments"
    id = pk(); org_id = org_fk(); encounter_id = Column(Integer, ForeignKey("encounters.id"))
    assignee_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    assigned_by_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String(200), nullable=False); kind = Column(String(30), default="coding"); status = Column(String(12), default="open", nullable=False)
    due_at = Column(DateTime); created_at = created(); closed_at = Column(DateTime)
    encounter = relationship("Encounter", lazy="joined")


class Notification(Base):
    __tablename__ = "notifications"
    id = pk(); org_id = org_fk(); user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    kind = Column(String(30), nullable=False); title = Column(String(200), nullable=False); link = Column(String(200))
    read_at = Column(DateTime); created_at = created()


class ReportJob(Base):
    __tablename__ = "report_jobs"
    id = pk(); org_id = org_fk(); user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    report_type = Column(String(40), nullable=False); fmt = Column(String(6), nullable=False); row_count = Column(Integer, default=0); created_at = created()
    user = relationship("User", lazy="joined")


class AiModelRegistry(Base):
    __tablename__ = "ai_model_registry"
    id = pk(); name = Column(String(80), nullable=False); version = Column(String(40), nullable=False); role = Column(String(60))
    mode = Column(String(12), default="mock", nullable=False); is_active = Column(Boolean, default=False); created_at = created()


class ModelEvaluationRun(Base):
    __tablename__ = "model_evaluation_runs"
    id = pk(); model_id = Column(Integer, ForeignKey("ai_model_registry.id"), nullable=False)
    dataset = Column(String(120)); precision = Column(Float); recall = Column(Float); created_at = created()


class SystemSetting(Base):
    __tablename__ = "system_settings"
    id = pk(); org_id = Column(Integer, ForeignKey("organizations.id"), index=True)
    key = Column(String(80), nullable=False); value = Column(String(500)); category = Column(String(40), nullable=False)
    __table_args__ = (UniqueConstraint("org_id", "key"),)


class ArFollowup(Base):
    __tablename__ = "ar_followups"
    id = pk(); org_id = org_fk(); job_id = Column(String(30), nullable=False)
    encounter_id = Column(Integer, ForeignKey("encounters.id"), nullable=False); payer = Column(String(120), nullable=False)
    balance_cents = Column(Integer, nullable=False); age_days = Column(Integer, nullable=False)
    status = Column(String(20), default="open", nullable=False); note = Column(Text); archived_at = Column(DateTime); created_at = created()
    encounter = relationship("Encounter", lazy="joined")


class PolicyReview(Base):
    __tablename__ = "policy_reviews"
    id = pk(); org_id = org_fk(); payer = Column(String(120), nullable=False); title = Column(String(200), nullable=False)
    code_scope = Column(String(120)); summary = Column(Text); status = Column(String(20), default="in_review", nullable=False)
    effective_date = Column(Date); created_at = created()


class Upload(Base):
    __tablename__ = "uploads"
    id = pk(); org_id = org_fk(); user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    category = Column(String(40), nullable=False); filename = Column(String(200), nullable=False)
    stored_name = Column(String(80), nullable=False); content_type = Column(String(80)); size = Column(Integer, nullable=False)
    created_at = created(); deleted_at = Column(DateTime)
    user = relationship("User", lazy="joined")


class AgentEvent(Base):
    """One step an agent actually ran. source says what produced it: "mock-engine" today, a real service later."""
    __tablename__ = "agent_events"
    id = pk(); org_id = org_fk(); encounter_id = Column(Integer, ForeignKey("encounters.id"), nullable=False, index=True)
    session_id = Column(Integer, ForeignKey("coding_sessions.id")); run_id = Column(String(24), nullable=False, index=True)
    seq = Column(Integer, nullable=False); agent = Column(String(60), nullable=False); task = Column(String(240), nullable=False)
    status = Column(String(24), nullable=False)  # completed, warning, failed, requires_review
    started_at = Column(DateTime, nullable=False); completed_at = Column(DateTime)
    result = Column(String(500)); error = Column(String(500)); source = Column(String(20), default="mock-engine", nullable=False)


def ensure_schema():
    """Adds columns that newer code expects to tables made by an older run. There is no Alembic yet (see README)."""
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            have = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name not in have:
                    ddl = f"ALTER TABLE {table.name} ADD COLUMN {col.name} {col.type.compile(engine.dialect)}"
                    if col.server_default is not None:
                        ddl += f" DEFAULT '{col.server_default.arg}'"
                    conn.execute(text(ddl))
