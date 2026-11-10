import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, BookOpen, Bot, CheckSquare, ClipboardCheck, FileText, FolderOpen, Gavel, LayoutDashboard, ListTodo, LogOut, Menu, PanelLeftClose, Receipt, Scale, ScrollText, Search, Send, Settings, Sparkles, Stethoscope, Trash2, Upload, Users, UsersRound, X, BarChart3, FilePlus2, Hourglass, FileSearch, FileWarning, History, ScanText, Pill as PillIcon } from 'lucide-react'
import { api } from './api'
import { Logo, fmtTime, useAuth } from './ui'

const NAV = [
  ['Overview', [['/', 'Dashboard', LayoutDashboard, 'dashboard.view'], ['/tasks', 'Your tasks', CheckSquare, null]]],
  ['Coding', [['/casecraft', 'CaseCraft', FilePlus2, 'casecraft.use'], ['/coding-agent', 'Coding Agent', ScanText, 'queues.view'], ['/qa', 'QA review', ClipboardCheck, 'qa.review']]],
  ['Records', [['/patients', 'Patients', UsersRound, 'patients.view'], ['/encounters', 'Encounters', Stethoscope, 'encounters.view']]],
  ['Code reference', [['/codes/ICD10', 'ICD-10-CM', BookOpen, 'codes.view'], ['/codes/CPT', 'CPT', ScrollText, 'codes.view'], ['/codes/HCPCS', 'HCPCS', PillIcon, 'codes.view']]],
  ['Revenue', [['/ar', 'AR follow-up', Receipt, 'ar.view'], ['/policies', 'Policy review', Scale, 'policy.view']]],
  ['Documents', [['/documents/all', 'Uploaded documents', FolderOpen, 'documents.view'], ['/documents/queue', 'Processing queue', Hourglass, 'documents.view'], ['/documents/extracted', 'Extraction results', FileSearch, 'documents.view'], ['/documents/failed', 'Failed documents', FileWarning, 'documents.view'], ['/documents/history', 'Document history', History, 'documents.view']]],
  ['Reference files', [['/upload', 'Upload reference file', Upload, 'uploads.manage'], ['/uploads', 'Reference files', FolderOpen, 'uploads.view']]],
  ['Insights', [['/insights', 'AI insights', Sparkles, 'analytics.view'], ['/reports', 'Reports', BarChart3, 'reports.view']]],
  ['Administration', [['/users', 'Users and roles', Users, ['users.manage_org', 'users.manage_all']], ['/audit', 'Audit log', Gavel, 'audit.view'], ['/settings', 'Settings', Settings, null]]],
] as any[]

