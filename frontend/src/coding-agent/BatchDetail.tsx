import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Download, Search, TriangleAlert } from 'lucide-react'
import { useStore, patchCases, tally } from './store'
import { CaseRec, NA, STATUSES, Status, Priority } from './types'
import { BatchStatistics, NotAvail, StatusBadge, fmtWhen } from './parts'
import { Btn, Empty, useAuth } from '../ui'

export const CODERS = ['Reese Holloway', 'Emery Vance', 'Sage Whitlock']
const PRIORITY_CLS: Record<Priority, string> = { Routine: 'bg-sky-light/60 text-muted', High: 'bg-amber-soft text-amber-text', Urgent: 'bg-bad-soft text-bad' }
const codes = (c: CaseRec, sys: string) => c.codes.filter(x => x.system === sys && x.rec !== 'Rejected').map(x => x.code).join(', ')

interface Col { key: string; label: string; get: (c: CaseRec) => string; render?: (c: CaseRec) => any; sort?: boolean; on: boolean }
const COLS: Col[] = [
  { key: 'enc', label: 'Encounter ID', get: c => c.encounterId, render: c => <span className="font-mono text-[12.5px]" title={c.encounterExtracted ? '' : 'Taken from the file name'}>{c.encounterId}</span>, sort: true, on: true },
  { key: 'name', label: 'Patient Name', get: c => c.patientName || '', render: c => c.patientName || <NotAvail />, sort: true, on: true },
  { key: 'fin', label: 'FIN', get: c => c.fin || '', render: c => c.fin || <NotAvail />, sort: true, on: true },
  { key: 'mrn', label: 'MRN', get: c => c.mrn || '', render: c => c.mrn || <NotAvail />, sort: true, on: true },
  { key: 'dos', label: 'Date of Service', get: c => c.dosIso || '', render: c => c.dos || <NotAvail />, sort: true, on: true },
  { key: 'prov', label: 'Rendering Provider', get: c => c.provider || '', render: c => c.provider || <NotAvail />, sort: true, on: true },
  { key: 'dx', label: 'Diagnosis Codes', get: c => codes(c, 'ICD-10-CM'), render: c => <span className="font-mono text-[12.5px] whitespace-normal block min-w-[120px] max-w-[220px]">{codes(c, 'ICD-10-CM') || '—'}</span>, sort: true, on: true },
  { key: 'cpt', label: 'CPT Codes', get: c => codes(c, 'CPT'), render: c => <span className="font-mono text-[12.5px]">{codes(c, 'CPT') || '—'}</span>, sort: true, on: true },
  { key: 'status', label: 'Coding Status', get: c => c.status, render: c => <StatusBadge s={c.status} />, sort: true, on: true },
  { key: 'coder', label: 'Assigned Coder', get: c => c.coder || '', render: c => c.coder || <span className="text-muted">Unassigned</span>, sort: true, on: true },
  { key: 'prio', label: 'Priority', get: c => ({ Urgent: '0', High: '1', Routine: '2' }[c.priority]), render: c => <span className={`inline-flex h-6 px-2.5 items-center rounded-full text-[12px] font-semibold ${PRIORITY_CLS[c.priority]}`}>{c.priority}</span>, sort: true, on: true },
  { key: 'doc', label: 'Document', get: c => c.fileName, render: c => <span className="text-[12px] text-muted block max-w-[180px] truncate" title={c.fileName}>{c.fileName}</span>, on: false },
]
const csvCell = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v

