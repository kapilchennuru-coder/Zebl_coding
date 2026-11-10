import { useSyncExternalStore } from 'react'
import { Batch, CaseRec, CodeItem, Priority, Status } from './types'
import { CATALOG, findCdi, newId } from './engine'

/**
 * In-memory store. Uploaded files and extracted text (possible PHI) live only here and vanish on reload.
 * Only batches made from generated synthetic metadata are mirrored to sessionStorage.
 * To connect a backend later, replace these actions with API calls and keep the same shapes.
 */
interface State { batches: Batch[]; cases: Record<string, CaseRec> }
const KEY = 'zebl.coding-agent.synthetic'
const files = new Map<string, Blob>(), urls = new Map<string, string>()
const listeners = new Set<() => void>()

function load(): State {
  try { const raw = sessionStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw) as State; Object.values(s.cases).forEach(c => (c.pageText = [])); return s } } catch { /* storage unavailable */ }
  return { batches: [], cases: {} }
}
let state: State = load()
const save = () => {
  try {
    const synth = state.batches.filter(b => b.synthetic)
    if (!synth.length) return sessionStorage.removeItem(KEY)
    const cases: Record<string, CaseRec> = {}
    synth.forEach(b => b.caseIds.forEach(id => (cases[id] = { ...state.cases[id], pageText: [] })))
    sessionStorage.setItem(KEY, JSON.stringify({ batches: synth, cases }))
  } catch { /* storage unavailable */ }
}
const set = (s: State) => { state = s; save(); listeners.forEach(l => l()) }

export const useStore = () => useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => state)
export const getState = () => state
export const getFile = (docId: string) => files.get(docId)
export const fileUrl = (docId: string) => { let u = urls.get(docId); const f = files.get(docId); if (!u && f) { u = URL.createObjectURL(f); urls.set(docId, u) } return u }

export const nextBatchId = () => {
  const y = new Date().getFullYear(), n = state.batches.reduce((m, b) => Math.max(m, +(b.id.split('-').pop() || 0)), 0) + 1
  return `ZEBL-CODING-${y}-${String(n).padStart(3, '0')}`
}
export const knownHashes = () => new Set(state.batches.filter(b => !b.synthetic).flatMap(b => b.hashes))
export const newJobId = () => 'job_' + crypto.randomUUID().replace(/-/g, '')

export function addBatch(b: Batch, cases: CaseRec[], f: Map<string, Blob>) {
  f.forEach((v, k) => files.set(k, v))
  const map = { ...state.cases }; cases.forEach(c => (map[c.id] = c))
  set({ batches: [b, ...state.batches], cases: map })
}
export const patchBatch = (id: string, patch: Partial<Batch>) => set({ ...state, batches: state.batches.map(b => (b.id === id ? { ...b, ...patch } : b)) })
export function patchCases(ids: string[], patch: Partial<CaseRec>) {
  const map = { ...state.cases }; ids.forEach(id => map[id] && (map[id] = { ...map[id], ...patch })); set({ ...state, cases: map })
}
export const patchCase = (id: string, patch: Partial<CaseRec>) => patchCases([id], patch)
export function setCodes(id: string, codes: CodeItem[]) {
  const c = state.cases[id]; if (!c) return
  const next = { ...c, codes }; patchCase(id, { codes, cdi: mergeCdi(c, findCdi(next)) })
}
/** Re-run the rules but keep the reviewer's decisions on issues that still apply. */
const mergeCdi = (c: CaseRec, fresh: CaseRec['cdi']) => fresh.map(f => { const old = c.cdi.find(o => o.type === f.type && o.passage === f.passage); return old ? { ...f, id: old.id, status: old.status } : f })
export function removeBatch(id: string) {
  const b = state.batches.find(x => x.id === id); if (!b) return
  b.caseIds.forEach(c => { urls.delete(c); files.delete(c) })
  const map = { ...state.cases }; b.caseIds.forEach(c => delete map[c]); set({ batches: state.batches.filter(x => x.id !== id), cases: map })
}

/* ───────── derived numbers: the single source for every counter on screen ───────── */
export function tally(b: Batch, cases: Record<string, CaseRec>) {
  const by: Record<string, number> = {}, list = b.caseIds.map(i => cases[i]).filter(Boolean)
  list.forEach(c => (by[c.status] = (by[c.status] || 0) + 1))
  const done = (by['Completed'] || 0) + (by['Approved'] || 0)
  return { total: list.length, completed: by['Completed'] || 0, onHold: by['On Hold'] || 0, by, validation: b.processing === 'Processing' ? 'Processing' : list.length && done === list.length ? 'Complete' : 'In Progress' }
}

/* ───────── synthetic metadata for the 100-record performance test (no documents, no real names) ───────── */
export function addSyntheticBatch(count = 100) {
  const id = nextBatchId(), seq = id.split('-').pop()
  let s = 12345; const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
  const st: Status[] = ['Unassigned', 'Unassigned', 'Assigned', 'In Progress', 'Pending QA', 'Rejected', 'Escalated', 'On Hold', 'Approved', 'Completed', 'Completed', 'Completed']
  const coders = ['Reese Holloway', 'Emery Vance', 'Sage Whitlock', null], pr: Priority[] = ['Routine', 'Routine', 'High', 'Urgent']
  const icd = CATALOG.filter(c => c.system === 'ICD-10-CM'), cpt = CATALOG.filter(c => c.system === 'CPT')
  const cases: CaseRec[] = [], ids: string[] = []
  for (let i = 1; i <= count; i++) {
    const docId = `DOC-${seq}-${String(i).padStart(3, '0')}`, d = new Date(2026, 5, 1 + Math.floor(rnd() * 28)), iso = d.toISOString().slice(0, 10)
    const mk = (c: typeof icd[number]): CodeItem => ({ id: newId('c'), system: c.system, code: c.code, desc: c.desc, evidence: '', term: '', page: null, source: 'Synthetic', rec: 'Suggested', validation: 'Valid', modifiers: [] })
    const status = pick(st)
    cases.push({
      id: docId, batchId: id, docId, fileName: `synthetic-record-${i}.pdf`, fileType: 'Synthetic', size: 0, pages: null, encounterId: `SYN-${String(i).padStart(4, '0')}`, encounterExtracted: true,
      patientName: `Synthetic, Patient ${String(i).padStart(3, '0')}`, dob: null, ageSex: null, fin: `SF${100000 + i}`, mrn: `SM${200000 + i}`, account: null, claimId: null,
      dos: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`, dosIso: iso, provider: `Dr. Synthetic ${1 + (i % 7)}`, billingProvider: null,
      processing: 'Processed', idUncertain: false, holdReason: status === 'On Hold' ? 'Synthetic hold reason' : null, status, coder: status === 'Unassigned' ? null : pick(coders), priority: pick(pr),
      codes: [mk(pick(icd)), ...(rnd() > 0.5 ? [mk(pick(icd))] : []), mk(pick(cpt))], cdi: [], synthetic: true, pageText: [],
    })
    ids.push(docId)
  }
  addBatch({ id, jobId: newJobId(), source: `synthetic-performance-test-${count}.zip`, uploadedAt: new Date().toISOString(), archived: false, processing: 'Ready', caseIds: ids, skipped: [], synthetic: true, hashes: [] }, cases, new Map())
  return id
}
