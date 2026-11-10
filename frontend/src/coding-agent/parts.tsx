import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, CheckCircle2, CloudUpload, FileArchive, Layers, Loader2, TriangleAlert, XCircle } from 'lucide-react'
import { Batch, CaseRec, Status } from './types'
import { addBatch, getState, knownHashes, nextBatchId, newJobId, patchBatch, tally, addSyntheticBatch } from './store'
import { ingestZip, Progress, UploadError } from './extract'
import { Btn, Modal } from '../ui'

export const STATUS_CLS: Record<Status, string> = {
  Completed: 'bg-ok-soft text-ok', Approved: 'bg-ok-soft text-ok', 'On Hold': 'bg-bad-soft text-bad', Rejected: 'bg-bad-soft text-bad', Escalated: 'bg-bad-soft text-bad',
  Assigned: 'bg-sky-light/70 text-wine-dark', 'In Progress': 'bg-sky-light/70 text-wine-dark', 'Pending QA': 'bg-amber-soft text-amber-text', Unassigned: 'bg-slate-200/70 text-muted',
}
export const StatusBadge = ({ s }: { s: Status }) => <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap ${STATUS_CLS[s]}`}>{s}</span>
export const fmtBytes = (n: number) => !n ? '—' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`
export const fmtWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
export const NotAvail = () => <span className="text-muted italic">Not available</span>

/** The three prominent numbers for a batch. Always derived from the cases, never stored. */
export function BatchStatistics({ batch, cases, compact }: { batch: Batch; cases: Record<string, CaseRec>; compact?: boolean }) {
  const t = tally(batch, cases)
  const tile = (label: string, n: number, cls: string, txt: string) => (
    <div className={`rounded-xl ${compact ? 'px-4 py-2.5 min-w-[104px]' : 'px-4 py-3 min-w-[118px]'} ${cls}`}><div className={`text-[12.5px] ${txt} opacity-80`}>{label}</div><div className={`font-bold tnum text-[17px] ${txt} whitespace-nowrap`}>{n} {n === 1 ? 'Case' : 'Cases'}</div></div>
  )
  return <div className="flex gap-3 flex-wrap" aria-label="Batch statistics">{tile('Total', t.total, 'bg-sky-light/55', 'text-aubergine')}{tile('Completed', t.completed, 'bg-[#DDF6E6]', 'text-[#157A45]')}{tile('On Hold', t.onHold, 'bg-[#FDE3E3]', 'text-[#B83A3A]')}</div>
}

export function UploadBatchCard({ batch, cases }: { batch: Batch; cases: Record<string, CaseRec> }) {
  const nav = useNavigate(), t = tally(batch, cases)
  const open = () => nav(`/coding-agent/${batch.id}`)
  const other = Object.entries(t.by).filter(([k]) => !['Completed', 'On Hold'].includes(k)).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(' · ')
  return (
    <article role="link" tabIndex={0} aria-label={`Open batch ${batch.id}`} onClick={open} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}
      className="lift cursor-pointer rounded-2xl border border-white/90 bg-white/60 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 focus-visible:ring-2 ring-sky">
      <div className="min-w-0 grid gap-1.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-muted text-[13px]">Upload Id:</span><span className="font-bold text-[17px] text-aubergine tnum">{batch.id}</span>
          <button className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-sky/25 bg-white/70 text-[12.5px] font-semibold hover:border-sky hover:bg-white transition"
            onClick={e => { e.stopPropagation(); patchBatch(batch.id, { archived: !batch.archived }) }}>
            {batch.archived ? <><ArchiveRestore size={14} />Restore</> : <><Archive size={14} />Archive</>}</button>
        </div>
        <div className="text-[13px] text-muted flex items-center gap-1.5"><FileArchive size={14} />Source: <span className="text-ink">{batch.source}</span></div>
        <div className="text-[13px] text-muted">Uploaded {fmtWhen(batch.uploadedAt)} · {t.total} document{t.total === 1 ? '' : 's'}{batch.skipped.length > 0 && <span className="text-amber-text"> · {batch.skipped.length} skipped</span>}</div>
        <div className="text-[13px] text-muted flex flex-wrap gap-x-4 gap-y-0.5"><span>Job Id: <span className="text-ink tnum break-all">{batch.jobId}</span></span>
          <span className="inline-flex items-center gap-1.5">Validation: <i className={`w-2 h-2 rounded-full ${t.validation === 'Complete' ? 'bg-ok' : t.validation === 'Processing' ? 'bg-sky animate-pulse' : 'bg-amber'}`} /><span className="text-ink">{t.validation}</span></span></div>
        {other && <div className="text-[12px] text-muted">{other}</div>}
      </div>
      <BatchStatistics batch={batch} cases={cases} />
    </article>
  )
}

const TIPS = 'ZIP files with PDF, DOCX, TXT, PNG, JPG or TIFF documents. Any number of documents is allowed.'
type Result = { id: string; added: number; skipped: Batch['skipped'] }

