import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Bot, Check, CheckCircle2, CircleDashed, Download, FileWarning, Info, Link2, Pencil, Plus, Search, Send, Sparkles, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import PdfViewer from '../PdfViewer'
import { Btn, Modal, useAuth } from '../ui'
import { CaseRec, CdiIssue, CodeItem, NA, System } from './types'
import { chiefComplaint, describe, newId, searchCatalog, vitals } from './engine'
import { fileUrl } from './store'
import { fmtBytes, fmtWhen } from './parts'

/** Stands in for the future real backend. Every panel below reads only the CaseRec it is given. */
export const MOCK_NOTE = 'Simulated frontend result: produced by deterministic keyword rules, not by an AI model. A coder must review it.'
export type Evidence = { text: string; nonce: number } | null

/* ───────────────────────── Medical document viewer ───────────────────────── */
function TextDoc({ c, term }: { c: CaseRec; term?: string }) {
  const body = c.pageText.join('\n\n')
  const parts = useMemo(() => { if (!term) return [body]; const i = body.toLowerCase().indexOf(term.toLowerCase()); return i < 0 ? [body] : [body.slice(0, i), body.slice(i, i + term.length), body.slice(i + term.length)] }, [body, term])
  const mark = useRef<HTMLElement>(null); useEffect(() => mark.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), [term])
  return <div className="h-full overflow-auto p-4"><article className="max-w-[820px] mx-auto !bg-white rounded-xl border border-line shadow-card p-8 whitespace-pre-wrap text-[14px] leading-relaxed font-serif text-slate-800">
    {parts.length === 3 ? <>{parts[0]}<mark ref={mark}>{parts[1]}</mark>{parts[2]}</> : body || 'No text could be extracted from this document.'}</article></div>
}
function ImageDoc({ c }: { c: CaseRec }) {
  const [z, setZ] = useState(1), url = fileUrl(c.docId)
  return <div className="h-full flex flex-col"><div className="flex items-center gap-1 px-2 py-1.5 border-b border-line text-[13px] bg-white/60"><button aria-label="Zoom out" className="p-1.5 rounded-lg hover:bg-white" onClick={() => setZ(Math.max(.25, z - .25))}><ZoomOut size={16} /></button><span className="tnum w-12 text-center">{Math.round(z * 100)}%</span><button aria-label="Zoom in" className="p-1.5 rounded-lg hover:bg-white" onClick={() => setZ(Math.min(4, z + .25))}><ZoomIn size={16} /></button></div>
    <div className="flex-1 overflow-auto p-3">{c.fileType === 'TIFF' ? <Unsupported c={c} /> : <img alt={c.fileName} src={url} style={{ width: `${z * 100}%`, maxWidth: 'none' }} className="mx-auto !bg-white shadow-card border border-line" />}</div></div>
}
const Unsupported = ({ c }: { c: CaseRec }) => <div className="grid place-items-center h-full text-center p-8 text-muted"><div className="grid gap-2 justify-items-center"><FileWarning size={34} className="text-amber" /><b className="text-ink">{c.fileType} files cannot be previewed in the browser</b><span className="text-[13px] max-w-sm">Download the file to view it. Patient details for scanned images must be entered manually.</span></div></div>

export function MedicalDocumentViewer({ c, evidence }: { c: CaseRec; evidence: Evidence }) {
  const { can } = useAuth(), url = fileUrl(c.docId)
  if (c.synthetic) return <div className="grid place-items-center h-full text-center p-8 text-muted"><div className="grid gap-2 justify-items-center"><Info size={30} className="text-sky" /><b className="text-ink">Synthetic metadata record</b><span className="text-[13px] max-w-sm">This record was generated for the performance test. It has no source document.</span></div></div>
  if (!url) return <div className="grid place-items-center h-full text-center p-8 text-muted"><div className="grid gap-2 justify-items-center"><FileWarning size={30} className="text-amber" /><b className="text-ink">The source file is not in memory</b><span className="text-[13px] max-w-sm">Uploaded files are held in memory only and are cleared when the page reloads. Upload the ZIP again to restore it.</span></div></div>
  return <div className="h-full flex flex-col min-h-0">
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-line text-[12.5px] bg-white/60"><span className="truncate text-muted" title={c.fileName}>{c.fileName} · {c.fileType} · {fmtBytes(c.size)}{c.pages ? ` · ${c.pages} page${c.pages === 1 ? '' : 's'}` : ''}</span>
      {can('documents.view') && <a href={url} download={c.fileName} className="inline-flex items-center gap-1 text-wine font-semibold hover:underline shrink-0"><Download size={14} />Download</a>}</div>
    <div className="flex-1 min-h-0">{c.fileType === 'PDF' ? <PdfViewer url={url} evidence={evidence?.text} nonce={evidence?.nonce} /> : c.fileType === 'PNG' || c.fileType === 'JPG' || c.fileType === 'TIFF' ? <ImageDoc c={c} /> : <TextDoc c={c} term={evidence?.text} />}</div>
  </div>
}

