import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, CircleDashed, Download, FileText, History, Info, Loader2, RefreshCw, Send, ShieldAlert, Sparkles, Star, Trash2, Upload, X, XCircle, CheckCheck } from 'lucide-react'
import { api, qs } from './api'
import PdfViewer from './PdfViewer'
import { Btn, Err, Modal, Pill, Select, Spinner, fmtDate, fmtTime, label, useAuth, useFetch, useToast } from './ui'

const SYS = [['ICD10', 'ICD-10-CM'], ['CPT', 'CPT'], ['HCPCS', 'HCPCS']]
const CHECKS = ['I read the clinical documentation', 'Each code is supported by the note', 'Sequencing and primary diagnosis are correct', 'Modifiers and units are correct']
const LEFT_TABS = ['Main PDF', 'Summary', 'CDI Issues', 'Clinical Notes', 'Coding History']
const RIGHT_TABS = ['Codes', 'AI Insights', 'Agent Activity', 'Chat', 'Validation']
const OPEN = ['assigned', 'in_progress', 'rejected']
const WORKING = ['uploaded', 'queued', 'processing']
const LOCKED = ['pending_qa', 'approved']
const DOC_TYPES = ['clinical_note', 'progress', 'operative_report', 'discharge_summary', 'lab_report', 'imaging_report', 'physician_documentation', 'other']
const REASONS = ['Unsupported code', 'Wrong sequencing', 'Missing modifier', 'Missing code', 'Documentation query needed']
const mini = 'inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[12px] font-medium text-muted hover:text-wine hover:bg-wine-soft cursor-pointer'
const isGap = (v: any) => /^(missing_|conflict_|insufficient_)/.test(v.rule)
const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`)

export const Alerts = ({ items }: any) => <div className="grid gap-1.5">{items.map((v: any, i: number) => {
  const c = v.severity === 'error' ? 'bg-bad-soft text-bad' : v.severity === 'warning' ? 'bg-amber-soft text-amber-text' : 'bg-[#E4F1F4] text-muted'
  const I = v.severity === 'info' ? Info : AlertTriangle
  return <div key={i} className={`flex gap-2 rounded-lg px-2.5 py-2 text-[12.5px] ${c}`}><I size={14} className="shrink-0 mt-0.5" />{v.message}</div>
})}</div>

function Highlight({ text, evidence }: any) {
  if (!evidence || !text.includes(evidence)) return <>{text}</>
  const [a, ...b] = text.split(evidence)
  return <>{a}<mark>{evidence}</mark>{b.join(evidence)}</>
}

/** Panel width with a drag handle. The width is kept in localStorage when it is available. */
function useWidth(key: string, def: number, min: number, max: number) {
  const [w, setW] = useState(() => { try { return Math.min(max, Math.max(min, +(localStorage.getItem(key) || def))) } catch { return def } })
  useEffect(() => { try { localStorage.setItem(key, String(w)) } catch { /* storage may be blocked */ } }, [key, w])
  const drag = (dir: 1 | -1) => (e: any) => {
    e.preventDefault(); const x0 = e.clientX, w0 = w
    const move = (m: PointerEvent) => setW(Math.min(max, Math.max(min, w0 + dir * (m.clientX - x0))))
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  return [w, drag] as const
}
const Handle = ({ onPointerDown, name }: any) => <div role="separator" aria-orientation="vertical" aria-label={`Resize ${name} panel`} onPointerDown={onPointerDown} className="hidden lg:block w-1.5 shrink-0 cursor-col-resize bg-line hover:bg-sky transition" />

const STATE: any = {
  completed: [CheckCircle2, 'text-ok', 'Completed'], warning: [AlertTriangle, 'text-amber-text', 'Warning'], failed: [XCircle, 'text-bad', 'Failed'],
  requires_review: [ShieldAlert, 'text-amber-text', 'Requires human review'], running: [Loader2, 'text-wine', 'Running'], pending: [CircleDashed, 'text-muted', 'Pending'],
}

function AgentActivity({ id, refresh, running }: any) {
  const { data, error, reload } = useFetch(`/encounters/${id}/agent-events`, [id, refresh])
  const [pick, setPick] = useState('')
  const events = data?.events || []
  const shown = pick ? events.filter((e: any) => e.agent === pick) : events
  const last = events.length ? events[events.length - 1].run_id : ''
  return (
    <div className="grid gap-3">
      <div className="bg-sky-aqua border border-sky-light rounded-lg p-2.5 text-[12.5px] text-ink flex gap-2"><Info size={15} className="shrink-0 mt-0.5 text-wine" /><span>{data?.source_note || 'Loading activity.'} Only steps that really ran are listed. Agents that are not connected are marked as such, and none of them is simulated.</span></div>
      <Err>{error}</Err>
      {running && <div className="flex gap-2 items-center text-[13px] text-wine"><Loader2 size={15} className="animate-spin" />The engine is running. Its steps are listed here when it finishes.</div>}
      <div>
        <div className="flex justify-between items-center mb-1.5"><h3 className="font-semibold">Agents</h3>{pick && <button className="text-[12.5px] text-wine font-semibold" onClick={() => setPick('')}>Show all steps</button>}</div>
        <div className="grid gap-1">{(data?.agents || []).map((a: any) => {
          const n = events.filter((e: any) => e.agent === a.name).length
          return <button key={a.name} onClick={() => setPick(pick === a.name ? '' : a.name)} aria-pressed={pick === a.name} className={`text-left rounded-lg border px-2.5 py-1.5 transition ${pick === a.name ? 'border-wine bg-wine-soft' : 'border-line bg-white hover:border-sky'}`}>
            <div className="flex items-center gap-2 text-[13px]"><span className="font-medium flex-1 min-w-0 truncate">{a.name}</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${a.state === 'active' ? 'bg-ok-soft text-ok' : a.state === 'mock' ? 'bg-amber-soft text-amber-text' : 'bg-[#E4F1F4] text-muted'}`}>{a.state === 'active' ? 'Running code' : a.state === 'mock' ? 'Rule mock' : 'Not connected'}</span>{n > 0 && <span className="text-[11px] text-muted tnum">{n}</span>}</div>
            <div className="text-[11.5px] text-muted">{a.note}</div></button>
        })}</div>
      </div>
      <div>
        <div className="flex justify-between items-center mb-1.5"><h3 className="font-semibold">{pick ? pick : 'Processing timeline'}</h3><button className="text-[12.5px] text-wine font-semibold" onClick={reload}>Refresh</button></div>
        {!shown.length && <div className="text-muted text-[13px] border border-dashed border-line rounded-xl p-4 text-center">{pick ? 'This agent has not run for this encounter.' : 'Nothing has run yet. Generate suggestions to see each step.'}</div>}
        <ol className="grid gap-1.5">{shown.map((e: any) => {
          const [I, cls, text] = STATE[e.status] || STATE.pending
          return <li key={e.id} className={`bg-white border rounded-lg p-2.5 grid gap-0.5 ${e.run_id === last ? 'border-sky-light' : 'border-line opacity-80'}`}>
            <div className="flex items-center gap-2"><I size={15} className={`${cls} ${e.status === 'running' ? 'animate-spin' : ''}`} /><span className="font-semibold text-[13px] flex-1 min-w-0">{e.agent}</span><span className={`text-[11.5px] font-semibold ${cls}`}>{text}</span></div>
            <div className="text-[12.5px]">{e.task}</div>
            {e.result && <div className="text-[12px] text-muted">{e.result}</div>}
            {e.error && <div className="text-[12px] text-bad">{e.error}</div>}
            <div className="text-[11.5px] text-muted tnum flex flex-wrap gap-x-3">Started {fmtTime(e.started_at)}<span>{e.completed_at ? `Finished ${fmtTime(e.completed_at)}` : 'Not finished'}</span><span>{e.duration_ms !== null ? `${e.duration_ms} ms` : ''}</span><span className="uppercase tracking-wide">{e.source}</span></div>
          </li>
        })}</ol>
      </div>
    </div>
  )
}

