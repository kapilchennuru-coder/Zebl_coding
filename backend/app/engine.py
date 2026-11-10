"""AI integration boundary, currently a MOCK.

MockCodingEngine is a keyword rule set, not a trained model. It exists so the workflow can run end to end.
A real backend must implement generate() and return the same shape, then be registered in ai_model_registry.
"""
import re

MODEL = "mock-rules-v0"
REFERENCE = "FY2027-demo"
G_DM = "ICD-10-CM Guidelines I.C.4.a"
G_OUT = "ICD-10-CM Guidelines IV"
G_EM = "AMA E/M guidelines, medical decision making"

# pattern, system, code, guideline, confidence, basis
RULES = [
    (r"type 2 diabetes[^.]*hyperglycemia", "ICD10", "E11.65", G_DM, .93, "documented"),
    (r"type 2 diabetes[^.]*without complication", "ICD10", "E11.9", G_DM, .9, "documented"),
    (r"(basal|long.?term|daily) insulin", "ICD10", "Z79.4", "ICD-10-CM Guidelines I.C.4.a.3", .88, "documented"),
    (r"essential hypertension|\bhypertension\b", "ICD10", "I10", "ICD-10-CM Guidelines I.C.9.a", .9, "documented"),
    (r"copd[^.]*exacerbation", "ICD10", "J44.1", "ICD-10-CM Guidelines I.C.10", .91, "documented"),
    (r"stage 3 chronic kidney disease|ckd stage 3\b", "ICD10", "N18.30", "ICD-10-CM Guidelines I.C.14", .82, "documented"),
    (r"hyperlipidemia", "ICD10", "E78.5", G_OUT, .85, "documented"),
    (r"major depressive disorder[^.]*recurrent[^.]*moderate", "ICD10", "F33.1", G_OUT, .84, "documented"),
    (r"primary osteoarthritis[^.]*right knee", "ICD10", "M17.11", G_OUT, .9, "documented"),
    (r"primary osteoarthritis[^.]*left knee", "ICD10", "M17.12", G_OUT, .9, "documented"),
    (r"low back pain", "ICD10", "M54.50", G_OUT, .8, "documented"),
    (r"obstructive sleep apnea", "ICD10", "G47.33", G_OUT, .89, "documented"),
    (r"bmi (3[5-9]|40)", "ICD10", "Z68.35", "ICD-10-CM Guidelines I.B.14", .55, "inferred"),
    (r"moderate complexity", "CPT", "99214", G_EM, .78, "documented"),
    (r"low complexity", "CPT", "99213", G_EM, .76, "documented"),
    (r"joint injection|intra-articular injection", "CPT", "20610", "NCCI policy manual, chapter 4", .87, "documented"),
    (r"\bekg\b|electrocardiogram", "CPT", "93000", "NCCI policy manual, chapter 11", .85, "documented"),
    (r"chest x-ray", "CPT", "71046", "CPT radiology guidelines", .74, "documented"),
    (r"triamcinolone", "HCPCS", "J3301", "HCPCS Level II, drugs administered", .83, "documented"),
    (r"test strips", "HCPCS", "A4253", "HCPCS Level II, DMEPOS", .8, "documented"),
    (r"cpap", "HCPCS", "E0601", "HCPCS Level II, DME", .79, "documented"),
]
NEGATION = re.compile(r"\b(denies|no evidence of|negative for|rule out|ruled out)\b[^.]{0,40}$", re.I)


def sentence_at(text, start, end):
    a = max(text.rfind(".", 0, start), text.rfind("\n", 0, start)) + 1
    b = text.find(".", end)
    return text[a: (b + 1 if b > -1 else len(text))].strip()


