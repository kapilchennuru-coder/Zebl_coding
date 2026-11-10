import { CaseRec, CdiIssue, CodeItem, System } from './types'

/** Small local code catalog used for search and for the keyword rule engine. Demo data, not an official code set. */
const RAW: [System, string, string][] = [
  ['ICD-10-CM', 'J06.9', 'Acute upper respiratory infection, unspecified'], ['ICD-10-CM', 'J02.9', 'Acute pharyngitis, unspecified'], ['ICD-10-CM', 'R07.0', 'Pain in throat'],
  ['ICD-10-CM', 'R05.9', 'Cough, unspecified'], ['ICD-10-CM', 'R50.9', 'Fever, unspecified'], ['ICD-10-CM', 'J45.909', 'Unspecified asthma, uncomplicated'],
  ['ICD-10-CM', 'E11.9', 'Type 2 diabetes mellitus without complications'], ['ICD-10-CM', 'E11.65', 'Type 2 diabetes mellitus with hyperglycemia'], ['ICD-10-CM', 'I10', 'Essential (primary) hypertension'],
  ['ICD-10-CM', 'E78.5', 'Hyperlipidemia, unspecified'], ['ICD-10-CM', 'J18.9', 'Pneumonia, unspecified organism'], ['ICD-10-CM', 'N39.0', 'Urinary tract infection, site not specified'],
  ['ICD-10-CM', 'R10.9', 'Unspecified abdominal pain'], ['ICD-10-CM', 'K59.00', 'Constipation, unspecified'], ['ICD-10-CM', 'R11.2', 'Nausea with vomiting, unspecified'],
  ['ICD-10-CM', 'R51.9', 'Headache, unspecified'], ['ICD-10-CM', 'M54.50', 'Low back pain, unspecified'], ['ICD-10-CM', 'G47.33', 'Obstructive sleep apnea (adult) (pediatric)'],
  ['ICD-10-CM', 'F32.A', 'Depression, unspecified'], ['ICD-10-CM', 'F41.9', 'Anxiety disorder, unspecified'], ['ICD-10-CM', 'J44.9', 'Chronic obstructive pulmonary disease, unspecified'],
  ['ICD-10-CM', 'I50.9', 'Heart failure, unspecified'], ['ICD-10-CM', 'N18.9', 'Chronic kidney disease, unspecified'], ['ICD-10-CM', 'D64.9', 'Anemia, unspecified'],
  ['ICD-10-CM', 'E66.9', 'Obesity, unspecified'], ['ICD-10-CM', 'R55', 'Syncope and collapse'], ['ICD-10-CM', 'R42', 'Dizziness and giddiness'],
  ['ICD-10-CM', 'R06.02', 'Shortness of breath'], ['ICD-10-CM', 'R07.9', 'Chest pain, unspecified'], ['ICD-10-CM', 'K21.9', 'Gastro-esophageal reflux disease without esophagitis'],
  ['ICD-10-CM', 'J30.9', 'Allergic rhinitis, unspecified'], ['ICD-10-CM', 'L03.90', 'Cellulitis, unspecified'], ['ICD-10-CM', 'B34.9', 'Viral infection, unspecified'],
  ['ICD-10-CM', 'A09', 'Infectious gastroenteritis and colitis, unspecified'], ['ICD-10-CM', 'R19.7', 'Diarrhea, unspecified'], ['ICD-10-CM', 'R21', 'Rash and other nonspecific skin eruption'],
  ['ICD-10-CM', 'H66.90', 'Otitis media, unspecified, unspecified ear'], ['ICD-10-CM', 'H66.91', 'Otitis media, unspecified, right ear'], ['ICD-10-CM', 'H66.92', 'Otitis media, unspecified, left ear'], ['ICD-10-CM', 'H66.93', 'Otitis media, unspecified, bilateral'],
  ['ICD-10-CM', 'H92.09', 'Otalgia, unspecified ear'], ['ICD-10-CM', 'H92.01', 'Otalgia, right ear'], ['ICD-10-CM', 'H92.02', 'Otalgia, left ear'], ['ICD-10-CM', 'H92.03', 'Otalgia, bilateral'],
  ['ICD-10-CM', 'M25.569', 'Pain in unspecified knee'], ['ICD-10-CM', 'M25.561', 'Pain in right knee'], ['ICD-10-CM', 'M25.562', 'Pain in left knee'],
  ['CPT', '99281', 'Emergency department visit, minimal'], ['CPT', '99282', 'Emergency department visit, straightforward MDM'], ['CPT', '99283', 'Emergency department visit, low MDM'],
  ['CPT', '99284', 'Emergency department visit, moderate MDM'], ['CPT', '99285', 'Emergency department visit, high MDM'], ['CPT', '99202', 'Office visit, new patient, straightforward MDM'],
  ['CPT', '99203', 'Office visit, new patient, low MDM'], ['CPT', '99204', 'Office visit, new patient, moderate MDM'], ['CPT', '99205', 'Office visit, new patient, high MDM'],
  ['CPT', '99212', 'Office visit, established patient, straightforward MDM'], ['CPT', '99213', 'Office visit, established patient, low MDM'], ['CPT', '99214', 'Office visit, established patient, moderate MDM'], ['CPT', '99215', 'Office visit, established patient, high MDM'],
  ['CPT', '93000', 'Electrocardiogram, routine, with interpretation and report'], ['CPT', '71046', 'Radiologic exam, chest, 2 views'], ['CPT', '71045', 'Radiologic exam, chest, single view'],
  ['CPT', '36415', 'Collection of venous blood by venipuncture'], ['CPT', '81003', 'Urinalysis, automated, without microscopy'], ['CPT', '96372', 'Therapeutic injection, subcutaneous or intramuscular'], ['CPT', '90471', 'Immunization administration, one vaccine'],
  ['HCPCS', 'J3301', 'Injection, triamcinolone acetonide, per 10 mg'], ['HCPCS', 'J1100', 'Injection, dexamethasone sodium phosphate, 1 mg'], ['HCPCS', 'J0696', 'Injection, ceftriaxone sodium, per 250 mg'],
  ['HCPCS', 'J1885', 'Injection, ketorolac tromethamine, per 15 mg'], ['HCPCS', 'G0463', 'Hospital outpatient clinic visit for assessment and management'],
]
export const CATALOG = RAW.map(([system, code, desc]) => ({ system, code, desc }))
const BY_CODE = new Map(CATALOG.map(c => [c.code, c]))
export const describe = (code: string) => BY_CODE.get(code)?.desc || ''
export const searchCatalog = (q: string, system?: System) => {
  const s = q.trim().toLowerCase()
  return CATALOG.filter(c => (!system || c.system === system) && (!s || c.code.toLowerCase().includes(s) || c.desc.toLowerCase().includes(s))).slice(0, 25)
}

