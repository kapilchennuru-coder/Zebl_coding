import { useMemo, useState } from 'react'
import { Layers, Search, Archive, Upload, ArchiveRestore } from 'lucide-react'
import { useStore } from './store'
import { Batch, CaseRec } from './types'
import { UploadBatchCard, UploadDialog } from './parts'
import { Btn, Empty } from '../ui'

const SCOPES = [['all', 'All fields'], ['job', 'Job ID'], ['fin', 'FIN'], ['datapoint', 'Datapoint ID'], ['dos', 'Date of Service']] as const
type Scope = typeof SCOPES[number][0]

const norm = (s: any) => String(s ?? '').toLowerCase()
function matches(b: Batch, cases: Record<string, CaseRec>, scope: Scope, q: string) {
  if (!q) return true
  const qq = q.toLowerCase(), has = (...v: any[]) => v.some(x => norm(x).includes(qq))
  const cs = b.caseIds.map(i => cases[i]).filter(Boolean)
  const batchHit = has(b.id, b.jobId, b.source)
  if (scope === 'job') return batchHit
  if (scope === 'fin') return cs.some(c => has(c.fin))
  if (scope === 'datapoint') return cs.some(c => has(c.encounterId, c.docId, c.fileName))
  if (scope === 'dos') return cs.some(c => has(c.dos, c.dosIso))
  return batchHit || cs.some(c => has(c.fin, c.mrn, c.account, c.claimId, c.encounterId, c.docId, c.fileName, c.dos, c.dosIso, c.patientName))
}

export default function CodingCases() {
  const { batches, cases } = useStore()
  const [scope, setScope] = useState<Scope>('all'), [draft, setDraft] = useState(''), [applied, setApplied] = useState<{ scope: Scope; q: string }>({ scope: 'all', q: '' })
  const [archived, setArchived] = useState(false), [upload, setUpload] = useState(false)
  const visible = useMemo(() => batches.filter(b => b.archived === archived && matches(b, cases, applied.scope, applied.q.trim())), [batches, cases, archived, applied])
  const archivedCount = batches.filter(b => b.archived).length
  const search = (e: any) => { e.preventDefault(); setApplied({ scope, q: draft }) }
  return <>
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <h1 className="text-[26px] font-semibold tracking-tight text-aubergine">Coding Cases</h1>
      <Btn onClick={() => setUpload(true)}><Upload size={16} />Upload Documents</Btn>
    </div>

    <section className="surface rounded-2xl shadow-card p-5 mb-5 pagein" aria-label="Search coding cases">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="font-semibold text-[17px]">Search coding cases</h2>
        <div className="flex items-center gap-3 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5"><Layers size={16} />{visible.length} {archived ? 'archived' : 'visible'} job{visible.length === 1 ? '' : 's'}</span>
          <Btn kind="secondary" className="!h-8 !text-[12.5px]" onClick={() => setArchived(!archived)}>{archived ? <><ArchiveRestore size={14} />View active jobs</> : <><Archive size={14} />View archived jobs{archivedCount ? ` (${archivedCount})` : ''}</>}</Btn>
        </div>
      </div>
      <div role="tablist" aria-label="Search field" className="flex flex-wrap gap-1 mb-3">
        {SCOPES.map(([k, n]) => <button key={k} role="tab" aria-selected={scope === k} onClick={() => setScope(k)} className={`h-9 px-4 rounded-xl text-[13.5px] font-medium transition ${scope === k ? 'bg-sky-light/80 text-wine-dark font-semibold' : 'text-muted hover:bg-white/70'}`}>{n}</button>)}
      </div>
      <form onSubmit={search} className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]"><Search size={18} className="absolute left-3.5 top-[15px] text-muted" />
          <input aria-label="Search" className="field !h-12 pl-11" placeholder="Job ID, upload name, Claim ID, FIN, MRN, account number, or date…" value={draft} onChange={e => setDraft(e.target.value)} /></div>
        <Btn type="submit" className="!h-12 !px-7 !text-[15px]"><Search size={16} />Search</Btn>
        {(applied.q) && <Btn kind="ghost" className="!h-12" onClick={() => { setDraft(''); setApplied({ scope, q: '' }) }}>Clear</Btn>}
      </form>
    </section>

    <section className="surface rounded-2xl shadow-card p-4 sm:p-5 grid gap-4 pagein" aria-label="Upload batches">
      {visible.map(b => <UploadBatchCard key={b.id} batch={b} cases={cases} />)}
      {!visible.length && <Empty>{batches.length === 0 ? <div className="grid gap-3 justify-items-center py-4"><div>No batches yet. Upload a ZIP of medical documents to create your first batch.</div><Btn onClick={() => setUpload(true)}><Upload size={16} />Upload Documents</Btn></div>
        : applied.q ? 'No batches match this search.' : archived ? 'No archived jobs.' : 'All batches are archived.'}</Empty>}
    </section>
    {upload && <UploadDialog onClose={() => setUpload(false)} />}
  </>
}