class MockCodingEngine:
    name = MODEL
    reference = REFERENCE

    def generate(self, documents, lookup):
        """documents: [(id, title, text)]. lookup(system, code) returns a description. Returns recs, gaps, abstained."""
        joined = " ".join(t for _, _, t in documents)
        if len(joined.strip()) < 40:
            return [], [{"severity": "error", "rule": "insufficient_documentation",
                         "message": "The documentation is too short to support a code. No suggestions were made."}], True
        recs, seen = [], set()
        for pattern, system, code, guideline, conf, basis in RULES:
            for doc_id, title, text in documents:
                m = re.search(pattern, text, re.I)
                if not m or code in seen or NEGATION.search(text[max(0, m.start() - 60):m.start()]):
                    continue
                seen.add(code)
                evidence = sentence_at(text, m.start(), m.end())
                recs.append(dict(code_system=system, code=code, description=lookup(system, code), evidence=evidence, document_id=doc_id,
                                 guideline=guideline, confidence=conf, basis=basis,
                                 rationale=(f"{'Documented in' if basis == 'documented' else 'Inferred from'} {title}. Coder must confirm against the source text.")))
        return recs, self.gaps(joined), False

    @staticmethod
    def gaps(text):
        out = []
        t = text.lower()
        if "diabetes" in t and not re.search(r"type [12]", t):
            out.append(("warning", "missing_diabetes_type", "Diabetes is documented without a type. Query the provider."))
        if "heart failure" in t and not re.search(r"systolic|diastolic|hfref|hfpef", t):
            out.append(("warning", "missing_hf_type", "Heart failure is documented without systolic or diastolic type."))
        if re.search(r"fracture|knee pain", t) and not re.search(r"\b(left|right|bilateral)\b", t):
            out.append(("warning", "missing_laterality", "Laterality is missing from the note."))
        if "type 1 diabetes" in t and "type 2 diabetes" in t:
            out.append(("error", "conflict_diabetes_type", "The note documents both type 1 and type 2 diabetes. Clarify with the provider."))
        if re.search(r"\bleft knee\b", t) and re.search(r"\bright knee\b", t) and "bilateral" not in t:
            out.append(("warning", "conflict_laterality", "Both left and right knee appear. Confirm the treated side."))
        if not re.search(r"(moderate|low|high|straightforward) complexity", t):
            out.append(("info", "missing_mdm", "Medical decision making level is not stated. The E/M level needs coder judgment."))
        return [dict(severity=s, rule=r, message=m) for s, r, m in out]


engine = MockCodingEngine()


def validate(dx, procs, recs, code_info):
    """dx and procs are selected rows. code_info(system, code) returns the catalog row. Returns validation findings."""
    out = []
    add = lambda sev, rule, msg: out.append(dict(severity=sev, rule=rule, message=msg))
    codes = {d.code for d in dx}
    if not dx:
        add("error", "no_diagnosis", "Select at least one diagnosis.")
    if dx and sorted(d.sequence for d in dx)[0] != 1:
        add("error", "no_primary", "Set a primary diagnosis.")
    for d in dx:
        info = code_info("ICD10", d.code)
        if info is not None and not info.billable:
            add("error", "non_billable", f"{d.code} is not billable. Choose a more specific code.")
    if {"E11.65", "E11.9"} <= codes:
        add("error", "excludes_conflict", "E11.65 and E11.9 cannot be reported together.")
    if {"M17.11", "M17.12"} <= codes:
        add("warning", "laterality_conflict", "Right and left knee codes are both selected. Consider M17.0 for bilateral.")
    if "Z79.4" in codes and not any(c.startswith(("E10", "E11", "E13")) for c in codes):
        add("warning", "sequencing", "Z79.4 is a status code and needs a related diabetes diagnosis.")
    supported = {r.code for r in recs if r.status != "rejected"}
    for row in [*dx, *procs]:
        if row.source == "manual" and row.code not in supported:
            add("warning", "no_ai_evidence", f"{row.code} was added manually with no linked evidence. Confirm documentation support.")
    pc = {p.code: p for p in procs}
    em = [p for c, p in pc.items() if c.startswith("992")]
    others = [p for c, p in pc.items() if not c.startswith("992") and p.code_system == "CPT"]
    if em and others and not any(m.modifier == "25" for e in em for m in e.modifiers):
        add("warning", "modifier_25", "An E/M was reported with a procedure. Review whether modifier 25 applies.")
    for p in procs:
        info = code_info(p.code_system, p.code)
        if p.units < 1:
            add("error", "units", f"{p.code} needs at least 1 unit.")
        if info is not None and info.max_units and p.units > info.max_units:
            add("error", "units", f"{p.code} allows at most {info.max_units} units.")
        bundled = getattr(info, "bundled_with", None) if info is not None else None
        if bundled:
            for other in bundled.split(","):
                if other.strip() in pc:
                    add("warning", "ncci_bundle", f"{p.code} may bundle with {other.strip()} (demo edit, not a licensed NCCI table).")
    if not out:
        add("info", "passed", "No conflicts found.")
    return out