/* ───────────────────────── Coding results ───────────────────────── */
const REC_CLS = { Suggested: 'bg-sky-light/70 text-wine-dark', Accepted: 'bg-ok-soft text-ok', Rejected: 'bg-bad-soft text-bad' }
const VAL_CLS = { Valid: 'bg-ok-soft text-ok', Review: 'bg-amber-soft text-amber-text', Warning: 'bg-bad-soft text-bad' }
const Chip = ({ cls, children }: any) => <span className={`inline-flex items-center h-5 px-2 rounded-full text-[11px] font-semibold whitespace-nowrap ${cls}`}>{children}</span>

function CodeRow({ k, letter, onEvidence, onRec }: { k: CodeItem; letter?: string; onEvidence: (k: CodeItem) => void; onRec: (r: CodeItem['rec']) => void }) {
  return <div className={`rounded-xl border bg-white/70 p-3 grid gap-1.5 transition ${k.rec === 'Rejected' ? 'opacity-60 border-line' : 'border-white/90'}`}>
    <div className="flex items-start gap-2.5">
      {letter && <span className="w-6 h-6 rounded-lg bg-sky-light/80 text-wine-dark text-[12px] font-bold grid place-items-center shrink-0 mt-0.5" title="ICD pointer letter">{letter}</span>}
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-mono font-bold text-[15px] text-aubergine">{k.code}</span>{k.modifiers.map(m => <Chip key={m} cls="bg-slate-200/70 text-muted">-{m}</Chip>)}<Chip cls={REC_CLS[k.rec]}>{k.rec}</Chip><Chip cls={VAL_CLS[k.validation]}>{k.validation}</Chip></div>
        <div className="text-[13.5px]">{k.desc}</div></div>
      <div className="flex gap-1 shrink-0"><button aria-label={`Accept ${k.code}`} title="Accept" onClick={() => onRec('Accepted')} className="w-8 h-8 rounded-lg grid place-items-center text-ok hover:bg-ok-soft active:scale-90 transition"><Check size={16} /></button>
        <button aria-label={`Reject ${k.code}`} title="Reject" onClick={() => onRec('Rejected')} className="w-8 h-8 rounded-lg grid place-items-center text-bad hover:bg-bad-soft active:scale-90 transition"><X size={16} /></button></div>
    </div>
    {k.evidence ? <button onClick={() => onEvidence(k)} className="text-left text-[12.5px] text-muted border-l-2 border-sky pl-2.5 hover:text-ink transition"><span className="italic">“{k.evidence.length > 190 ? k.evidence.slice(0, 190) + '…' : k.evidence}”</span>
      <span className="block text-[11.5px] text-wine font-semibold mt-0.5 not-italic"><Link2 size={11} className="inline mr-1" />Show in document{k.page ? ` · page ${k.page}` : ''}</span></button>
      : <div className="text-[12px] text-muted">{k.source === 'Coder' ? 'Added by coder.' : k.source === 'Synthetic' ? 'Synthetic record: no source passage.' : 'No single passage; derived from the visit setting.'}</div>}
    <div className="text-[11.5px] text-muted flex flex-wrap gap-x-3">{k.pointer && <span>ICD pointers: <b className="text-ink">{k.pointer}</b></span>}<span>Source: {k.source}</span>{k.note && <span className="text-amber-text">{k.note}</span>}</div>
  </div>
}

