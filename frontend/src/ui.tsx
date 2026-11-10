import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsUpDown, Loader2, Search, X } from 'lucide-react'
import { api, qs } from './api'

export const AuthCtx = createContext<any>(null)
export const useAuth = () => useContext(AuthCtx)
export const ToastCtx = createContext<(m: string) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="shrink-0" role="img" aria-label="ZEBL">
      <defs>
        <linearGradient id="zb" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse"><stop stopColor="#48C4D0" /><stop offset="1" stopColor="#20A6B5" /></linearGradient>
        <linearGradient id="zd" x1="28" y1="12" x2="12" y2="28" gradientUnits="userSpaceOnUse"><stop stopColor="#FFFFFF" /><stop offset="1" stopColor="#BCEEF1" /></linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#zb)" />
      <path d="M28 12.5 12.5 27.5" fill="none" stroke="url(#zd)" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M11.5 12.5H28M12.5 27.5h9.8" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
      <circle cx="28.3" cy="27.5" r="2.5" fill="#FFFFFF" />
    </svg>
  )
}

export const Card = ({ className = '', children }: any) => <div className={`surface rounded-2xl shadow-card pagein ${className}`}>{children}</div>

export function Btn({ kind = 'primary', busy, className = '', children, ...p }: any) {
  const k: any = {
    primary: 'text-white bg-gradient-to-br from-[#20A6B5] to-[#48C4D0] shadow-[0_10px_22px_-10px_rgba(32,166,181,.7),inset_0_1px_0_rgba(255,255,255,.4)] hover:-translate-y-px hover:shadow-[0_16px_28px_-10px_rgba(32,166,181,.8)] active:translate-y-0 active:scale-[.98] disabled:from-[#B4D9DE] disabled:to-[#B4D9DE] disabled:shadow-none',
    secondary: 'bg-white/70 border border-sky/25 hover:border-sky hover:bg-white active:scale-[.98] disabled:opacity-50',
    ghost: 'text-wine hover:bg-wine-soft disabled:opacity-50',
    danger: 'bg-white border border-[#F2C4C4] text-bad hover:bg-bad-soft disabled:opacity-50',
  }
  return (
    <button type="button" {...p} disabled={p.disabled || busy} className={`inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-[12px] font-semibold text-[13.5px] whitespace-nowrap transition duration-200 disabled:cursor-not-allowed ${k[kind]} ${className}`}>
      {busy && <Loader2 size={15} className="animate-spin" />}{children}
    </button>
  )
}

const TONES: any = {
  approved: 'ok', resolved: 'ok', applied: 'ok', closed: 'ok', complete: 'ok', accepted: 'ok', active: 'ok',
  in_progress: 'wine', assigned: 'wine', in_review: 'wine', open: 'wine', pending: 'wine',
  pending_qa: 'amber', on_hold: 'amber', high: 'amber', appealed: 'amber', incomplete: 'amber', warning: 'amber',
  uploaded: 'wine', queued: 'wine', processing: 'wine', extracted: 'ok', reviewed: 'ok', needs_attention: 'amber', failed: 'bad', rejected: 'bad', escalated: 'bad', urgent: 'bad', error: 'bad', dismissed: 'neutral', inactive: 'neutral',
}
const TONE_CLS: any = { ok: 'bg-ok-soft text-ok', wine: 'bg-wine-soft text-wine', amber: 'bg-amber-soft text-amber-text', bad: 'bg-bad-soft text-bad', neutral: 'bg-sky-light/60 text-muted' }
export const label = (s: string) => (s || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()).replace(/\bQa\b|\bqa\b/g, 'QA')
export const Pill = ({ value, tone }: any) => (
  <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap ${TONE_CLS[tone || TONES[value] || 'neutral']}`}>{label(value)}</span>
)

export const PageHead = ({ title, sub, children }: any) => (
  <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
    <div><h1 className="text-[26px] font-semibold tracking-tight text-aubergine leading-tight">{title}</h1>{sub && <p className="text-muted mt-0.5">{sub}</p>}</div>
    <div className="flex flex-wrap gap-2 items-center">{children}</div>
  </div>
)

export function Kpi({ title, value, hint, onClick }: any) {
  const Tag: any = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={`text-left surface rounded-2xl p-4 shadow-card pagein ${onClick ? 'lift cursor-pointer' : ''}`}>
      <div className="text-[12.5px] text-muted">{title}</div>
      <div className="text-[28px] font-semibold tnum tracking-tight text-aubergine leading-tight mt-0.5">{value ?? 'No data'}</div>
      {hint && <div className="text-[12px] text-muted">{hint}</div>}
    </Tag>
  )
}

export function Modal({ title, onClose, children, wide }: any) {
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [onClose])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-aubergine/35 backdrop-blur-sm p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`surface rounded-[24px] shadow-float w-full ${wide ? 'max-w-[600px]' : 'max-w-md'} p-5 rise max-h-[90vh] overflow-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3"><h2 className="font-semibold text-lg">{title}</h2><button aria-label="Close" onClick={onClose} className="text-muted hover:text-ink"><X size={18} /></button></div>
        {children}
      </div>
    </div>
  )
}