type Lat = { left: string; right: string; both: string; none: string }
interface Rule { re: RegExp; code?: string; lat?: Lat; system: System; note?: string; review?: boolean }
const rule = (re: string, code: string, system: System = 'ICD-10-CM', extra: Partial<Rule> = {}): Rule => ({ re: new RegExp(re, 'gi'), code, system, ...extra })
const RULES: Rule[] = [
  rule('\\bupper respiratory (tract )?infection\\b|\\bURI\\b', 'J06.9'), rule('\\bsore throat\\b|\\bpharyngitis\\b', 'R07.0'), rule('\\bcough(ing)?\\b', 'R05.9'),
  rule('\\bfever\\b|\\bfebrile\\b', 'R50.9'), rule('\\basthma\\b', 'J45.909'), rule('\\bdiabetes\\b.{0,40}hyperglyc|\\bhyperglycemia\\b', 'E11.65'),
  rule('\\b(type 2 diabetes|type II diabetes|T2DM|DM2)\\b', 'E11.9'), rule('\\bhypertension\\b|\\bHTN\\b', 'I10'), rule('\\bhyperlipidemia\\b', 'E78.5'),
  rule('\\bpneumonia\\b', 'J18.9'), rule('\\burinary tract infection\\b|\\bUTI\\b', 'N39.0'), rule('\\babdominal pain\\b', 'R10.9'), rule('\\bconstipation\\b', 'K59.00'),
  rule('\\bnausea\\b.{0,25}\\bvomiting\\b|\\bvomiting\\b', 'R11.2'), rule('\\bheadache\\b', 'R51.9'), rule('\\blow back pain\\b', 'M54.50'), rule('\\bsleep apnea\\b', 'G47.33'),
  rule('\\bdepression\\b', 'F32.A'), rule('\\banxiety\\b', 'F41.9'), rule('\\bCOPD\\b|\\bchronic obstructive pulmonary\\b', 'J44.9'), rule('\\bheart failure\\b|\\bCHF\\b', 'I50.9'),
  rule('\\bchronic kidney disease\\b|\\bCKD\\b', 'N18.9'), rule('\\banemia\\b', 'D64.9'), rule('\\bobesity\\b', 'E66.9'), rule('\\bsyncope\\b', 'R55'), rule('\\bdizziness\\b', 'R42'),
  rule('\\bshortness of breath\\b|\\bdyspnea\\b', 'R06.02'), rule('\\bchest pain\\b', 'R07.9'), rule('\\bGERD\\b|\\breflux\\b', 'K21.9'), rule('\\ballergic rhinitis\\b', 'J30.9'),
  rule('\\bcellulitis\\b', 'L03.90'), rule('\\bgastroenteritis\\b', 'A09'), rule('\\bdiarrhea\\b', 'R19.7'), rule('\\brash\\b', 'R21'),
  { re: /\botitis media\b/gi, system: 'ICD-10-CM', lat: { left: 'H66.92', right: 'H66.91', both: 'H66.93', none: 'H66.90' } },
  { re: /\b(ear pain|otalgia)\b/gi, system: 'ICD-10-CM', lat: { left: 'H92.02', right: 'H92.01', both: 'H92.03', none: 'H92.09' } },
  { re: /\bknee pain\b/gi, system: 'ICD-10-CM', lat: { left: 'M25.562', right: 'M25.561', both: 'M25.569', none: 'M25.569' } },
  rule('\\b(EKG|ECG|electrocardiogram)\\b', '93000', 'CPT'), rule('\\b(chest x-?ray|CXR)\\b', '71046', 'CPT', { review: true, note: 'Confirm number of views (71045 single view, 71046 two views).' }),
  rule('\\bvenipuncture\\b|\\bblood draw\\b', '36415', 'CPT'), rule('\\burinalysis\\b', '81003', 'CPT', { review: true, note: 'Confirm method (manual vs automated, with or without microscopy).' }),
  rule('\\bvaccine\\b|\\bimmunization\\b', '90471', 'CPT'),
  rule('\\b(triamcinolone|kenalog)\\b', 'J3301', 'HCPCS'), rule('\\bdexamethasone\\b', 'J1100', 'HCPCS', { review: true, note: 'Only reportable when administered in-facility. Confirm dose.' }),
  rule('\\b(ceftriaxone|rocephin)\\b', 'J0696', 'HCPCS'), rule('\\b(ketorolac|toradol)\\b', 'J1885', 'HCPCS'),
]
const NEG = /\b(no|if|denies|denied|without|negative for|neg for|ruled out|r\/o|absence of|not)\b[^.\n]*$/i
const lateral = (win: string): keyof Lat => {
  const l = /\b(left|lt)\b/i.test(win), r = /\b(right|rt)\b/i.test(win), b = /\bbilateral(ly)?\b|\bboth\b/i.test(win)
  return b || (l && r) ? 'both' : l ? 'left' : r ? 'right' : 'none'
}
const sentenceAround = (t: string, i: number, len: number) => {
  let a = Math.max(t.lastIndexOf('.', i), t.lastIndexOf('\n', i)) + 1, b = t.length
  for (const m of [t.indexOf('.', i + len), t.indexOf('\n', i + len)]) if (m !== -1) b = Math.min(b, m + 1)
  return t.slice(a, Math.min(b, a + 260)).replace(/\s+/g, ' ').trim()
}
let seq = 0
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`

/** Deterministic keyword rules over the extracted text. Not AI. Every suggestion carries the passage it came from. */
export function suggestCodes(pages: string[]): CodeItem[] {
  const out: CodeItem[] = [], seen = new Set<string>()
  const add = (c: Omit<CodeItem, 'id' | 'source' | 'rec' | 'modifiers'> ) => { if (!seen.has(c.code)) { seen.add(c.code); out.push({ ...c, id: newId('c'), source: 'Mock rule engine', rec: 'Suggested', modifiers: [] }) } }
  for (const r of RULES) {
    outer: for (let p = 0; p < pages.length; p++) {
      const t = pages[p]; r.re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = r.re.exec(t))) {
        if (NEG.test(t.slice(Math.max(0, m.index - 60), m.index))) continue
        let code = r.code!
        if (r.lat) code = r.lat[lateral(t.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80))]
        const desc = describe(code), unspec = /unspecified/i.test(desc)
        add({ system: r.system, code, desc, evidence: sentenceAround(t, m.index, m[0].length), term: m[0], page: p + 1,
          validation: r.review || unspec ? 'Review' : 'Valid', note: r.note || (unspec ? 'Unspecified code: check the note for a more specific diagnosis.' : undefined) })
        break outer
      }
    }
  }
  const all = pages.join('\n')
  const ed = /emergency (room|department)|\bED physician\b/i.exec(all)
  if (ed) add({ system: 'CPT', code: '99283', desc: describe('99283'), evidence: sentenceAround(all, ed.index, ed[0].length), term: ed[0], page: null, validation: 'Review', note: 'Emergency visit documented. The level (99281 to 99285) depends on medical decision making and must be set by the coder.' })
  else { const o = /office visit|clinic visit|follow[- ]up visit/i.exec(all); if (o) add({ system: 'CPT', code: '99213', desc: describe('99213'), evidence: sentenceAround(all, o.index, o[0].length), term: o[0], page: null, validation: 'Review', note: 'Office visit documented. New versus established status and MDM level must be confirmed by the coder.' }) }
  const order = { 'ICD-10-CM': 0, CPT: 1, HCPCS: 2 } as const
  return out.sort((a, b) => order[a.system] - order[b.system])
}

/* ───────── dates ───────── */
export const toIso = (s: string | null): string | null => {
  const m = s && /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s); if (!m) return null
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
  return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}
const ageAt = (dobIso: string, atIso: string) => { const d = new Date(dobIso), a = new Date(atIso); let n = a.getFullYear() - d.getFullYear(); if (a.getMonth() < d.getMonth() || (a.getMonth() === d.getMonth() && a.getDate() < d.getDate())) n--; return n }

/** Rule-based documentation checks. Nothing here edits the source document. */
export function findCdi(c: Pick<CaseRec, 'pageText' | 'dob' | 'ageSex' | 'dosIso' | 'dos' | 'patientName' | 'provider' | 'processing' | 'codes'>): CdiIssue[] {
  const out: CdiIssue[] = [], all = c.pageText.join('\n')
  const add = (type: string, severity: CdiIssue['severity'], passage: string, page: number | null, action: string) => out.push({ id: newId('i'), type, severity, passage, page, action, status: 'Open' })
  const pageOf = (re: RegExp) => { const i = c.pageText.findIndex(t => re.test(t)); return i === -1 ? null : i + 1 }
  if (c.processing === 'Needs OCR') add('Incomplete documentation', 'High', 'Little or no machine-readable text was found. The document may be a scan.', null, 'Review the page images manually or run OCR before coding.')
  if (!c.patientName) add('Patient identification', 'High', 'No patient name could be read from the document.', null, 'Confirm the patient identity before coding.')
  if (!c.dos) add('Missing information', 'Medium', 'No date of service could be read from the document.', null, 'Confirm the date of service with the source system.')
  if (!c.provider && c.processing === 'Processed') add('Missing information', 'Low', 'No rendering provider label was found.', null, 'Confirm the rendering provider before billing.')
  const age = c.ageSex && /(\d+)/.exec(c.ageSex)
  if (age && c.dob && c.dosIso) { const calc = ageAt(toIso(c.dob)!, c.dosIso); if (Math.abs(calc - +age[1]) >= 1) add('Age mismatch', 'High', `Date of birth ${c.dob} and date of service ${c.dos} imply age ${calc}, but the note states age ${age[1]}.`, pageOf(/DOB|Age/i), 'Query the author or registration to confirm date of birth and age.') }
  const lat = /\b(ear|eye|knee|ankle|shoulder|wrist|foot|hand|hip|elbow|arm|leg)\b[^.\n]{0,30}\b(pain|ache|otitis|swelling|injury|fracture|infection|discharge)\b|\b(pain|otitis|swelling|injury|fracture)\b[^.\n]{0,25}\b(ear|eye|knee|ankle|shoulder|wrist|foot|hand|hip|elbow|arm|leg)\b/gi
  let m: RegExpExecArray | null, n = 0
  while ((m = lat.exec(all)) && n < 2) { const win = all.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80); if (!/\b(left|right|bilateral|lt|rt|both)\b/i.test(win)) { add('Missing laterality', 'Medium', sentenceAround(all, m.index, m[0].length), pageOf(new RegExp(m[0].slice(0, 12).replace(/[^\w ]/g, '.'), 'i')), 'Ask the provider to document the side affected.'); n++ } }
  for (const sym of ['fever', 'cough', 'pain', 'nausea', 'vomiting', 'dizziness']) {
    const den = new RegExp(`\\b(denies|no|without)\\b[^.\\n]{0,40}\\b${sym}\\b`, 'i').exec(all), pos = new RegExp(`\\b(reports|complains of|c/o|has had|presents with|positive for)\\b[^.\\n]{0,40}\\b${sym}\\b`, 'i').exec(all)
    if (den && pos) { add('Conflicting findings', 'Medium', `"${den[0].trim()}" and "${pos[0].trim()}" both appear.`, pageOf(new RegExp(pos[0].slice(0, 14).replace(/[^\w ]/g, '.'), 'i')), `Clarify whether ${sym} is present.`); break }
  }
  for (const k of c.codes.filter(x => x.system === 'ICD-10-CM' && /unspecified/i.test(x.desc)).slice(0, 2)) add('Specificity', 'Low', `${k.code} (${k.desc}) is an unspecified code. ${k.evidence}`, k.page, 'Check whether the note supports a more specific diagnosis.')
  if (c.codes.some(x => x.system === 'CPT' && /^9928|^992(0|1)/.test(x.code))) add('E/M level', 'Low', 'An E/M code was suggested from the visit setting only.', null, 'Set the level from documented medical decision making or time.')
  return out
}

export function vitals(all: string) {
  const g = (re: RegExp) => { const m = re.exec(all); return m ? m[0].replace(/\s+/g, ' ').trim() : null }
  return [['Blood pressure', g(/\b(BP|blood pressure)\W{0,3}\d{2,3}\s*\/\s*\d{2,3}/i)], ['Heart rate', g(/\b(HR|heart rate|pulse)\W{0,3}\d{2,3}/i)], ['Temperature', g(/\b(temp|temperature)\W{0,3}\d{2,3}(\.\d)?/i)],
    ['Resp. rate', g(/\b(RR|resp(iratory)? rate)\W{0,3}\d{1,2}/i)], ['SpO2', g(/\b(SpO2|O2 sat\w*|oxygen sat\w*)\W{0,3}\d{2,3}/i)]].filter(v => v[1]) as [string, string][]
}
export const chiefComplaint = (all: string) => /chief complaint[^:\n]*:\s*([^\n]{3,140})/i.exec(all)?.[1]?.trim() || null