export function CodingResultsPanel({ c, onChange, onEvidence }: { c: CaseRec; onChange: (codes: CodeItem[]) => void; onEvidence: (term: string, page: number | null) => void }) {
  const [edit, setEdit] = useState(false)
  const live = c.codes.filter(k => k.rec !== 'Rejected'), dx = live.filter(k => k.system === 'ICD-10-CM')
  const letter = (k: CodeItem) => String.fromCharCode(65 + dx.findIndex(d => d.id === k.id))
  const setRec = (id: string, rec: CodeItem['rec']) => onChange(c.codes.map(k => (k.id === id ? { ...k, rec } : k)))
  const show = (k: CodeItem) => onEvidence(k.term, k.page)
  const section = (title: string, list: CodeItem[], withLetter = false) => <div className="grid gap-2"><h4 className="text-[11.5px] tracking-wider uppercase text-muted font-semibold">{title}</h4>
    {list.length ? list.map(k => <CodeRow key={k.id} k={k} letter={withLetter && k.rec !== 'Rejected' ? letter(k) : undefined} onEvidence={show} onRec={r => setRec(k.id, r)} />) : <div className="text-[13px] text-muted">None.</div>}</div>
  const icd = c.codes.filter(k => k.system === 'ICD-10-CM'), primary = icd.filter(k => k.rec !== 'Rejected').slice(0, 1), rest = icd.filter(k => !primary.includes(k))
  const cpt = c.codes.filter(k => k.system === 'CPT'), hcpcs = c.codes.filter(k => k.system === 'HCPCS')
  return <div className="p-4 grid gap-4 content-start">
    <div className="flex items-center justify-between gap-3"><div><h3 className="text-[19px] font-semibold text-aubergine flex items-center gap-2"><Sparkles size={18} className="text-sky" />Coding by ZEBL AI</h3><div className="text-[12.5px] text-muted">{live.length} active code{live.length === 1 ? '' : 's'} · {c.codes.length - live.length} rejected</div></div>
      <Btn kind="ghost" onClick={() => setEdit(true)}><Pencil size={15} />Edit Codes</Btn></div>
    <div className="flex gap-2 items-start bg-amber-soft/80 text-amber-text rounded-xl px-3 py-2 text-[12.5px]"><Info size={15} className="mt-0.5 shrink-0" />{MOCK_NOTE} Codes come only from text found in the document.</div>
    {!c.codes.length && <div className="text-center text-muted py-8 border border-dashed border-sky/40 rounded-xl bg-white/50"><b className="text-ink block mb-1">No codes could be suggested</b>{c.processing === 'Processed' ? 'Nothing in this document matched the demo rules. Use Edit Codes to add codes manually.' : 'The document has no machine-readable text. Add codes manually after reviewing it.'}</div>}
    {section('Primary diagnosis (ICD-10-CM)', primary, true)}{section('Secondary diagnoses (ICD-10-CM)', rest, true)}
    {section('Procedures and E/M (CPT)', cpt.map(k => ({ ...k, pointer: k.pointer || (dx.length ? 'A' : undefined) })))}{section('HCPCS', hcpcs)}
    <div className="grid grid-cols-2 gap-2 text-[13px]"><div className="rounded-xl bg-white/70 border border-white/90 p-3"><div className="text-muted text-[11.5px]">Rendering provider</div><div className="font-semibold">{c.provider || <span className="italic text-muted font-normal">{NA}</span>}</div></div>
      <div className="rounded-xl bg-white/70 border border-white/90 p-3"><div className="text-muted text-[11.5px]">Billing provider</div><div className="font-semibold">{c.billingProvider || <span className="italic text-muted font-normal">{NA}</span>}</div></div></div>
    {edit && <CodeEditor codes={c.codes} onClose={() => setEdit(false)} onSave={codes => { onChange(codes); setEdit(false) }} />}
  </div>
}