export const Empty = ({ children }: any) => <div className="text-muted text-center py-10">{children}</div>
export const Err = ({ children }: any) => children ? <div role="alert" className="bg-bad-soft text-bad rounded-[10px] px-3 py-2 text-[13.5px]">{children}</div> : null
export const Spinner = () => <div className="grid place-items-center py-16 text-wine"><Loader2 className="animate-spin" /></div>

export function useFetch(path: string | null, deps: any[] = []) {
  const [data, setData] = useState<any>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const reload = useCallback(() => {
    if (!path) return Promise.resolve()
    setLoading(true)
    return api(path).then(d => { setData(d); setError('') }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [path, ...deps])
  useEffect(() => { reload() }, [reload])
  return { data, error, loading, reload, setData }
}

/** Server-driven table: search, sort and paging all run against the API. */
export function DataTable({ url, columns, params = {}, onRow, placeholder = 'Search', toolbar, selected, onSelect, tick = 0, search = true, initialQ = '' }: any) {
  const [q, setQ] = useState(initialQ), [debounced, setD] = useState(initialQ), [sort, setSort] = useState(''), [page, setPage] = useState(1)
  useEffect(() => { const t = setTimeout(() => { setD(q); setPage(1) }, 250); return () => clearTimeout(t) }, [q])
  useEffect(() => setPage(1), [JSON.stringify(params)])
  const { data, error, loading } = useFetch(url + qs({ ...params, q: debounced, sort, page }), [tick])
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1
  const toggle = (k: string) => setSort(s => s === k ? '-' + k : k)
  const ids = data?.items.map((r: any) => r.id) || []
  return (
    <Card>
      <div className="flex flex-wrap gap-2 p-3 border-b border-line items-center">
        {search && <div className="relative flex-1 min-w-[200px]"><Search size={16} className="absolute left-3 top-3 text-muted" /><input aria-label={placeholder} value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} className="field pl-9" /></div>}
        {toolbar}
      </div>
      {error && <div className="p-3"><Err>{error}</Err></div>}
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px] tnum">
          <thead><tr className="text-left text-muted text-[12px] border-b border-line bg-white/40">
            {onSelect && <th className="px-3 py-2.5 w-8"><input aria-label="Select all" type="checkbox" checked={ids.length > 0 && ids.every((i: any) => selected.includes(i))} onChange={e => onSelect(e.target.checked ? ids : [])} /></th>}
            {columns.map((c: any) => <th key={c.key} className="px-3 py-2.5 font-semibold whitespace-nowrap">{c.sort ? <button className="inline-flex gap-1 items-center hover:text-ink" onClick={() => toggle(c.sort)}>{c.label}<ChevronsUpDown size={13} /></button> : c.label}</th>)}
          </tr></thead>
          <tbody>
            {data?.items.map((r: any) => (
              <tr key={r.id} onClick={() => onRow?.(r)} className={`border-b border-[#E4F1F4] last:border-0 ${onRow ? 'cursor-pointer hover:bg-white/70 transition-colors' : ''}`}>
                {onSelect && <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}><input aria-label={`Select ${r.id}`} type="checkbox" checked={selected.includes(r.id)} onChange={e => onSelect(e.target.checked ? [...selected, r.id] : selected.filter((x: any) => x !== r.id))} /></td>}
                {columns.map((c: any) => <td key={c.key} className="px-3 py-2.5 whitespace-nowrap">{c.render ? c.render(r) : r[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {loading && !data && <Spinner />}
        {data && !data.items.length && <Empty>No records match these filters.</Empty>}
      </div>
      <div className="flex items-center justify-between p-3 border-t border-line text-[13px] text-muted">
        <span className="tnum">{data ? `${data.total} total` : ''}</span>
        <div className="flex items-center gap-2">
          <Btn kind="secondary" aria-label="Previous page" className="!h-8 !px-2" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16} /></Btn>
          <span className="tnum">Page {page} of {pages}</span>
          <Btn kind="secondary" aria-label="Next page" className="!h-8 !px-2" disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight size={16} /></Btn>
        </div>
      </div>
    </Card>
  )
}

export const Select = ({ value, onChange, options, label: l, className = '' }: any) => (
  <select aria-label={l} value={value} onChange={e => onChange(e.target.value)} className={`field !w-auto pr-8 ${className}`}>
    {options.map((o: any) => Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{label(o)}</option>)}
  </select>
)
export const fmtDate = (s: string) => s ? new Date(s.length === 10 ? s + 'T12:00:00' : s + 'Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''
export const fmtTime = (s: string) => s ? new Date(s + 'Z').toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
