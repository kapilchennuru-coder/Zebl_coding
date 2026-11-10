import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { api } from './api'
import { Btn, DataTable, Err, PageHead, Pill, fmtDate, fmtTime, label, useAuth, useFetch, useToast } from './ui'

const VIEWS: Record<string, [string, string]> = {
  all: ['Uploaded documents', 'Every document attached to the encounters you can open.'],
  queue: ['Processing queue', 'Documents waiting for, or in the middle of, text extraction.'],
  extracted: ['Extraction results', 'Documents whose text was read, with a preview of what was extracted.'],
  failed: ['Failed documents', 'Documents that could not be read, or that need a text version because OCR is not connected.'],
  history: ['Document history', 'Every upload, processing step, replacement, review and deletion, including removed documents.'],
}
const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`)
const clip = (t: string, w = 320) => <span className="block truncate" style={{ maxWidth: w }} title={t}>{t || 'None'}</span>

export function DocumentsPage() {
  const { view: v = 'all' } = useParams(), view = VIEWS[v] ? v : 'all', nav = useNavigate(), { can } = useAuth(), toast = useToast()
  const [tick, setTick] = useState(0), [err, setErr] = useState('')
  const counts = useFetch('/documents?view=all&size=1', [tick, view]).data?.counts
  const go = (r: any) => nav(`${can('qa.review') && r.encounter_status === 'pending_qa' ? '/qa' : '/workspace'}/${r.encounter_id}?doc=${r.document_id || r.id}`)
  const retry = async (r: any) => {
    setErr('')
    try { await api(`/documents/${r.id}/reprocess`, { method: 'POST' }); toast('Retry queued'); setTick(t => t + 1) } catch (e: any) { setErr(e.message) }
  }
  const doc = { key: 'title', label: 'Document', render: (r: any) => <div><div className="font-medium">{r.title}</div><div className="text-[12px] text-muted">{r.filename || 'Seed note'}</div></div> }
  const enc = { key: 'encounter', label: 'Encounter', render: (r: any) => <span className="font-mono">{r.encounter}</span> }
  const cols: any = {
    all: [doc, enc, { key: 'patient', label: 'Patient' }, { key: 'type', label: 'Type', render: (r: any) => label(r.type) }, { key: 'status', label: 'Status', render: (r: any) => <Pill value={r.status} /> },
      { key: 'pages', label: 'Pages' }, { key: 'size', label: 'Size', render: (r: any) => kb(r.size) }, { key: 'version', label: 'Version', render: (r: any) => `v${r.version}` }, { key: 'uploaded_by', label: 'Uploaded by' }, { key: 'created_at', label: 'Date', render: (r: any) => fmtDate(r.created_at) }],
    queue: [doc, enc, { key: 'status', label: 'Status', render: (r: any) => <Pill value={r.status} /> }, { key: 'size', label: 'Size', render: (r: any) => kb(r.size) }, { key: 'uploaded_by', label: 'Uploaded by' }, { key: 'created_at', label: 'Date', render: (r: any) => fmtDate(r.created_at) }],
    extracted: [doc, enc, { key: 'status', label: 'Status', render: (r: any) => <Pill value={r.status} /> }, { key: 'method', label: 'Read as', render: (r: any) => label(r.method || 'seed note') },
      { key: 'characters', label: 'Characters' }, { key: 'pages', label: 'Pages' }, { key: 'preview', label: 'Extracted text', render: (r: any) => clip(r.preview, 360) }],
    failed: [doc, enc, { key: 'status', label: 'Status', render: (r: any) => <Pill value={r.status} /> }, { key: 'status_detail', label: 'Reason', render: (r: any) => clip(r.status_detail, 380) }, { key: 'uploaded_by', label: 'Uploaded by' },
      { key: 'act', label: '', render: (r: any) => can('documents.reprocess') && r.source === 'upload' && !['pending_qa', 'approved'].includes(r.encounter_status) && <Btn kind="secondary" className="!h-7" onClick={(e: any) => { e.stopPropagation(); retry(r) }}><RefreshCw size={13} />Retry</Btn> }],
    history: [{ key: 'at', label: 'When', render: (r: any) => fmtTime(r.at) }, { key: 'document', label: 'Document' }, enc, { key: 'event', label: 'Event', render: (r: any) => <Pill value={r.event} tone={r.event === 'failed' ? 'bad' : r.event === 'needs_attention' ? 'amber' : r.event === 'deleted' ? 'neutral' : 'wine'} /> },
      { key: 'user', label: 'By' }, { key: 'detail', label: 'Detail', render: (r: any) => clip(r.detail, 360) }],
  }
  const [title, sub] = VIEWS[view]
  return (
    <>
      <PageHead title={title} sub={sub} />
      <div className="flex flex-wrap gap-2 mb-3">{Object.keys(VIEWS).map(k => <Link key={k} to={`/documents/${k}`} aria-current={k === view} className={`px-3 h-9 inline-flex items-center gap-1.5 rounded-full border text-[13px] font-medium ${k === view ? 'bg-plum text-white border-plum' : 'bg-white border-line hover:border-sky'}`}>{VIEWS[k][0]}{counts && k !== 'history' && <span className="tnum opacity-70">{counts[k]}</span>}</Link>)}</div>
      <Err>{err}</Err>
      {view === 'history'
        ? <DataTable key="history" url="/documents-events" search={false} tick={tick} onRow={(r: any) => go({ ...r, document_id: r.document_id })} columns={cols.history} />
        : <DataTable key={view} url="/documents" params={{ view }} tick={tick} placeholder="Search by document or encounter" onRow={go} columns={cols[view]} />}
    </>
  )
}