export default function BatchDetail() {
  const { batchId } = useParams(), nav = useNavigate(), { user } = useAuth()
  const { batches, cases } = useStore(), batch = batches.find(b => b.id === batchId)
  const [status, setStatus] = useState<'All' | Status>('All'), [q, setQ] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null), [page, setPage] = useState(1), [size, setSize] = useState(25)
  const [sel, setSel] = useState<string[]>([]), [cols, setCols] = useState(() => Object.fromEntries(COLS.map(c => [c.key, c.on]))), [menu, setMenu] = useState(false)
  useEffect(() => setPage(1), [status, q, from, to, size])

  const all = useMemo(() => (batch?.caseIds || []).map(i => cases[i]).filter(Boolean), [batch, cases])
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    let r = all.filter(c => (status === 'All' || c.status === status) && (!from || (c.dosIso || '') >= from) && (!to || (c.dosIso && c.dosIso <= to)) &&
      (!s || [c.encounterId, c.patientName, c.fin, c.mrn, c.account, c.claimId, c.dos, c.provider, c.coder, c.fileName, codes(c, 'ICD-10-CM'), codes(c, 'CPT'), codes(c, 'HCPCS')].some(v => String(v ?? '').toLowerCase().includes(s))))
    if (sort) { const col = COLS.find(c => c.key === sort.k)!; r = [...r].sort((a, b) => col.get(a).localeCompare(col.get(b), undefined, { numeric: true }) * sort.dir) }
    return r
  }, [all, status, q, from, to, sort])
  if (!batch) return <Empty>Batch not found. Uploaded files are kept in memory only, so a page reload clears them. <Link className="text-wine font-semibold" to="/coding-agent">Back to Coding Cases</Link></Empty>

  const t = tally(batch, cases), pages = Math.max(1, Math.ceil(rows.length / size)), cur = Math.min(page, pages), view = rows.slice((cur - 1) * size, cur * size)
  const shown = COLS.filter(c => cols[c.key]), pageIds = view.map(r => r.id), allPage = pageIds.length > 0 && pageIds.every(i => sel.includes(i))
  const toggleSort = (k: string) => setSort(s => (s?.k !== k ? { k, dir: 1 } : s.dir === 1 ? { k, dir: -1 } : null))
  const exportCsv = () => {
    const out = [shown.map(c => csvCell(c.label)).join(','), ...rows.map(r => shown.map(c => csvCell(c.get(r) || (c.key === 'dos' ? r.dos || NA : ''))).join(','))].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out], { type: 'text/csv' })); a.download = `${batch.id}-cases.csv`; a.click(); URL.revokeObjectURL(a.href)
  }
  const bulk = (patch: Partial<CaseRec>) => { patchCases(sel, patch); setSel([]) }
  const coders = [user?.full_name, ...CODERS].filter(Boolean) as string[]
  const chips: ('All' | Status)[] = ['All', ...STATUSES.filter(s => s !== 'Completed'), 'Completed']

  return <>
    <nav aria-label="Breadcrumb" className="text-[13px] text-muted flex items-center gap-1.5 mb-3 flex-wrap">
      <Link to="/coding-agent" className="hover:text-wine">Coding Agent</Link><ChevronRight size={13} /><Link to="/coding-agent" className="hover:text-wine">Coding Cases</Link><ChevronRight size={13} /><span className="text-ink font-semibold tnum">{batch.id}</span>
    </nav>

    <section className="surface rounded-2xl shadow-card p-5 mb-4 flex flex-wrap items-center justify-between gap-4 pagein">
      <div className="grid gap-1 min-w-0">
        <h1 className="text-[24px] font-semibold tracking-tight text-aubergine tnum">{batch.id}</h1>
        <div className="text-[13px] text-muted">Source: <span className="text-ink">{batch.source}</span> · Uploaded {fmtWhen(batch.uploadedAt)}</div>
        <div className="text-[13px] text-muted flex flex-wrap gap-x-4">Total documents: <b className="text-ink">{t.total}</b><span>Job Id: <span className="text-ink tnum break-all">{batch.jobId}</span></span>
          <span>Status: <b className="text-ink">{t.validation}</b></span></div>
        {batch.skipped.length > 0 && <div className="text-[12.5px] text-amber-text inline-flex items-center gap-1.5 mt-1"><TriangleAlert size={14} />{batch.skipped.length} file{batch.skipped.length === 1 ? '' : 's'} were skipped: {batch.skipped.slice(0, 2).map(s => `${s.name} (${s.reason})`).join('; ')}{batch.skipped.length > 2 ? '…' : ''}</div>}
      </div>
      <BatchStatistics batch={batch} cases={cases} />
    </section>

    <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-2 mb-4">
      {chips.map(s => { const n = s === 'All' ? t.total : t.by[s] || 0; const on = status === s
        return <button key={s} role="tab" aria-selected={on} onClick={() => setStatus(s)} className={`h-9 px-3.5 rounded-full text-[13px] font-semibold border transition active:scale-95 ${on ? 'bg-gradient-to-br from-sky to-sky-cyan text-white border-transparent shadow-[0_8px_18px_-8px_rgba(32,166,181,.8)]' : 'bg-white/70 border-white/90 hover:border-sky/50 text-ink'}`}>{s} <span className={`tnum ${on ? 'text-white/85' : 'text-muted'}`}>{n}</span></button> })}
    </div>

    <section className="surface rounded-2xl shadow-card overflow-hidden pagein" aria-label="Patient cases">
      <div className="flex flex-wrap gap-2 p-3 border-b border-line items-center">
        <div className="relative flex-1 min-w-[200px]"><Search size={16} className="absolute left-3 top-3 text-muted" /><input aria-label="Search cases" className="field pl-9" placeholder="Search patient, FIN, MRN, encounter, code…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <label className="text-[12.5px] text-muted flex items-center gap-1.5">DOS from<input type="date" aria-label="Date of service from" className="field !w-[140px]" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label className="text-[12.5px] text-muted flex items-center gap-1.5">to<input type="date" aria-label="Date of service to" className="field !w-[140px]" value={to} onChange={e => setTo(e.target.value)} /></label>
        <div className="relative"><Btn kind="secondary" onClick={() => setMenu(!menu)} aria-expanded={menu}><Columns3 size={15} />Columns</Btn>
          {menu && <div className="absolute right-0 mt-1.5 z-20 surface rounded-xl shadow-float p-2 w-52 pagein">{COLS.map(c => <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/70 cursor-pointer text-[13px]"><input type="checkbox" className="accent-wine" checked={cols[c.key]} onChange={e => setCols({ ...cols, [c.key]: e.target.checked })} />{c.label}</label>)}</div>}</div>
        <Btn kind="secondary" onClick={exportCsv}><Download size={15} />Export CSV</Btn>
      </div>
      {sel.length > 0 && <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-sky-light/50 border-b border-line text-[13px]">
        <b>{sel.length} selected</b>
        {sel.length < rows.length && <button className="text-wine font-semibold hover:underline" onClick={() => setSel(rows.map(r => r.id))}>Select all {rows.length} matching</button>}
        <span className="mx-1 text-muted">·</span>
        <select aria-label="Set status" className="field !w-auto !h-8 !text-[13px]" value="" onChange={e => e.target.value && bulk({ status: e.target.value as Status })}><option value="">Set status…</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
        <select aria-label="Assign coder" className="field !w-auto !h-8 !text-[13px]" value="" onChange={e => e.target.value && bulk({ coder: e.target.value, status: 'Assigned' })}><option value="">Assign coder…</option>{coders.map(s => <option key={s}>{s}</option>)}</select>
        <select aria-label="Set priority" className="field !w-auto !h-8 !text-[13px]" value="" onChange={e => e.target.value && bulk({ priority: e.target.value as Priority })}><option value="">Set priority…</option>{['Routine', 'High', 'Urgent'].map(s => <option key={s}>{s}</option>)}</select>
        <button className="ml-auto text-muted hover:text-ink" onClick={() => setSel([])}>Clear</button></div>}
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px] tnum">
          <thead><tr className="text-left text-muted text-[12px] border-b border-line bg-white/40">
            <th className="px-3 py-2.5 w-8"><input aria-label="Select all on this page" type="checkbox" className="accent-wine" checked={allPage} onChange={e => setSel(e.target.checked ? [...new Set([...sel, ...pageIds])] : sel.filter(i => !pageIds.includes(i)))} /></th>
            {shown.map(c => <th key={c.key} className="px-3 py-2.5 font-semibold whitespace-nowrap" aria-sort={sort?.k === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
              {c.sort ? <button className="inline-flex gap-1 items-center hover:text-ink" onClick={() => toggleSort(c.key)}>{c.label}<ArrowUpDown size={12} className={sort?.k === c.key ? 'text-wine' : ''} /></button> : c.label}</th>)}
            <th className="px-3 py-2.5 font-semibold">Actions</th></tr></thead>
          <tbody>{view.map(r => (
            <tr key={r.id} onClick={() => nav(`/coding-agent/${batch.id}/case/${r.id}`)} className="border-b border-[#E4F1F4] last:border-0 cursor-pointer hover:bg-white/70 transition-colors">
              <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}><input aria-label={`Select ${r.encounterId}`} type="checkbox" className="accent-wine" checked={sel.includes(r.id)} onChange={e => setSel(e.target.checked ? [...sel, r.id] : sel.filter(i => i !== r.id))} /></td>
              {shown.map(c => <td key={c.key} className="px-3 py-2.5 whitespace-nowrap">{c.render ? c.render(r) : c.get(r)}</td>)}
              <td className="px-3 py-2.5"><Link to={`/coding-agent/${batch.id}/case/${r.id}`} onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-wine font-semibold hover:underline">Open<ChevronRight size={14} /></Link></td>
            </tr>))}</tbody>
        </table>
        {!rows.length && <Empty>No cases match these filters.</Empty>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-t border-line text-[13px] text-muted">
        <span className="tnum">{rows.length === all.length ? `${rows.length} cases` : `${rows.length} of ${all.length} cases`}</span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5">Rows<select aria-label="Rows per page" className="field !w-auto !h-8 !text-[13px]" value={size} onChange={e => setSize(+e.target.value)}>{[10, 25, 50, 100].map(n => <option key={n}>{n}</option>)}</select></label>
          <Btn kind="secondary" aria-label="Previous page" className="!h-8 !px-2" disabled={cur <= 1} onClick={() => setPage(cur - 1)}><ChevronLeft size={16} /></Btn>
          <span className="tnum">Page {cur} of {pages}</span>
          <Btn kind="secondary" aria-label="Next page" className="!h-8 !px-2" disabled={cur >= pages} onClick={() => setPage(cur + 1)}><ChevronRight size={16} /></Btn>
        </div>
      </div>
    </section>
  </>
}