/** Drag and drop, validation, progress and a result summary. Everything is processed inside the browser. */
export function UploadDialog({ onClose }: { onClose: () => void }) {
  const nav = useNavigate(), pick = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false), [prog, setProg] = useState<Progress | null>(null), [err, setErr] = useState(''), [file, setFile] = useState<File | null>(null), [res, setRes] = useState<Result | null>(null)
  const busy = !!prog
  const choose = (f?: File | null) => { setErr(''); setRes(null); if (!f) return; if (!/\.zip$/i.test(f.name)) return setErr('That is not a ZIP file. Choose a .zip archive of medical documents.'); setFile(f) }
  const start = async () => {
    if (!file) return
    setErr(''); const id = nextBatchId()
    try {
      const r = await ingestZip(file, id, knownHashes(), setProg)
      const b: Batch = { id, jobId: newJobId(), source: file.name, uploadedAt: new Date().toISOString(), archived: false, processing: 'Ready', caseIds: r.cases.map(c => c.id), skipped: r.skipped, synthetic: false, hashes: r.hashes }
      addBatch(b, r.cases, r.files); setRes({ id, added: r.cases.length, skipped: r.skipped }); setFile(null)
    } catch (e: any) { setErr(e instanceof UploadError ? e.message : 'The ZIP could not be processed: ' + (e?.message || 'unknown error')) } finally { setProg(null) }
  }
  const pct = prog ? Math.round((prog.done / Math.max(1, prog.total)) * 100) : 0
  return (
    <Modal title="Upload documents" onClose={busy ? () => {} : onClose}>
      {res ? <div className="grid gap-3">
        <div className="flex items-start gap-2.5 bg-ok-soft text-ok rounded-xl p-3"><CheckCircle2 size={18} className="mt-0.5 shrink-0" /><div><b>{res.added} document{res.added === 1 ? '' : 's'} added</b> to batch <span className="tnum">{res.id}</span>.<div className="text-[12.5px] opacity-90">Files were read in your browser and were not sent anywhere.</div></div></div>
        {res.skipped.length > 0 && <div className="bg-amber-soft text-amber-text rounded-xl p-3 text-[13px]"><div className="font-semibold mb-1 flex gap-1.5 items-center"><TriangleAlert size={15} />{res.skipped.length} file{res.skipped.length === 1 ? '' : 's'} skipped</div>
          <ul className="max-h-32 overflow-auto grid gap-0.5">{res.skipped.map((s, i) => <li key={i} className="break-all">{s.name}: {s.reason}</li>)}</ul></div>}
        <div className="flex gap-2 justify-end"><Btn kind="secondary" onClick={onClose}>Close</Btn><Btn onClick={() => { onClose(); nav(`/coding-agent/${res.id}`) }}>Open batch</Btn></div>
      </div> : <div className="grid gap-3">
        <div onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); choose(e.dataTransfer.files[0]) }}
          onClick={() => !busy && pick.current?.click()} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && pick.current?.click()} aria-label="Choose a ZIP file or drop it here"
          className={`rounded-2xl border-2 border-dashed p-7 text-center transition cursor-pointer ${over ? 'border-sky bg-sky-light/50 scale-[1.01]' : 'border-sky/40 bg-white/50 hover:bg-white/80'}`}>
          <CloudUpload className="mx-auto text-sky mb-2" size={34} />
          <div className="font-semibold">{file ? file.name : 'Drop a ZIP file here, or click to browse'}</div>
          <div className="text-[12.5px] text-muted mt-1">{file ? fmtBytes(file.size) : TIPS}</div>
          <input ref={pick} type="file" accept=".zip,application/zip" hidden onChange={e => { choose(e.target.files?.[0]); e.target.value = '' }} />
        </div>
        {busy && <div role="status" aria-live="polite"><div className="flex justify-between text-[12.5px] text-muted mb-1"><span className="inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" />{prog!.stage}</span><span className="tnum">{prog!.done}/{prog!.total}</span></div>
          <div className="h-2 rounded-full bg-sky-light/70 overflow-hidden"><div className="h-full bg-gradient-to-r from-sky to-sky-cyan transition-all duration-300" style={{ width: `${pct}%` }} /></div>
          {prog!.current && <div className="text-[12px] text-muted mt-1 truncate">{prog!.current}</div>}</div>}
        {err && <div role="alert" className="flex gap-2 items-start bg-bad-soft text-bad rounded-xl p-3 text-[13.5px]"><XCircle size={17} className="mt-0.5 shrink-0" />{err}</div>}
        <p className="text-[12px] text-muted">Documents are read locally. Nothing is uploaded, and extracted patient text is held in memory only until you reload the page.</p>
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <button className="text-[12.5px] text-wine font-semibold hover:underline disabled:opacity-50" disabled={busy} title="Generates 100 records of synthetic metadata. No documents." onClick={() => { const id = addSyntheticBatch(100); onClose(); nav(`/coding-agent/${id}`) }}>Load 100-record synthetic test batch</button>
          <div className="flex gap-2"><Btn kind="secondary" onClick={onClose} disabled={busy}>Cancel</Btn><Btn onClick={start} disabled={!file} busy={busy}>Process ZIP</Btn></div>
        </div>
      </div>}
    </Modal>
  )
}
export const BatchHeaderIcon = Layers
export const stateNow = getState