function Assistant() {
  const [open, setOpen] = useState(false), [msgs, setMsgs] = useState<any[]>([]), [text, setText] = useState(''), [busy, setBusy] = useState(false)
  const loc = useLocation(), m = loc.pathname.match(/^\/(?:workspace|encounters|qa)\/(\d+)/), encounterId = m ? +m[1] : null
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView() }, [msgs, busy])
  const send = async (e: any) => {
    e.preventDefault(); const t = text.trim(); if (!t) return
    setText(''); setMsgs(x => [...x, { me: true, text: t }]); setBusy(true)
    try { const r = await api('/assistant', { body: { message: t, encounter_id: encounterId } }); setMsgs(x => [...x, { text: r.reply, sources: r.sources }]) }
    catch (err: any) { setMsgs(x => [...x, { text: err.message, error: true }]) } finally { setBusy(false) }
  }
  if (/^\/(workspace|qa)\/\d+|^\/coding-agent\/[^/]+\/case/.test(loc.pathname)) return null // the workspace has its own Chat tab
  if (!open) return <button aria-label="Open assistant" onClick={() => setOpen(true)} className="fixed right-5 bottom-5 z-40 w-14 h-14 rounded-full grid place-items-center text-white bg-gradient-to-br from-[#20A6B5] to-[#48C4D0] shadow-float hover:scale-105 hover:-translate-y-0.5 transition"><Bot /></button>
  return (
    <aside className="fixed right-0 top-0 bottom-0 z-40 w-full sm:w-[400px] surface !rounded-none shadow-float flex flex-col rise" aria-label="Assistant">
      <header className="p-4 border-b border-line flex items-start justify-between">
        <div><div className="font-semibold flex gap-2 items-center"><Bot size={18} className="text-wine" />Coding assistant</div><div className="text-[12px] text-muted">{encounterId ? `Using encounter #${encounterId}` : 'No encounter open'} · Mock mode, rules only</div></div>
        <div className="flex gap-1"><button aria-label="Clear conversation" onClick={() => setMsgs([])} className="p-1.5 text-muted hover:text-ink"><Trash2 size={17} /></button><button aria-label="Close assistant" onClick={() => setOpen(false)} className="p-1.5 text-muted hover:text-ink"><X size={18} /></button></div>
      </header>
      <div className="flex-1 overflow-auto p-4 grid gap-3 content-start">
        {!msgs.length && <p className="text-muted text-[13.5px]">Ask me to explain a code such as E11.65. In an encounter, ask for a summary, documentation gaps or validation results.</p>}
        {msgs.map((m, i) => <div key={i} className={`max-w-[88%] rounded-xl px-3 py-2 text-[13.5px] ${m.me ? 'justify-self-end bg-plum text-white' : m.error ? 'bg-bad-soft text-bad' : 'bg-white/80'}`}>{m.text}{m.sources?.length > 0 && <div className="text-[11.5px] text-muted mt-1">Sources: {m.sources.join(', ')}</div>}</div>)}
        {busy && <div className="text-muted text-[13px]">Looking that up…</div>}<div ref={end} />
      </div>
      <form onSubmit={send} className="p-3 border-t border-line flex gap-2"><input aria-label="Message" className="field" value={text} onChange={e => setText(e.target.value)} placeholder="Ask about this chart or a code" /><button aria-label="Send" className="w-10 h-10 shrink-0 rounded-[10px] grid place-items-center bg-wine text-white"><Send size={16} /></button></form>
    </aside>
  )
}