function DocHistory({ id, onClose }: any) {
  const { data, error } = useFetch(`/documents/${id}/history`, [id])
  return (
    <Modal title={data ? `${data.title} history` : 'Document history'} onClose={onClose}>
      <Err>{error}</Err>
      {!data && !error && <div className="text-muted">Loading.</div>}
      {data && <div className="grid gap-4 text-[13px]">
        <div><h4 className="font-semibold mb-1.5">Versions</h4><div className="grid gap-1">{data.versions.map((v: any) => <div key={v.version} className="border border-line rounded-lg p-2"><b>Version {v.version}</b> <span className="text-muted">{v.filename} · {(v.size / 1024).toFixed(1)} KB{v.pages ? ` · ${v.pages} page(s)` : ''} · {v.characters} characters read</span><div className="text-[12px] text-muted">{v.uploaded_by} · {fmtTime(v.at)}</div></div>)}</div></div>
        <div><h4 className="font-semibold mb-1.5">Processing history</h4><ol className="grid gap-1">{data.events.map((x: any) => <li key={x.id} className="flex gap-2 border-b border-line py-1"><span className="text-muted tnum shrink-0 w-[120px]">{fmtTime(x.at)}</span><span className="flex-1"><b>{label(x.event)}</b>{x.version ? ` · v${x.version}` : ''}<span className="text-muted"> · {x.user}</span>{x.detail && <div className="text-[12px] text-muted">{x.detail}</div>}</span></li>)}</ol></div>
      </div>}
    </Modal>
  )
}

function Chat({ id }: any) {
  const [msgs, setMsgs] = useState<any[]>([]), [text, setText] = useState(''), [busy, setBusy] = useState(false), end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [msgs, busy])
  const send = async (t: string) => {
    t = t.trim(); if (!t) return
    setText(''); setMsgs(x => [...x, { me: true, text: t }]); setBusy(true)
    try { const r = await api('/assistant', { body: { message: t, encounter_id: +id } }); setMsgs(x => [...x, { text: r.reply, sources: r.sources }]) }
    catch (e: any) { setMsgs(x => [...x, { text: e.message, error: true }]) } finally { setBusy(false) }
  }
  const ask = ['Summarize this encounter', 'What documentation is missing?', 'Explain the validation warnings', 'Explain E11.65']
  return (
    <div className="grid gap-2.5 content-start">
      <p className="text-[12.5px] text-muted">Answers use only this encounter and the demo code catalog. The assistant is a rule mock, not a language model, so it cannot reason about free-form questions.</p>
      <div className="flex flex-wrap gap-1.5">{ask.map(q => <button key={q} onClick={() => send(q)} className="text-[12px] px-2.5 h-7 rounded-full border border-line bg-white hover:border-sky">{q}</button>)}</div>
      {msgs.map((m, i) => <div key={i} className={`max-w-[92%] rounded-xl px-3 py-2 text-[13.5px] ${m.me ? 'justify-self-end bg-plum text-white' : m.error ? 'bg-bad-soft text-bad' : 'bg-sky-aqua'}`}>{m.text}{m.sources?.length > 0 && <div className="text-[11.5px] text-muted mt-1">Sources: {m.sources.join(', ')}</div>}</div>)}
      {busy && <div className="text-muted text-[13px]">Looking that up...</div>}<div ref={end} />
      <form onSubmit={e => { e.preventDefault(); send(text) }} className="flex gap-2 sticky bottom-0 bg-white/90 backdrop-blur pt-1"><input aria-label="Message" className="field" value={text} onChange={e => setText(e.target.value)} placeholder="Ask about this chart or a code" /><button aria-label="Send" className="w-10 h-10 shrink-0 rounded-[10px] grid place-items-center bg-wine text-white"><Send size={16} /></button></form>
    </div>
  )
}

