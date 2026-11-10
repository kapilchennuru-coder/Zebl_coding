import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useStore, patchCase, setCodes } from './store'
import { Status, STATUSES } from './types'
import { StatusBadge } from './parts'
import { CODERS } from './BatchDetail'
import { AgentActivityTimeline, CDIReviewPanel, CodingChatPanel, CodingResultsPanel, Evidence, InsightsPanel, MedicalDocumentViewer, SummaryPanel } from './panels'
import { Btn, Empty, useAuth, useToast } from '../ui'

const LEFT = ['Main PDF', 'Summary', 'CDI Issues'] as const
const RIGHT = ['Codes', 'AI Insights', 'Agent Activity', 'Chat'] as const

export default function CaseWorkspace() {
  const { batchId, caseId } = useParams(), nav = useNavigate(), toast = useToast(), { user } = useAuth()
  const { batches, cases } = useStore(), batch = batches.find(b => b.id === batchId), c = caseId ? cases[caseId] : undefined
  const [lt, setLt] = useState<typeof LEFT[number]>('Main PDF'), [rt, setRt] = useState<typeof RIGHT[number]>('Codes'), [ev, setEv] = useState<Evidence>(null)
  const [pct, setPct] = useState(() => { try { return +(localStorage.getItem('zebl.ca.split') || 55) } catch { return 55 } })
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { setLt('Main PDF'); setEv(null); setRt('Codes') }, [caseId])
  if (!batch || !c || c.batchId !== batch.id) return <Empty>This case is not available. Uploaded files are kept in memory only, so a reload clears them. <Link className="text-wine font-semibold" to="/coding-agent">Back to Coding Cases</Link></Empty>

  const idx = batch.caseIds.indexOf(c.id), nextId = batch.caseIds[(idx + 1) % batch.caseIds.length], openIssues = c.cdi.filter(i => i.status === 'Open').length
  const next = () => nav(`/coding-agent/${batch.id}/case/${nextId}`)
  const show = (term: string, page?: number | null) => { setLt('Main PDF'); setEv({ text: term, nonce: Date.now() }) }
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault(); const r = box.current!.getBoundingClientRect()
    const move = (m: PointerEvent) => setPct(Math.min(75, Math.max(30, ((m.clientX - r.left) / r.width) * 100)))
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setPct(p => { try { localStorage.setItem('zebl.ca.split', String(Math.round(p))) } catch { /* ignore */ } return p }) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const setStatus = (s: Status) => {
    const mine = user?.full_name as string | undefined
    patchCase(c.id, { status: s, coder: c.coder || (s === 'Unassigned' ? null : mine || null), holdReason: s === 'On Hold' ? c.holdReason || 'Placed on hold by coder.' : null })
    toast(`Status set to ${s}. Batch totals updated.`)
  }
  const tab = (cur: string, set: (s: any) => void, t: string, badge?: number) => <button key={t} role="tab" aria-selected={cur === t} onClick={() => set(t)} className={`px-3 h-9 rounded-xl text-[13px] font-medium whitespace-nowrap transition ${cur === t ? 'bg-white shadow-card text-wine-dark font-semibold' : 'text-muted hover:text-ink hover:bg-white/50'}`}>{t}{!!badge && <span className="ml-1.5 inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-bad text-white text-[10.5px] font-bold tnum">{badge}</span>}</button>

  return <div className="flex flex-col h-[calc(100vh-4rem)] pagein">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 border-b border-white/80 bg-white/45 backdrop-blur-xl text-[13px]">
      <Link to={`/coding-agent/${batch.id}`} className="inline-flex items-center gap-1.5 text-wine font-semibold hover:underline"><ArrowLeft size={15} />Back to Coding Cases</Link>
      <span className="font-mono font-semibold text-aubergine" title={c.encounterExtracted ? 'Encounter ID' : 'Encounter ID not found in the document. Showing the file name.'}>{c.encounterId}</span>
      <span className="font-semibold">{c.patientName || <i className="font-normal text-muted">Patient name not available</i>}</span>
      <span className="text-muted">DOS {c.dos || 'Not available'}</span>
      <StatusBadge s={c.status} />
      <label className="flex items-center gap-1.5 text-muted">Status<select aria-label="Coding status" className="field !h-8 !w-auto !text-[13px]" value={c.status} onChange={e => setStatus(e.target.value as Status)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label>
      <label className="flex items-center gap-1.5 text-muted">Coder<select aria-label="Assigned coder" className="field !h-8 !w-auto !text-[13px]" value={c.coder || ''} onChange={e => patchCase(c.id, { coder: e.target.value || null, status: c.status === 'Unassigned' && e.target.value ? 'Assigned' : c.status })}>
        <option value="">Unassigned</option>{[user?.full_name, ...CODERS].filter(Boolean).map((n: any) => <option key={n}>{n}</option>)}</select></label>
      <span className="text-muted tnum">Case {idx + 1} of {batch.caseIds.length}</span>
      <Btn className="ml-auto" onClick={next} disabled={batch.caseIds.length < 2}>Next Case<ArrowRight size={15} /></Btn>
    </div>
    <div ref={box} className="flex-1 min-h-0 flex flex-col lg:flex-row">
      <section aria-label="Original medical document" className="flex flex-col min-h-[60vh] lg:min-h-0 lg:h-full surface !rounded-none !border-0 min-w-0" style={{ flexBasis: `${pct}%` }}>
        <div role="tablist" aria-label="Document views" className="flex gap-1 bg-sky-light/50 p-1 m-3 mb-0 rounded-xl overflow-x-auto">{LEFT.map(t => tab(lt, setLt, t, t === 'CDI Issues' ? openIssues : 0))}</div>
        <div className="flex-1 min-h-0 mt-2 overflow-auto">{lt === 'Main PDF' ? <MedicalDocumentViewer c={c} evidence={ev} /> : lt === 'Summary' ? <SummaryPanel c={c} /> :
          <CDIReviewPanel issues={c.cdi} onShow={term => show(term)} onUpdate={(id, status) => patchCase(c.id, { cdi: c.cdi.map(i => (i.id === id ? { ...i, status } : i)) })} />}</div>
      </section>
      <div role="separator" aria-orientation="vertical" aria-label="Resize document panel" onPointerDown={startDrag} className="hidden lg:block w-1.5 cursor-col-resize bg-sky/20 hover:bg-sky/50 transition shrink-0" />
      <section aria-label="Coding results" className="flex flex-col min-h-[70vh] lg:min-h-0 lg:h-full flex-1 min-w-0 bg-white/35">
        <div className="flex gap-2 items-center p-3 pb-0"><div role="tablist" aria-label="Coding views" className="flex gap-1 bg-sky-light/50 p-1 rounded-xl overflow-x-auto flex-1">{RIGHT.map(t => tab(rt, setRt, t))}</div>
          <Btn onClick={next} disabled={batch.caseIds.length < 2} className="shrink-0">Next</Btn></div>
        <div className="flex-1 min-h-0 mt-2 overflow-auto">
          {rt === 'Codes' && <CodingResultsPanel c={c} onChange={codes => setCodes(c.id, codes)} onEvidence={(t, p) => show(t, p)} />}
          {rt === 'AI Insights' && <InsightsPanel c={c} />}
          {rt === 'Agent Activity' && <AgentActivityTimeline c={c} uploadedAt={batch.uploadedAt} />}
          {rt === 'Chat' && <CodingChatPanel key={c.id} c={c} />}
        </div>
      </section>
    </div>
  </div>
}