function Notifications() {
  const nav = useNavigate(), [open, setOpen] = useState(false), [d, setD] = useState<any>({ unread: 0, items: [] }), loc = useLocation()
  const load = () => api('/notifications').then(setD).catch(() => {})
  useEffect(() => { load() }, [loc.pathname])
  const toggle = async () => { setOpen(!open); if (!open && d.unread) { await api('/notifications/read', { method: 'POST' }); setD((x: any) => ({ ...x, unread: 0 })) } }
  return <div className="relative">
    <button aria-label={`Notifications, ${d.unread} unread`} onClick={toggle} className="relative p-2 rounded-lg hover:bg-white/70"><Bell size={19} />{d.unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-bad text-white text-[10.5px] font-bold grid place-items-center tnum">{d.unread}</span>}</button>
    {open && <div className="absolute right-0 mt-2 w-[340px] max-w-[85vw] bg-white rounded-2xl shadow-float z-30 max-h-[60vh] overflow-auto rise">
      <div className="p-3 font-semibold border-b border-line">Notifications</div>
      {!d.items.length && <div className="p-6 text-muted text-center">You have no notifications.</div>}
      {d.items.map((n: any) => <button key={n.id} onClick={() => { setOpen(false); n.link && nav(n.link) }} className="w-full text-left px-3 py-2.5 border-b border-[#E4F1F4] hover:bg-white/70"><div className="text-[13.5px]">{n.title}</div><div className="text-[11.5px] text-muted">{fmtTime(n.at)}</div></button>)}
    </div>}
  </div>
}

export default function Shell() {
  const { user, setUser, can } = useAuth(), nav = useNavigate(), loc = useLocation()
  const [collapsed, setCollapsed] = useState(false), [mobile, setMobile] = useState(false), [q, setQ] = useState('')
  useEffect(() => setMobile(false), [loc.pathname])
  const logout = async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); nav('/login') }
  const allowed = (p: any) => !p || (Array.isArray(p) ? p.some(can) : can(p))
  const wide = /^\/(workspace|qa\/\d+|coding-agent\/[^/]+\/case)/.test(loc.pathname)
  return (
    <div className="min-h-screen flex">
      {mobile && <div className="fixed inset-0 bg-aubergine/50 z-30 lg:hidden" onClick={() => setMobile(false)} />}
      <aside className={`fixed lg:sticky top-0 h-screen z-30 shrink-0 surface !rounded-none border-y-0 border-l-0 border-r border-white/80 text-ink flex flex-col transition-all ${collapsed ? 'lg:w-[68px]' : 'lg:w-[236px]'} w-[236px] ${mobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="h-16 flex items-center gap-2.5 px-4 shrink-0"><Logo size={34} />{!collapsed && <div><div className="font-bold tracking-[.14em] text-aubergine leading-tight">ZEBL</div><div className="text-[10.5px] tracking-wider text-muted uppercase">Coding Agent</div></div>}</div>
        <nav className="flex-1 overflow-auto px-2.5 pb-3" aria-label="Main">
          {NAV.map(([sec, items]) => { const vis = items.filter((i: any) => allowed(i[3])); return vis.length > 0 && <div key={sec} className="mt-3">
            {!collapsed && <div className="px-2.5 text-[11px] text-muted mb-1">{sec}</div>}
            {vis.map(([to, name, I]: any) => <NavLink key={to} to={to} end={to === '/'} title={name} className={({ isActive }) => `flex items-center gap-2.5 h-9 px-2.5 rounded-xl text-[13.5px] transition duration-200 ${isActive ? 'bg-gradient-to-r from-white to-white/40 text-wine-dark font-semibold shadow-[0_8px_18px_-10px_rgba(32,166,181,.6),inset_0_0_0_1px_rgba(255,255,255,.9)]' : 'hover:bg-white/60 hover:translate-x-0.5'}`}><I size={17} className="shrink-0" />{!collapsed && name}</NavLink>)}
          </div> })}
        </nav>
        <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:flex h-11 items-center gap-2 px-5 border-t border-line text-[13px] text-muted hover:text-aubergine"><PanelLeftClose size={16} className={collapsed ? 'rotate-180' : ''} />{!collapsed && 'Collapse'}</button>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 h-16 bg-white/55 backdrop-blur-xl border-b border-white/80 flex items-center gap-3 px-4">
          <button aria-label="Open menu" className="lg:hidden p-1.5" onClick={() => setMobile(true)}><Menu /></button>
          <form className="relative flex-1 max-w-md" onSubmit={e => { e.preventDefault(); nav(`/encounters?q=${encodeURIComponent(q)}`) }}><Search size={16} className="absolute left-3 top-3 text-muted" /><input aria-label="Search encounters" className="field pl-9" placeholder="Search encounters, FIN or patient" value={q} onChange={e => setQ(e.target.value)} /></form>
          <span className="hidden md:inline text-[12px] font-medium text-amber-text bg-amber-soft/90 rounded-full px-2.5 py-1 whitespace-nowrap ml-auto">Synthetic data · AI mock mode</span>
          <div className="flex items-center gap-1 ml-auto md:ml-0"><Notifications />
            <div className="hidden sm:block text-right leading-tight mx-1"><div className="text-[13px] font-semibold">{user.full_name}</div><div className="text-[11.5px] text-muted">{user.roles[0]} · {user.org_name}</div></div>
            <button aria-label="Sign out" title="Sign out" onClick={logout} className="p-2 rounded-lg hover:bg-white/70"><LogOut size={18} /></button></div>
        </header>
        <main key={loc.pathname} className={`pagein ${wide ? 'flex-1 min-h-0' : 'p-4 sm:p-6 max-w-[1400px] w-full mx-auto'}`}><Outlet /></main>
      </div>
      <Assistant />
    </div>
  )
}