export default function Workspace() {
  const { id } = useParams(), { can, user } = useAuth(), toast = useToast(), nav = useNavigate(), [sp] = useSearchParams()
  const { data: w, setData, error } = useFetch(`/encounters/${id}/workspace`, [id])
  const [tab, setTab] = useState('ICD10'), [lt, setLt] = useState('Main PDF'), [rt, setRt] = useState('Codes'), [sel, setSel] = useState<number | null>(null)
  const [evidence, setEvidence] = useState(''), [nonce, setNonce] = useState(0), [located, setLocated] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(''), [err, setErr] = useState(''), [checks, setChecks] = useState<number[]>([]), [q, setQ] = useState(''), [runs, setRuns] = useState(0)
  const [lw, dragL] = useWidth('zebl.ws.left', 520, 340, 900), [rw, dragR] = useWidth('zebl.ws.right', 440, 340, 700)
  const search = useFetch(q.length > 1 ? `/codes/${tab}${qs({ q, size: 8 })}` : null, [q, tab])
  const events = useFetch(lt === 'Coding History' ? `/encounters/${id}/agent-events` : null, [id, runs, lt])
  const [upType, setUpType] = useState('progress'), [uploading, setUploading] = useState(false), [drag, setDrag] = useState(false), [histId, setHistId] = useState<number | null>(null), [docErr, setDocErr] = useState('')
  const [removals, setRemovals] = useState<string[]>([]), [adds, setAdds] = useState<any[]>([]), [reason, setReason] = useState(''), [comment, setComment] = useState('')
  useEffect(() => { setSel(sp.get('doc') ? +sp.get('doc')! : null); setEvidence(''); setChecks([]); setQ(''); setRemovals([]); setAdds([]); setDocErr('') }, [id])
  const working = (w?.documents || []).some((d: any) => WORKING.includes(d.status))
  const refreshDocs = async () => { try { const d = await api(`/encounters/${id}/documents`); setData((x: any) => (x ? { ...x, documents: d } : x)) } catch { /* the next poll tries again */ } }
  useEffect(() => { if (!working) return; const t = setInterval(refreshDocs, 1500); return () => clearInterval(t) }, [working, id]) // eslint-disable-line
  const act = async (name: string, path: string, opts: any = { method: 'POST' }) => {
    setBusy(name); setErr('')
    try { setData(await api(`/encounters/${id}${path}`, opts)); return true } catch (e: any) { setErr(e.message); return false } finally { setBusy('') }
  }
  const recs = useMemo(() => (w?.recommendations || []).filter((r: any) => r.system === tab), [w, tab])
  if (error) return <div className="p-6"><Err>{error}</Err></div>
  if (!w) return <Spinner />
  const edit = w.can_edit, S = w.session, docs = w.documents, doc = docs.find((d: any) => d.id === sel) || docs[0]
  const review = can('qa.review') && w.coding_status === 'pending_qa' && !edit
  const open = !LOCKED.includes(w.coding_status)
  const canUpload = can('uploads.manage') && open, canDelete = can('documents.delete') && open, canRetry = can('documents.reprocess') && open, canMark = can('coding.perform') || can('qa.review')
  const docCall = async (key: string, path: string, opts?: any, ok?: string) => {
    setBusy(key); setDocErr('')
    try { const d = await api(path, opts); setData((x: any) => ({ ...x, documents: d })); if (ok) toast(ok) } catch (e: any) { setDocErr(e.message) } finally { setBusy('') }
  }
  const sendFiles = async (list: FileList | File[] | null) => {
    const files = Array.from(list || []); if (!files.length) return
    const form = new FormData(); files.forEach(f => form.append('files', f)); form.append('doc_type', upType)
    setUploading(true); setDocErr('')
    try { const d = await api(`/encounters/${id}/documents`, { form }); setData((x: any) => ({ ...x, documents: d })); toast(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`) } catch (e: any) { setDocErr(e.message) } finally { setUploading(false) }
  }
  const replaceDoc = (did: number, f?: File | null) => { if (!f) return; const form = new FormData(); form.append('file', f); docCall('doc' + did, `/documents/${did}/replace`, { form }, 'New version uploaded') }
  const removeDoc = (d: any) => { if (window.confirm(`Remove "${d.title}" from this encounter? The record stays in document history.`)) docCall('doc' + d.id, `/documents/${d.id}`, { method: 'DELETE' }, 'Document removed') }
  const flag = (sys: string, code: string) => { const k = `${sys}:${code}`, on = removals.includes(k); return <button aria-pressed={on} onClick={() => setRemovals(on ? removals.filter(x => x !== k) : [...removals, k])} className={`text-[11.5px] font-semibold px-2 h-6 rounded-full border shrink-0 ${on ? 'bg-bad-soft text-bad border-bad/40' : 'border-line text-muted hover:border-bad/40'}`}>{on ? 'Flagged to remove' : 'Flag to remove'}</button> }
  const decide = async (decision: string) => {
    if (decision === 'rejected' && !reason) return setErr('Choose a rejection reason.')
    setBusy('decide'); setErr('')
    try {
      await api(`/qa/${id}/review`, { body: { decision, reason: reason || null, comment, add_codes: adds, remove_codes: removals.map(k => { const [system, code] = k.split(':'); return { system, code } }) } })
      toast(decision === 'approved' ? 'Approved' : 'Returned for correction'); nav('/qa')
    } catch (e: any) { setErr(e.message) } finally { setBusy('') }
  }
  const submit = async () => {
    if (checks.length < CHECKS.length) { setRt('Codes'); toast('Complete the review checklist first'); return }
    if (await act('submit', '/submit', { body: { attested: true } })) { toast('Submitted for QA'); nav('/queues') }
  }
  const generate = async () => { const ok = await act('gen', '/generate'); setRuns(n => n + 1); if (ok) setRt('Agent Activity') }
  const next = async () => {
    try {
      if (review) {
        const r = await api('/qa/queue?status=pending_qa&size=50')
        const n = r.items.find((e: any) => e.id !== +id!)
        if (n) nav(`/qa/${n.id}`); else toast('No other encounter is waiting for QA')
        return
      }
      const r = await api(`/encounters${qs({ size: 100, sort: 'due_at' })}`)
      const open = r.items.filter((e: any) => OPEN.includes(e.coding_status) && e.id !== +id!)
      const mine = open.filter((e: any) => e.coder_id === user?.id)
      const n = (mine.length ? mine : open)[0]
      if (n) nav(`/workspace/${n.id}`); else toast('No other open encounter in your queue')
    } catch (e: any) { toast(e.message) }
  }
  const showEvidence = (r: any) => { if (r.document_id) setSel(r.document_id); setEvidence(r.evidence); setNonce(n => n + 1); setLocated(null); setLt('Main PDF') }
  const sourceOf = (r: any) => (r.status === 'accepted' ? ['Coder accepted', 'ok'] : r.status === 'rejected' ? ['Rejected', 'bad'] : ['AI suggested', 'wine'])
  const hard = w.validations.filter((v: any) => v.severity === 'error'), soft = w.validations.filter((v: any) => v.severity !== 'error')
  const cdi = w.validations.filter(isGap)
  const tabBtn = (cur: string, set: (s: string) => void, t: string) => <button key={t} role="tab" aria-selected={cur === t} onClick={() => set(t)} className={`px-2.5 h-8 rounded-md text-[12.5px] font-medium whitespace-nowrap ${cur === t ? 'bg-white shadow-card text-aubergine' : 'text-muted hover:text-ink'}`}>{t}</button>
  const panel = 'overflow-auto p-3 grid gap-3 content-start min-h-0'

  const decisionCard = (
    <div className="border border-sky-light bg-sky-aqua/60 rounded-xl p-3 grid gap-2.5">
      <h4 className="font-semibold">Auditor decision</h4>
      <p className="text-[12.5px] text-muted">Read-only review. Flag codes to remove, or search a code in the center panel to flag it as missing. Your flags are recorded with the decision and shown to the coder.</p>
      {adds.map(a => <div key={a.system + a.code} className="flex items-center gap-2 text-[12.5px]"><Pill value="missing" tone="amber" /><span className="font-mono">{a.code}</span><span className="text-muted">{a.system}</span><button aria-label={`Unflag ${a.code}`} className="ml-auto text-muted hover:text-bad" onClick={() => setAdds(adds.filter(x => x !== a))}><X size={14} /></button></div>)}
      {removals.length > 0 && <div className="text-[12.5px]">Flagged to remove: <span className="font-mono">{removals.map(k => k.split(':')[1]).join(', ')}</span></div>}
      <Err>{err}</Err>
      <Select className="!w-full" label="Rejection reason" value={reason} onChange={setReason} options={[['', 'Rejection reason, if returning'], ...REASONS.map(x => [x, x])]} />
      <textarea aria-label="Comment" className="field !h-20 py-2" placeholder="Comment for the coder" value={comment} onChange={e => setComment(e.target.value)} />
      <div className="flex gap-2"><Btn busy={busy === 'decide'} onClick={() => decide('approved')}>Approve</Btn><Btn kind="danger" busy={busy === 'decide'} onClick={() => decide('rejected')}>Return for correction</Btn></div>
    </div>
  )

  const left = (
    <section aria-label="Clinical documents" className="flex flex-col min-h-0 lg:h-full bg-white">
      <div className={`p-3 border-b border-line grid gap-1.5 max-h-[36%] overflow-auto transition ${drag ? 'bg-sky-light/70 ring-2 ring-inset ring-sky' : ''}`}
        onDragOver={e => { if (canUpload) { e.preventDefault(); setDrag(true) } }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); if (canUpload) sendFiles(e.dataTransfer.files) }}>
        <div className="flex items-center justify-between gap-2"><h2 className="font-semibold text-[14px]">Documents <span className="text-muted font-normal tnum">({docs.length})</span></h2>
          {canUpload && <div className="flex items-center gap-1.5"><select aria-label="Document type" className="field !h-8 !w-auto !text-[12.5px] pr-7" value={upType} onChange={e => setUpType(e.target.value)}>{DOC_TYPES.map(t => <option key={t} value={t}>{label(t)}</option>)}</select>
            <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[10px] bg-wine text-white text-[13px] font-semibold cursor-pointer hover:bg-wine-dark"><Upload size={14} />{uploading ? 'Uploading' : 'Upload'}<input type="file" multiple hidden accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.tif,.tiff" onChange={e => { sendFiles(e.target.files); e.target.value = '' }} /></label></div>}</div>
        {canUpload && <div className="text-[11.5px] text-muted">Drop PDF, DOCX, TXT, JPEG, PNG or TIFF files here, up to 10 MB each. Scans need OCR, which is not connected.</div>}
        {!open && <div className="text-[11.5px] text-muted">Documents are locked while the encounter is in QA or approved.</div>}
        <Err>{docErr}</Err>
        {docs.map((d: any) => <div key={d.id} role="button" tabIndex={0} aria-pressed={doc.id === d.id} onClick={() => setSel(d.id)} onKeyDown={e => e.key === 'Enter' && setSel(d.id)}
          className={`rounded-xl border px-2.5 py-2 cursor-pointer transition ${doc.id === d.id ? 'border-wine bg-wine-soft/60' : 'border-line hover:border-sky bg-white'}`}>
          <div className="flex items-center gap-2"><FileText size={15} className="text-wine shrink-0" /><span className="font-semibold text-[13px] flex-1 min-w-0 truncate">{d.title}</span>{WORKING.includes(d.status) && <Loader2 size={13} className="animate-spin text-wine" />}<Pill value={d.status} /></div>
          <div className="text-[11.5px] text-muted tnum flex flex-wrap gap-x-3 mt-0.5">{label(d.type)}<span>{d.pages} page{d.pages === 1 ? '' : 's'}</span><span>{kb(d.size)}</span><span>Version {d.version}</span><span>{fmtDate(d.created_at)}</span><span>{d.uploaded_by}</span></div>
          {d.status_detail && <div className={`text-[12px] mt-1 ${d.status === 'failed' ? 'text-bad' : 'text-amber-text'}`}>{d.status_detail}</div>}
          <div className="flex flex-wrap gap-0.5 mt-1" onClick={e => e.stopPropagation()}>
            <a className={mini} href={`/api/encounters/${w.id}/documents/${d.id}/file?download=1`} download aria-label={`Download ${d.title}`}><Download size={13} />Download</a>
            {canUpload && <label className={mini}><RefreshCw size={13} />Replace<input type="file" hidden accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.tif,.tiff" onChange={e => { replaceDoc(d.id, e.target.files?.[0]); e.target.value = '' }} /></label>}
            {can('documents.view') && <button className={mini} onClick={() => setHistId(d.id)}><History size={13} />History</button>}
            {canRetry && d.source === 'upload' && ['failed', 'needs_attention'].includes(d.status) && <button className={mini} disabled={busy === 'doc' + d.id} onClick={() => docCall('doc' + d.id, `/documents/${d.id}/reprocess`, { method: 'POST' }, 'Retry queued')}><RefreshCw size={13} />Retry</button>}
            {canMark && d.status === 'extracted' && <button className={mini} onClick={() => docCall('doc' + d.id, `/documents/${d.id}/reviewed`, { method: 'POST' }, 'Marked reviewed')}><CheckCheck size={13} />Mark reviewed</button>}
            {canDelete && <button className={`${mini} hover:!text-bad hover:!bg-bad-soft`} onClick={() => removeDoc(d)}><Trash2 size={13} />Delete</button>}
          </div>
        </div>)}
        {!docs.length && <div className="text-muted text-[13px]">No documents are attached to this encounter.</div>}
      </div>
      <div role="tablist" className="flex gap-0.5 bg-[#E4F1F4] p-0.5 mx-3 mt-2 rounded-lg overflow-x-auto">{LEFT_TABS.map(t => tabBtn(lt, setLt, t))}</div>
      <div className="flex-1 min-h-[420px] lg:min-h-0 relative mt-2">
        {/* The viewer stays mounted while other tabs are open, so its scroll position survives a tab switch. */}
        {doc && <div className={lt === 'Main PDF' ? 'h-full flex flex-col' : 'hidden'}>
          {['failed', 'needs_attention'].includes(doc.status) && <div className={`px-3 py-1.5 text-[12.5px] ${doc.status === 'failed' ? 'bg-bad-soft text-bad' : 'bg-amber-soft text-amber-text'}`}><b>{label(doc.status)}.</b> {doc.status_detail}</div>}
          {evidence && <div className="px-3 py-1.5 bg-amber-soft text-amber-text text-[12.5px] flex items-center gap-2"><span className="flex-1 min-w-0 truncate">Evidence: "{evidence}"</span>
            <span className="font-semibold shrink-0">{located === true ? 'Located in this document' : located === false ? 'Not found in this document' : 'Locating'}</span><button aria-label="Clear evidence" onClick={() => setEvidence('')}><X size={14} /></button></div>}
          <div className="flex-1 min-h-0">
            {WORKING.includes(doc.status) ? <div className="h-full grid place-items-center text-muted"><div className="grid gap-2 justify-items-center"><Loader2 className="animate-spin text-wine" />Reading {doc.title}. {label(doc.status)}.</div></div>
              : doc.viewer === 'image' ? <div className="h-full overflow-auto p-3 bg-sky-aqua/50"><img alt={doc.title} className="mx-auto max-w-full shadow-card border border-line !bg-white" src={`/api/encounters/${w.id}/documents/${doc.id}/file`} /></div>
              : doc.viewer === 'none' ? <div className="h-full grid place-items-center p-6 text-center text-muted"><div>This format cannot be previewed in the browser.<div className="mt-2"><a className="text-wine font-semibold" href={`/api/encounters/${w.id}/documents/${doc.id}/file?download=1`}>Download the file</a></div></div></div>
              : <PdfViewer key={`${doc.id}-${doc.version}`} url={`/api/encounters/${w.id}/documents/${doc.id}/pdf`} evidence={evidence} nonce={nonce} onFound={setLocated} />}
          </div>
        </div>}
        {lt === 'Summary' && <div className={`${panel} h-full`}>
          <dl className="bg-white border border-line rounded-xl p-3 grid grid-cols-[96px_1fr] gap-y-1 text-[13px] [&>dt]:text-muted">
            <dt>Patient</dt><dd>{w.patient}</dd><dt>MRN</dt><dd className="font-mono">{w.mrn}</dd><dt>DOB</dt><dd>{fmtDate(w.dob)} · {w.gender}</dd><dt>Provider</dt><dd>{w.provider}</dd><dt>Facility</dt><dd>{w.facility}</dd>
            <dt>Service</dt><dd>{fmtDate(w.date_of_service)} · {w.encounter_type}</dd><dt>FIN</dt><dd className="font-mono">{w.fin}</dd><dt>Queue</dt><dd>{w.queue || 'None'}</dd><dt>Due</dt><dd>{w.due_at ? fmtDate(w.due_at) : 'Not set'}</dd>
          </dl>
          <div className="grid grid-cols-3 gap-2 text-center">{[['Documents', docs.length], ['Suggestions', (w.recommendations || []).length], ['Codes chosen', w.diagnoses.length + w.procedures.length]].map(([k, v]: any) => <div key={k} className="bg-white border border-line rounded-xl p-2.5"><div className="text-[22px] font-semibold tnum text-aubergine">{v}</div><div className="text-[12px] text-muted">{k}</div></div>)}</div>
          <p className="text-[12.5px] text-muted">This summary lists facts already in the record. A written clinical summary needs a language model, which is not connected.</p>
        </div>}
        {lt === 'CDI Issues' && <div className={`${panel} h-full`}>
          <h3 className="font-semibold">Documentation issues for the provider</h3>
          {cdi.length ? <Alerts items={cdi} /> : <div className="text-muted text-[13px] border border-dashed border-line rounded-xl p-4 text-center">{S?.ai_status === 'complete' || S?.ai_status === 'abstained' ? 'The rule checks found no documentation issues.' : 'Generate suggestions to run the documentation checks.'}</div>}
        </div>}
        {lt === 'Clinical Notes' && doc && <div className={`${panel} h-full`}><article className="bg-white border border-line rounded-xl p-3"><div className="flex justify-between mb-1"><h3 className="font-semibold">{doc.title}</h3><span className="text-[11.5px] text-muted">Version {doc.version}</span></div>{doc.text ? <p className="whitespace-pre-wrap leading-relaxed"><Highlight text={doc.text} evidence={evidence} /></p> : <p className="text-muted">No text was extracted from this document.</p>}</article></div>}
        {lt === 'Coding History' && <div className={`${panel} h-full`}>
          <h3 className="font-semibold">Status</h3><div className="flex gap-2 items-center"><Pill value={w.coding_status} /><Pill value={w.qa_status || 'not_started'} /></div>
          <h3 className="font-semibold">QA decisions</h3>{w.reviews.length ? w.reviews.map((r: any) => <div key={r.id} className="bg-white border border-line rounded-lg p-2 text-[13px]"><Pill value={r.decision} /> <b>{r.reason}</b><div className="text-muted">{r.comment} · {r.reviewer} · {fmtDate(r.at)}</div></div>) : <div className="text-muted text-[13px]">No QA decision yet.</div>}
          <h3 className="font-semibold">Engine runs</h3>{(events.data?.events || []).length ? (events.data.events as any[]).map(e => <div key={e.id} className="text-[12.5px] flex gap-2 border-b border-line py-1"><span className="text-muted tnum shrink-0">{fmtTime(e.started_at)}</span><span className="flex-1">{e.agent}</span><span className="text-muted">{label(e.status)}</span></div>) : <div className="text-muted text-[13px]">No engine runs yet.</div>}
        </div>}
      </div>
    </section>
  )

  const center = (
    <section aria-label="Coding results" className={`${panel} flex-1 min-w-0 lg:h-full bg-canvas`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex bg-[#E4F1F4] p-0.5 rounded-lg">{SYS.map(([k, n]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)} className={`px-3 h-8 rounded-md text-[13px] font-medium ${tab === k ? 'bg-white shadow-card' : 'text-muted'}`}>{n}</button>)}</div>
        {can('ai.generate') && !review && <Btn busy={busy === 'gen'} disabled={!edit} onClick={generate}><Sparkles size={15} />{S?.ai_status === 'complete' ? 'Regenerate' : 'Generate suggestions'}</Btn>}
      </div>
      <p className="text-[12px] text-muted">Suggestions come from a keyword rule mock, not a trained model. Nothing is selected until you accept it.</p>
      <Err>{err}</Err>
      {S?.ai_status === 'abstained' && <div className="bg-amber-soft text-amber-text rounded-lg p-2.5 text-[13px]">No suggestions were made because the documentation is insufficient.</div>}
      {!recs.length && S?.ai_status !== 'abstained' && <div className="text-muted text-center py-6 border border-dashed border-line rounded-xl bg-white">{S?.ai_status === 'complete' ? `No ${tab} suggestions for this note.` : 'Generate suggestions to review them here.'}</div>}
      {recs.map((r: any) => { const [st, tone] = sourceOf(r); return <div key={r.id} className={`bg-white border rounded-xl p-3 grid gap-2 transition ${r.status === 'rejected' ? 'opacity-55 border-line' : 'border-line hover:border-sky'}`}>
        <div className="flex justify-between items-start gap-2"><div><span className="font-mono font-medium text-[17px] text-aubergine">{r.code}</span><div className="text-[13.5px]">{r.description}</div></div><div className="flex gap-1.5 flex-wrap justify-end"><Pill value={st} tone={tone} /><Pill value={r.basis} tone={r.basis === 'documented' ? 'ok' : 'amber'} /></div></div>
        <button onClick={() => showEvidence(r)} className="text-left bg-canvas hover:bg-sky-light/60 transition rounded-lg p-2 text-[13px]" title="Show this passage in the document">“{r.evidence}”<span className="block text-[11.5px] text-wine font-semibold mt-0.5">Show in document</span></button>
        <div className="text-[12px] text-muted">{r.rationale} {r.guideline}.</div>
        <div className="flex items-center justify-between gap-3"><div className="flex-1 max-w-[150px]"><div className="text-[11.5px] text-muted tnum">Rule confidence {Math.round(r.confidence * 100)}%</div><div className="h-1.5 bg-[#E4F1F4] rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-sky to-sky-cyan" style={{ width: `${r.confidence * 100}%` }} /></div></div>
          {r.status === 'pending' ? <div className="flex gap-1.5"><Btn disabled={!edit} className="!h-8" onClick={() => act('r', `/recommendations/${r.id}`, { body: { action: 'accept' } })}><Check size={14} />Accept</Btn><Btn kind="danger" disabled={!edit} className="!h-8" onClick={() => act('r', `/recommendations/${r.id}`, { body: { action: 'reject' } })}><X size={14} />Reject</Btn></div> : null}</div>
      </div> })}
      <div className="bg-white border border-line rounded-xl p-3 grid gap-2"><label htmlFor="cs" className="font-semibold text-[13px]">Search another {tab} code</label><input id="cs" className="field" placeholder="Code or description" value={q} onChange={e => setQ(e.target.value)} />
        {q.length > 1 && search.data?.items.map((c: any) => <div key={c.id} className="flex items-center gap-2 text-[13px]"><span className="font-mono w-16 shrink-0">{c.code}</span><span className="flex-1 min-w-0">{c.description}</span>{review ? <Btn kind="ghost" className="!h-7" onClick={() => setAdds(a => (a.some(x => x.code === c.code && x.system === tab) ? a : [...a, { system: tab, code: c.code }]))}>Flag as missing</Btn> : <Btn kind="ghost" className="!h-7" disabled={!edit} onClick={() => act('m', '/codes', { body: { system: tab, code: c.code } })}>Add</Btn>}</div>)}
        {q.length > 1 && search.data?.items.length === 0 && <div className="text-muted text-[13px]">No matching code in the demo catalog.</div>}</div>
    </section>
  )

  const right = (
    <section aria-label="Coding details" className="flex flex-col min-h-0 lg:h-full bg-white">
      <div role="tablist" className="flex gap-0.5 bg-[#E4F1F4] p-0.5 m-3 mb-0 rounded-lg overflow-x-auto">{RIGHT_TABS.map(t => tabBtn(rt, setRt, t))}</div>
      <div className={`${panel} flex-1`}>
        {rt === 'Codes' && <Fragment>
          <div className="flex items-center justify-between"><h3 className="font-semibold">Coding by {w.coder || 'unassigned'}</h3><Pill value={w.coding_status} /></div>
          {!edit && !review && <div className="text-muted text-[12.5px]">Read only. This encounter can't be edited by you in its current status.</div>}
          <div><h4 className="text-[12px] uppercase tracking-wide text-muted mb-1.5">Primary and secondary diagnoses (ICD-10-CM)</h4>{!w.diagnoses.length && <div className="text-muted text-[13px]">No diagnoses selected.</div>}
            <div className="grid gap-1.5">{w.diagnoses.map((d: any) => <div key={d.id} className="bg-white border border-line rounded-lg p-2 flex items-center gap-2">
              <button aria-label={`Make ${d.code} primary`} title="Make primary" disabled={!edit || d.sequence === 1} onClick={() => act('p', '/primary', { body: { selected_id: d.id } })} className={d.sequence === 1 ? 'text-amber' : 'text-[#B4CDD4] hover:text-amber'}><Star size={16} fill={d.sequence === 1 ? 'currentColor' : 'none'} /></button>
              <div className="flex-1 min-w-0"><div className="font-mono font-medium">{d.code} <span className="font-sans text-[11.5px] text-muted font-normal">{d.sequence === 1 ? 'Primary' : `Secondary ${d.sequence - 1}`} · {d.source === 'manual' ? 'Manual' : 'Coder accepted'}</span></div><div className="text-[12.5px] text-muted truncate">{d.description}</div></div>
              {edit && <button aria-label={`Remove ${d.code}`} onClick={() => act('x', `/codes/ICD10/${d.id}`, { method: 'DELETE' })} className="text-muted hover:text-bad"><X size={16} /></button>}{review && flag('ICD10', d.code)}</div>)}</div></div>
          <div><h4 className="text-[12px] uppercase tracking-wide text-muted mb-1.5">Procedures (CPT) and HCPCS</h4>{!w.procedures.length && <div className="text-muted text-[13px]">No procedures selected.</div>}
            <div className="grid gap-1.5">{w.procedures.map((p: any) => <div key={p.id} className="bg-white border border-line rounded-lg p-2 grid gap-1.5">
              <div className="flex justify-between gap-2"><div className="min-w-0"><span className="font-mono font-medium">{p.code}</span> <span className="text-[11.5px] text-muted">{p.system} · {p.source === 'manual' ? 'Manual' : 'Coder accepted'}</span><div className="text-[12.5px] text-muted truncate">{p.description}</div></div>{edit && <button aria-label={`Remove ${p.code}`} onClick={() => act('x', `/codes/${p.system}/${p.id}`, { method: 'DELETE' })} className="text-muted hover:text-bad"><X size={16} /></button>}{review && flag(p.system, p.code)}</div>
              <div className="flex gap-2"><label className="text-[12px] text-muted">Units<input type="number" min={1} disabled={!edit} key={p.units} defaultValue={p.units} className="field !h-8 !w-16 block" onBlur={e => +e.target.value !== p.units && act('u', `/procedures/${p.id}`, { method: 'PUT', body: { units: +e.target.value, modifiers: p.modifiers } })} /></label>
                <label className="text-[12px] text-muted flex-1">Modifiers<input disabled={!edit} key={p.modifiers.join()} defaultValue={p.modifiers.join(', ')} placeholder="None" className="field !h-8 block font-mono" onBlur={e => { const m = e.target.value.split(/[,\s]+/).filter(Boolean); if (m.join() !== p.modifiers.join()) act('u', `/procedures/${p.id}`, { method: 'PUT', body: { units: p.units, modifiers: m } }) }} /></label></div></div>)}</div></div>
          <div className="text-[13px] bg-canvas rounded-lg p-2.5"><span className="text-muted">Billing provider</span><div className="font-semibold">{w.provider}</div></div>
          {edit && <Fragment><div><h4 className="text-[12px] uppercase tracking-wide text-muted mb-1.5">Review checklist</h4><div className="grid gap-1">{CHECKS.map((c, i) => <label key={i} className="flex gap-2 text-[13px] cursor-pointer"><input className="accent-wine mt-0.5" type="checkbox" checked={checks.includes(i)} onChange={e => setChecks(e.target.checked ? [...checks, i] : checks.filter(x => x !== i))} />{c}</label>)}</div></div>
            <Btn className="w-full !h-11" busy={busy === 'submit'} disabled={checks.length < CHECKS.length} onClick={submit}>Submit for QA</Btn></Fragment>}
          {review && decisionCard}
        </Fragment>}
        {rt === 'AI Insights' && <Fragment>
          <p className="text-[12.5px] text-muted">Built from the keyword rule mock and the documentation checks. There is no clinical language model behind these findings.</p>
          {[['Extracted diagnoses', (w.recommendations || []).filter((r: any) => r.system === 'ICD10')], ['Identified procedures and supplies', (w.recommendations || []).filter((r: any) => r.system !== 'ICD10')]].map(([title, list]: any) => <div key={title}><h4 className="font-semibold mb-1.5">{title}</h4>
            {!list.length && <div className="text-muted text-[13px]">None found.</div>}<div className="grid gap-1.5">{list.map((r: any) => <button key={r.id} onClick={() => showEvidence(r)} className="text-left bg-white border border-line hover:border-sky rounded-lg p-2"><div className="flex justify-between"><span className="font-mono font-medium">{r.code}</span><span className="text-[11.5px] text-muted">{label(r.basis)}</span></div><div className="text-[12.5px]">{r.description}</div><div className="text-[12px] text-muted">{r.rationale} {r.guideline}.</div></button>)}</div></div>)}
          <div><h4 className="font-semibold mb-1.5">Missing or conflicting documentation</h4>{cdi.length ? <Alerts items={cdi} /> : <div className="text-muted text-[13px]">None found by the rule checks.</div>}</div>
        </Fragment>}
        {rt === 'Agent Activity' && <AgentActivity id={id} refresh={runs} running={busy === 'gen'} />}
        {rt === 'Chat' && <Chat id={id} />}
        {rt === 'Validation' && <Fragment>
          <div className="flex justify-between items-center"><h3 className="font-semibold">Validation</h3>{edit && <Btn kind="secondary" className="!h-8" busy={busy === 'v'} onClick={() => act('v', '/validate')}>Run validation</Btn>}</div>
          {!w.validations.length && <div className="text-muted text-[13px]">Not validated yet.</div>}
          {hard.length > 0 && <div><h4 className="text-[12px] uppercase tracking-wide text-bad mb-1.5">Must fix before submitting</h4><Alerts items={hard} /></div>}
          {soft.length > 0 && <div><h4 className="text-[12px] uppercase tracking-wide text-amber-text mb-1.5">Needs your review</h4><Alerts items={soft} /></div>}
          <p className="text-[12px] text-muted">Code edits are demo rules, not licensed NCCI tables.</p>
        </Fragment>}
      </div>
    </section>
  )

  return (
    <div className="lg:h-[calc(100vh-64px)] flex flex-col min-h-0">
      {histId && <DocHistory id={histId} onClose={() => setHistId(null)} />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 border-b border-line bg-white/90 backdrop-blur text-[13px]">
        <Link to={review ? '/qa' : '/queues'} className="inline-flex items-center gap-1 text-wine font-semibold"><ArrowLeft size={15} />{review ? 'QA queue' : 'Coding queue'}</Link>
        <span className="w-px h-5 bg-line" /><b className="font-mono">{w.external_id}</b>
        <span>{w.patient} <span className="text-muted">· MRN {w.mrn}</span></span><span className="text-muted">DOS {fmtDate(w.date_of_service)}</span><span className="text-muted">Coder {w.coder || 'unassigned'}</span>
        <Pill value={w.coding_status} /><span className="inline-flex items-center gap-1.5 text-muted">AI <Pill value={S?.ai_status || 'not_run'} tone={S?.ai_status === 'complete' ? 'ok' : S?.ai_status === 'failed' ? 'bad' : S?.ai_status === 'abstained' ? 'amber' : 'neutral'} /></span>
        <span className="ml-auto flex items-center gap-2">
          {edit && <span className="text-[12px] text-muted hidden xl:inline">Changes save as you work</span>}{review && <span className="text-[12px] text-wine font-semibold hidden xl:inline">Auditor review, read-only</span>}
          <Btn kind="secondary" onClick={next}>Next encounter<ArrowRight size={15} /></Btn>
          {edit && <Btn onClick={submit} busy={busy === 'submit'}>Submit for QA</Btn>}
        </span>
      </div>
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="lg:h-full min-h-0 flex flex-col lg:shrink-0 lg:w-[var(--lw)]" style={{ ['--lw' as any]: `${lw}px` }}>{left}</div>
        <Handle name="documents" onPointerDown={dragL(1)} />
        {center}
        <Handle name="details" onPointerDown={dragR(-1)} />
        <div className="lg:h-full min-h-0 flex flex-col lg:shrink-0 lg:w-[var(--rw)] border-t lg:border-t-0 border-line" style={{ ['--rw' as any]: `${rw}px` }}>{right}</div>
      </div>
    </div>
  )
}