/** Edit, remove, add (catalog search or manual entry), then save. Nothing changes until Save is pressed. */
export function CodeEditor({ codes, onSave, onClose }: { codes: CodeItem[]; onSave: (c: CodeItem[]) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(codes), [q, setQ] = useState(''), [sys, setSys] = useState<System | ''>(''), [man, setMan] = useState({ code: '', desc: '', system: 'ICD-10-CM' as System })
  const results = useMemo(() => (q.trim() ? searchCatalog(q, sys || undefined) : []), [q, sys])
  const upd = (id: string, p: Partial<CodeItem>) => setDraft(d => d.map(k => (k.id === id ? { ...k, ...p } : k)))
  const add = (system: System, code: string, desc: string, validation: CodeItem['validation'] = 'Valid', note?: string) => {
    if (draft.some(k => k.code === code)) return
    setDraft(d => [...d, { id: newId('c'), system, code, desc, evidence: '', term: '', page: null, source: 'Coder', rec: 'Accepted', validation, note, modifiers: [] }])
  }
  const addManual = () => { const code = man.code.trim().toUpperCase(); if (!code) return; add(man.system, code, man.desc.trim() || describe(code) || 'Description not provided', describe(code) ? 'Valid' : 'Warning', describe(code) ? undefined : 'Not found in the demo catalog. Verify against the official code set.'); setMan({ ...man, code: '', desc: '' }) }
  return <Modal title="Edit codes" onClose={onClose} wide>
    <div className="grid gap-3">
      <div className="grid gap-2 max-h-[34vh] overflow-auto pr-1">{draft.length === 0 && <div className="text-muted text-[13px]">No codes yet.</div>}
        {draft.map(k => <div key={k.id} className="rounded-xl border border-white/90 bg-white/70 p-2.5 grid gap-1.5">
          <div className="flex items-center gap-2"><span className="text-[11px] text-muted w-16 shrink-0">{k.system}</span><b className="font-mono">{k.code}</b><span className="text-[12.5px] truncate flex-1" title={k.desc}>{k.desc}</span>
            <button aria-label={`Remove ${k.code}`} onClick={() => setDraft(d => d.filter(x => x.id !== k.id))} className="p-1.5 rounded-lg text-bad hover:bg-bad-soft"><Trash2 size={15} /></button></div>
          <div className="flex flex-wrap gap-2 items-center text-[12px]"><label className="flex items-center gap-1.5">Modifiers<input aria-label={`Modifiers for ${k.code}`} className="field !h-7 !w-24 !text-[12.5px]" placeholder="25, 59" value={k.modifiers.join(',')} onChange={e => upd(k.id, { modifiers: e.target.value.split(/[,\s]+/).filter(Boolean).map(m => m.toUpperCase().slice(0, 2)).slice(0, 4) })} /></label>
            {k.system !== 'ICD-10-CM' && <label className="flex items-center gap-1.5">ICD pointer<input aria-label={`Pointer for ${k.code}`} className="field !h-7 !w-16 !text-[12.5px]" placeholder="A,B" value={k.pointer || ''} onChange={e => upd(k.id, { pointer: e.target.value.toUpperCase().replace(/[^A-L,]/g, '').slice(0, 7) })} /></label>}
            <select aria-label="Status" className="field !h-7 !w-auto !text-[12.5px]" value={k.rec} onChange={e => upd(k.id, { rec: e.target.value as CodeItem['rec'] })}>{['Suggested', 'Accepted', 'Rejected'].map(s => <option key={s}>{s}</option>)}</select></div></div>)}</div>
      <div className="border-t border-line pt-3 grid gap-2"><div className="font-semibold text-[13px]">Search the code catalog</div>
        <div className="flex gap-2"><div className="relative flex-1"><Search size={15} className="absolute left-3 top-[13px] text-muted" /><input aria-label="Search codes" className="field pl-9" placeholder="Code or description, e.g. E11 or hypertension" value={q} onChange={e => setQ(e.target.value)} /></div>
          <select aria-label="Code system" className="field !w-auto" value={sys} onChange={e => setSys(e.target.value as any)}><option value="">All</option><option>ICD-10-CM</option><option>CPT</option><option>HCPCS</option></select></div>
        <div className="grid gap-1 max-h-36 overflow-auto">{results.map(r => <button key={r.code} onClick={() => add(r.system, r.code, r.desc)} disabled={draft.some(k => k.code === r.code)} className="flex items-center gap-2 text-left px-2.5 py-1.5 rounded-lg hover:bg-white/80 disabled:opacity-40 text-[13px]"><Plus size={14} className="text-wine shrink-0" /><b className="font-mono w-16 shrink-0">{r.code}</b><span className="truncate flex-1">{r.desc}</span><span className="text-[11px] text-muted">{r.system}</span></button>)}
          {q.trim() && !results.length && <div className="text-[12.5px] text-muted">No catalog match. Add it manually below.</div>}</div>
        <details className="text-[13px]"><summary className="cursor-pointer text-wine font-semibold">Add a code manually</summary>
          <div className="flex flex-wrap gap-2 mt-2"><select aria-label="System" className="field !w-auto" value={man.system} onChange={e => setMan({ ...man, system: e.target.value as System })}><option>ICD-10-CM</option><option>CPT</option><option>HCPCS</option></select>
            <input aria-label="Code" className="field !w-28" placeholder="Code" value={man.code} onChange={e => setMan({ ...man, code: e.target.value })} /><input aria-label="Description" className="field flex-1 min-w-[140px]" placeholder="Description" value={man.desc} onChange={e => setMan({ ...man, desc: e.target.value })} /><Btn kind="secondary" onClick={addManual}>Add</Btn></div></details></div>
      <div className="flex justify-end gap-2"><Btn kind="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={() => onSave(draft)}>Save changes</Btn></div>
    </div></Modal>
}

/* ───────────────────────── CDI ───────────────────────── */
const SEV = { High: 'bg-bad-soft text-bad', Medium: 'bg-amber-soft text-amber-text', Low: 'bg-sky-light/70 text-wine-dark' }
export function CDIReviewPanel({ issues, onUpdate, onShow }: { issues: CdiIssue[]; onUpdate: (id: string, s: CdiIssue['status']) => void; onShow: (term: string) => void }) {
  if (!issues.length) return <div className="p-6 text-center text-muted"><CheckCircle2 className="mx-auto text-ok mb-2" />No documentation issues were detected by the demo rules.</div>
  return <div className="p-4 grid gap-3 content-start">
    <div className="text-[12.5px] text-muted flex gap-2"><Info size={14} className="mt-0.5 shrink-0" />Findings are rule-based and never change the source document. Queries must go to the provider.</div>
    {issues.map(i => <div key={i.id} className={`rounded-xl border bg-white/70 p-3 grid gap-1.5 ${i.status === 'Resolved' || i.status === 'Dismissed' ? 'opacity-60' : ''} border-white/90`}>
      <div className="flex items-center gap-2 flex-wrap"><AlertTriangle size={15} className={i.severity === 'High' ? 'text-bad' : 'text-amber'} /><b className="text-[14px]">{i.type}</b><span className={`inline-flex items-center h-5 px-2 rounded-full text-[11px] font-semibold ${SEV[i.severity]}`}>{i.severity}</span>
        {i.page && <span className="text-[12px] text-muted">Page {i.page}</span>}
        <select aria-label={`Review status for ${i.type}`} className="field !h-7 !w-auto !text-[12.5px] ml-auto" value={i.status} onChange={e => onUpdate(i.id, e.target.value as any)}>{['Open', 'Acknowledged', 'Resolved', 'Dismissed'].map(s => <option key={s}>{s}</option>)}</select></div>
      <div className="text-[13px] border-l-2 border-amber pl-2.5">{i.passage}</div>
      <div className="text-[12.5px]"><b>Suggested action:</b> {i.action}</div>
      {i.type === 'Missing laterality' && <button className="text-left text-[12px] text-wine font-semibold hover:underline" onClick={() => onShow(i.passage.slice(0, 40))}>Show in document</button>}
    </div>)}
  </div>
}

/* ───────────────────────── Summary + AI insights ───────────────────────── */
const Field = ({ l, v }: { l: string; v: string | null }) => <div className="min-w-0"><dt className="text-[11.5px] text-muted">{l}</dt><dd className="text-[13.5px] font-semibold break-words">{v || <span className="italic font-normal text-muted">{NA}</span>}</dd></div>
export function SummaryPanel({ c }: { c: CaseRec }) {
  const all = c.pageText.join('\n'), cc = chiefComplaint(all)
  const lines = all.split('\n').map(l => l.trim()).filter(l => /^(assessment|impression|diagnos|plan|hpi)/i.test(l)).slice(0, 6)
  return <div className="p-4 grid gap-4 content-start">
    {c.idUncertain && <div className="flex gap-2 items-start bg-bad-soft text-bad rounded-xl px-3 py-2 text-[13px]"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><div><b>Manual review needed.</b> {c.holdReason}</div></div>}
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-xl bg-white/70 border border-white/90 p-4">
      <Field l="Patient" v={c.patientName} /><Field l="Date of birth" v={c.dob} /><Field l="Age / sex" v={c.ageSex} /><Field l="Encounter ID" v={c.encounterExtracted ? c.encounterId : `${c.encounterId} (from file name)`} /><Field l="FIN" v={c.fin} /><Field l="MRN" v={c.mrn} />
      <Field l="Account" v={c.account} /><Field l="Date of service" v={c.dos} /><Field l="Rendering provider" v={c.provider} /></dl>
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl bg-white/70 border border-white/90 p-4"><Field l="File" v={c.fileName} /><Field l="Type" v={c.fileType} /><Field l="Size" v={fmtBytes(c.size)} /><Field l="Pages" v={c.pages ? String(c.pages) : null} /></dl>
    <div className="rounded-xl bg-white/70 border border-white/90 p-4 grid gap-2"><h4 className="font-semibold text-[14px]">From the document</h4>
      {cc && <div className="text-[13px]"><b>Chief complaint:</b> {cc}</div>}
      {lines.length ? <ul className="text-[13px] grid gap-1 list-disc pl-5">{lines.map((l, i) => <li key={i}>{l.length > 220 ? l.slice(0, 220) + '…' : l}</li>)}</ul> : <div className="text-[13px] text-muted">{c.processing === 'Processed' ? 'No labelled assessment or plan lines were found. Read the document directly.' : 'No text available for this document.'}</div>}</div>
  </div>
}

export function InsightsPanel({ c }: { c: CaseRec }) {
  const all = c.pageText.join('\n'), v = vitals(all), cc = chiefComplaint(all)
  const dx = c.codes.filter(k => k.system === 'ICD-10-CM'), px = c.codes.filter(k => k.system !== 'ICD-10-CM')
  const gaps = c.cdi.filter(i => !['Conflicting findings', 'Age mismatch'].includes(i.type)), contra = c.cdi.filter(i => ['Conflicting findings', 'Age mismatch'].includes(i.type))
  const missing = ([['Patient name', c.patientName], ['Date of birth', c.dob], ['Date of service', c.dos], ['FIN', c.fin], ['MRN', c.mrn], ['Rendering provider', c.provider]] as [string, string | null][]).filter(x => !x[1]).map(x => x[0])
  const Box = ({ t, children }: any) => <div className="rounded-xl bg-white/70 border border-white/90 p-3 grid gap-1.5"><h4 className="text-[11.5px] tracking-wider uppercase text-muted font-semibold">{t}</h4>{children}</div>
  const none = <div className="text-[13px] text-muted">None found.</div>
  return <div className="p-4 grid gap-3 content-start">
    <div className="flex gap-2 items-start bg-amber-soft/80 text-amber-text rounded-xl px-3 py-2 text-[12.5px]"><Info size={15} className="mt-0.5 shrink-0" />{MOCK_NOTE}</div>
    <Box t="Extracted clinical information">{cc && <div className="text-[13px]"><b>Chief complaint:</b> {cc}</div>}{v.length ? <div className="grid grid-cols-2 gap-x-4 text-[13px]">{v.map(([k, x]) => <div key={k}><span className="text-muted">{k}:</span> {x}</div>)}</div> : <div className="text-[13px] text-muted">No vital signs found in the text.</div>}</Box>
    <Box t="Diagnosis candidates">{dx.length ? dx.map(k => <div key={k.id} className="text-[13px]"><b className="font-mono">{k.code}</b> {k.desc}</div>) : none}</Box>
    <Box t="Procedure and service candidates">{px.length ? px.map(k => <div key={k.id} className="text-[13px]"><b className="font-mono">{k.code}</b> {k.desc} <span className="text-muted">({k.system})</span></div>) : none}</Box>
    <Box t="Documentation gaps">{gaps.length ? gaps.map(i => <div key={i.id} className="text-[13px]"><b>{i.type}:</b> {i.passage}</div>) : none}</Box>
    <Box t="Contradictions">{contra.length ? contra.map(i => <div key={i.id} className="text-[13px]"><b>{i.type}:</b> {i.passage}</div>) : none}</Box>
    <Box t="Missing information">{missing.length ? <div className="text-[13px]">{missing.join(', ')}</div> : none}</Box>
    <Box t="Supporting evidence">{c.codes.filter(k => k.evidence).length ? c.codes.filter(k => k.evidence).map(k => <div key={k.id} className="text-[12.5px]"><b className="font-mono">{k.code}</b> <span className="italic text-muted">“{k.evidence.slice(0, 160)}{k.evidence.length > 160 ? '…' : ''}”</span>{k.page ? ` · p.${k.page}` : ''}</div>) : none}</Box>
  </div>
}

/* ───────────────────────── Agent activity (simulated) ───────────────────────── */
export function AgentActivityTimeline({ c, uploadedAt }: { c: CaseRec; uploadedAt: string }) {
  const t0 = new Date(uploadedAt).getTime(), icd = c.codes.filter(k => k.system === 'ICD-10-CM').length, cpt = c.codes.filter(k => k.system === 'CPT').length, hc = c.codes.filter(k => k.system === 'HCPCS').length
  const text = c.processing === 'Processed'
  const steps: [string, 'done' | 'warn' | 'wait' | 'skip', string][] = [
    ['Document received', 'done', `${c.fileName} (${c.fileType}, ${fmtBytes(c.size)})`], ['ZIP extracted', 'done', `Batch ${c.batchId}`],
    ['Text extracted', text ? 'done' : 'warn', text ? `${c.pageText.length} page${c.pageText.length === 1 ? '' : 's'} read` : c.processing === 'Needs OCR' ? 'Little or no text found. OCR would be required.' : c.processing === 'Preview only' ? 'Image files are preview only.' : 'The document could not be read.'],
    ['Clinical information identified', c.patientName ? 'done' : 'warn', c.patientName ? 'Patient details read from labelled fields.' : 'Patient name not found. Flagged for review.'],
    ['Diagnosis extraction', text ? 'done' : 'skip', `${icd} diagnosis candidate${icd === 1 ? '' : 's'}`], ['ICD-10 recommendations', text ? 'done' : 'skip', `${icd} suggestion${icd === 1 ? '' : 's'} with evidence`],
    ['CPT recommendations', text ? 'done' : 'skip', `${cpt} suggestion${cpt === 1 ? '' : 's'}`], ['HCPCS assessment', text ? 'done' : 'skip', `${hc} suggestion${hc === 1 ? '' : 's'}`],
    ['Coding validation', text ? (c.cdi.some(i => i.status === 'Open') ? 'warn' : 'done') : 'skip', `${c.cdi.filter(i => i.status === 'Open').length} open CDI issue(s)`],
    ['Human review required', c.status === 'Completed' || c.status === 'Approved' ? 'done' : 'wait', c.status === 'Completed' || c.status === 'Approved' ? `Status: ${c.status}` : 'A coder must review and set the final status.'],
  ]
  const ico = { done: <CheckCircle2 size={18} className="text-ok" />, warn: <AlertTriangle size={18} className="text-amber" />, wait: <CircleDashed size={18} className="text-sky" />, skip: <CircleDashed size={18} className="text-slate-300" /> }
  return <div className="p-4 grid gap-3 content-start">
    <div className="flex gap-2 items-start bg-amber-soft/80 text-amber-text rounded-xl px-3 py-2 text-[12.5px]"><Info size={15} className="mt-0.5 shrink-0" />Simulated frontend events. They describe what the local prototype did and are not logs from a real AI service.</div>
    <ol className="relative grid gap-0">{steps.map(([n, s, d], i) => <li key={n} className="flex gap-3 pb-4 relative pagein" style={{ animationDelay: `${i * 45}ms` }}>
      {i < steps.length - 1 && <span className="absolute left-[8.5px] top-6 bottom-0 w-px bg-sky/30" />}<span className="mt-0.5 shrink-0 bg-white rounded-full z-10">{ico[s]}</span>
      <div><div className="font-semibold text-[13.5px]">{i + 1}. {n}</div><div className="text-[12.5px] text-muted">{d}</div><div className="text-[11px] text-muted/80 tnum">{fmtWhen(new Date(t0 + i * 1400).toISOString())} · simulated</div></div></li>)}</ol>
  </div>
}

/* ───────────────────────── Chat (simulated, grounded in this case only) ───────────────────────── */
function answer(q: string, c: CaseRec): string {
  const all = c.pageText.join('\n'), live = c.codes.filter(k => k.rec !== 'Rejected'), s = q.toLowerCase()
  if (c.processing !== 'Processed') return 'This document has no extractable text, so I cannot answer questions about its content. Review it manually.'
  if (/summar/.test(s)) { const cc = chiefComplaint(all); const body = all.replace(/\s+/g, ' ').trim().slice(0, 420); return `${cc ? `Chief complaint: ${cc}. ` : ''}Opening of the note: “${body}…” (Simulated summary: first part of the document text, not generated.)` }
  if (/cdi|issue|gap|query|problem/.test(s)) return c.cdi.length ? `${c.cdi.length} potential issue(s): ` + c.cdi.map(i => `${i.type} (${i.severity}): ${i.passage}`).join(' | ') : 'No documentation issues were detected by the demo rules.'
  if (/evidence|support|why|where/.test(s)) { const m = live.find(k => s.includes(k.code.toLowerCase()) || (k.term && s.includes(k.term.toLowerCase()))) ; const list = m ? [m] : live.filter(k => k.evidence); return list.length ? list.map(k => `${k.code}: “${k.evidence}”${k.page ? ` (page ${k.page})` : ''}`).join(' | ') : 'No code currently has a supporting passage.' }
  if (/procedure|cpt|hcpcs|service|e\/m/.test(s)) { const p = live.filter(k => k.system !== 'ICD-10-CM'); return p.length ? 'Candidates: ' + p.map(k => `${k.code} ${k.desc}${k.evidence ? ` (“${k.evidence.slice(0, 90)}”)` : ''}`).join(' | ') + '. Levels and units need coder review.' : 'The document text does not clearly document a procedure or billable service.' }
  if (/diagnos|icd|code/.test(s)) { const d = live.filter(k => k.system === 'ICD-10-CM'); return d.length ? 'Documented diagnoses that map to ICD-10-CM: ' + d.map(k => `${k.code} ${k.desc}`).join('; ') + '.' : 'No diagnoses matched the demo rules in this document.' }
  const words = [...new Set(s.split(/\W+/).filter(w => w.length > 3))], sents = all.split(/(?<=[.!?\n])\s+/).filter(x => words.some(w => x.toLowerCase().includes(w))).slice(0, 3)
  return sents.length ? 'Closest passages in this document: ' + sents.map(x => `“${x.replace(/\s+/g, ' ').trim().slice(0, 200)}”`).join(' | ') : 'I could not find that in this document. I only use the text of the selected case.'
}
const ASK = ['Summarize this clinical note', 'What diagnoses are documented?', 'Which ICD-10 codes could apply?', 'What clinical evidence supports this diagnosis?', 'Are there any CDI issues?', 'Is there documentation supporting a procedure?']
export function CodingChatPanel({ c }: { c: CaseRec }) {
  const [msgs, setMsgs] = useState<{ me?: boolean; text: string }[]>([]), [text, setText] = useState(''), [busy, setBusy] = useState(false), end = useRef<HTMLDivElement>(null), timer = useRef<number>()
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs, busy])
  useEffect(() => () => clearTimeout(timer.current), [])
  const send = (q: string) => { const t = q.trim(); if (!t || busy) return; setText(''); setMsgs(m => [...m, { me: true, text: t }]); setBusy(true); timer.current = window.setTimeout(() => { setMsgs(m => [...m, { text: answer(t, c) }]); setBusy(false) }, 600) }
  return <div className="flex flex-col h-full min-h-0">
    <div className="px-4 pt-3 text-[12px] text-amber-text flex gap-2 items-start"><Info size={14} className="mt-0.5 shrink-0" />Simulated assistant. No AI model is connected. Answers are assembled from this case's extracted text and rule results only. Chat history is not saved.</div>
    <div className="flex-1 min-h-0 overflow-auto p-4 grid gap-3 content-start">
      {!msgs.length && <div className="grid gap-2"><div className="flex items-center gap-2 text-muted text-[13px]"><Bot size={16} className="text-sky" />Ask about this case:</div>{ASK.map(a => <button key={a} onClick={() => send(a)} className="text-left text-[13px] rounded-xl border border-white/90 bg-white/70 px-3 py-2 hover:border-sky hover:bg-white active:scale-[.99] transition">{a}</button>)}</div>}
      {msgs.map((m, i) => <div key={i} className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[13.5px] pagein ${m.me ? 'justify-self-end bg-gradient-to-br from-sky to-sky-cyan text-white' : 'bg-white/85 border border-white/90'}`}>{m.text}{!m.me && <div className="text-[10.5px] text-muted mt-1">Simulated response</div>}</div>)}
      {busy && <div className="text-muted text-[13px] flex gap-1.5 items-center"><span className="inline-flex gap-1"><i className="w-1.5 h-1.5 rounded-full bg-sky animate-bounce" /><i className="w-1.5 h-1.5 rounded-full bg-sky animate-bounce [animation-delay:.15s]" /><i className="w-1.5 h-1.5 rounded-full bg-sky animate-bounce [animation-delay:.3s]" /></span>Reading the document…</div>}<div ref={end} /></div>
    <form onSubmit={e => { e.preventDefault(); send(text) }} className="p-3 border-t border-line flex gap-2"><input aria-label="Message" className="field" value={text} onChange={e => setText(e.target.value)} placeholder="Ask about this document…" /><button aria-label="Send" disabled={!text.trim() || busy} className="w-10 h-10 shrink-0 rounded-xl grid place-items-center bg-gradient-to-br from-sky to-sky-cyan text-white disabled:opacity-50 active:scale-95 transition"><Send size={16} /></button></form>
  </div>
}
