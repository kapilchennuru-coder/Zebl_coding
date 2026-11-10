import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, FileUp, UserPlus } from 'lucide-react'
import { api, qs } from './api'
import { Alerts } from './Workspace'
import { Btn, Card, DataTable, Empty, Err, Kpi, Modal, PageHead, Pill, Select, Spinner, fmtDate, fmtTime, label, useAuth, useFetch, useToast } from './ui'

const STATUSES = ['', 'unassigned', 'assigned', 'in_progress', 'pending_qa', 'rejected', 'escalated', 'on_hold', 'approved']
const statusOpts = STATUSES.map(s => [s, s ? label(s) : 'All statuses'])
const prioOpts = [['', 'All priorities'], ['routine', 'Routine'], ['high', 'High'], ['urgent', 'Urgent']]
const Mono = ({ children }: any) => <span className="font-mono">{children}</span>
const Sla = ({ r }: any) => r.overdue ? <Pill value="overdue" tone="bad" /> : r.due_at ? <span>{fmtDate(r.due_at)}</span> : null
const axis = { fontSize: 11, fill: '#718096' }
const ChartCard = ({ title, children }: any) => <Card className="p-4"><h3 className="font-semibold mb-3">{title}</h3><div className="h-60">{children}</div></Card>

const encCols = [
  { key: 'external_id', label: 'Encounter', sort: 'external_id', render: (r: any) => <Mono>{r.external_id}</Mono> },
  { key: 'patient', label: 'Patient', sort: 'patient' }, { key: 'provider', label: 'Provider' }, { key: 'facility', label: 'Facility' },
  { key: 'date_of_service', label: 'Service date', sort: 'date_of_service', render: (r: any) => fmtDate(r.date_of_service) }, { key: 'encounter_type', label: 'Type' },
  { key: 'doc_status', label: 'Documentation', render: (r: any) => <Pill value={r.doc_status} /> }, { key: 'coding_status', label: 'Coding', sort: 'coding_status', render: (r: any) => <Pill value={r.coding_status} /> },
  { key: 'qa_status', label: 'QA', render: (r: any) => <Pill value={r.qa_status} /> }, { key: 'coder', label: 'Coder', render: (r: any) => r.coder || 'Unassigned' },
  { key: 'priority', label: 'Priority', sort: 'priority', render: (r: any) => <Pill value={r.priority} /> },
]

export function Dashboard() {
  const [days, setDays] = useState('30'), nav = useNavigate(), { data: d, error } = useFetch(`/dashboard?days=${days}`, [days])
  if (error) return <Err>{error}</Err>
  if (!d) return <Spinner />
  const go = (s: string) => () => nav(`/encounters?status=${s}`)
  return <>
    <PageHead title="Dashboard" sub="Figures come from synthetic development records."><Select label="Date range" value={days} onChange={setDays} options={[['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']]} /></PageHead>
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
      <Kpi title="Total encounters" value={d.total} onClick={() => nav('/encounters')} /><Kpi title="Pending coding" value={d.pending} onClick={go('assigned')} /><Kpi title="In progress" value={d.in_progress} onClick={go('in_progress')} /><Kpi title="Pending QA" value={d.pending_qa} onClick={go('pending_qa')} /><Kpi title="Completed" value={d.completed} onClick={go('approved')} />
      <Kpi title="First-review approval" value={d.accuracy != null ? `${d.accuracy}%` : null} /><Kpi title="Average turnaround" value={d.turnaround_hours != null ? `${d.turnaround_hours} h` : null} /><Kpi title="AI acceptance" value={d.ai_acceptance != null ? `${d.ai_acceptance}%` : null} hint="Mock engine" /><Kpi title="Unresolved exceptions" value={d.exceptions} /><Kpi title="Escalated" value={d.escalated} onClick={go('escalated')} />
    </div>
    <div className="grid lg:grid-cols-2 gap-3 mb-3">
      <ChartCard title="Daily submissions">{d.trend.length ? <ResponsiveContainer><LineChart data={d.trend}><CartesianGrid stroke="rgba(32,166,181,.16)" vertical={false} /><XAxis dataKey="day" tick={axis} tickFormatter={(v: string) => v.slice(5)} /><YAxis tick={axis} allowDecimals={false} width={28} /><Tooltip /><Line dataKey="submitted" name="Submitted" stroke="#20A6B5" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer> : <Empty>No submissions in this range.</Empty>}</ChartCard>
      <ChartCard title="Productivity by coder">{d.productivity.length ? <ResponsiveContainer><BarChart data={d.productivity}><CartesianGrid stroke="rgba(32,166,181,.16)" vertical={false} /><XAxis dataKey="coder" tick={axis} /><YAxis tick={axis} allowDecimals={false} width={28} /><Tooltip cursor={{ fill: '#EEF9FB' }} /><Bar dataKey="submitted" name="Submitted" fill="#20A6B5" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer> : <Empty>No coder activity in this range.</Empty>}</ChartCard>
    </div>
    <div className="grid lg:grid-cols-2 gap-3">
      <Card className="p-4"><h3 className="font-semibold mb-2">Work queue summary</h3>{d.queue.map((q: any) => <button key={q.status} onClick={go(q.status)} className="flex w-full justify-between py-1.5 border-b border-[#E4F1F4] last:border-0 hover:text-wine"><Pill value={q.status} /><b className="tnum">{q.count}</b></button>)}</Card>
      <Card className="p-4"><h3 className="font-semibold mb-2">Recent activity</h3>{!d.activity.length && <Empty>No coding activity yet.</Empty>}{d.activity.map((a: any, i: number) => <div key={i} className="flex justify-between gap-3 py-1.5 border-b border-[#E4F1F4] last:border-0 text-[13px]"><span>{a.user} · {label(a.action.replace('coding.', ''))}</span><span className="text-muted whitespace-nowrap">{fmtTime(a.at)}</span></div>)}</Card>
    </div>
  </>
}

export function Patients() {
  const nav = useNavigate(), [status, setStatus] = useState('')
  return <><PageHead title="Patients" sub="Synthetic patient records." />
    <DataTable url="/patients" params={{ status }} placeholder="Search name or MRN" onRow={(r: any) => nav(`/patients/${r.id}`)} toolbar={<Select label="Status" value={status} onChange={setStatus} options={[['', 'All statuses'], ['active', 'Active'], ['inactive', 'Inactive']]} />}
      columns={[{ key: 'id', label: 'ID' }, { key: 'mrn', label: 'MRN', sort: 'mrn', render: (r: any) => <Mono>{r.mrn}</Mono> }, { key: 'last_name', label: 'Last name', sort: 'last_name' }, { key: 'first_name', label: 'First name', sort: 'first_name' }, { key: 'dob', label: 'DOB', sort: 'dob', render: (r: any) => fmtDate(r.dob) }, { key: 'gender', label: 'Gender' }, { key: 'encounters', label: 'Encounters' }, { key: 'latest', label: 'Latest', render: (r: any) => fmtDate(r.latest) }, { key: 'status', label: 'Status', sort: 'status', render: (r: any) => <Pill value={r.status} /> }]} /></>
}

export function PatientDetail() {
  const { id } = useParams(), nav = useNavigate(), { data: p, error } = useFetch(`/patients/${id}`, [id])
  if (error) return <Err>{error}</Err>
  if (!p) return <Spinner />
  return <><PageHead title={`${p.last_name}, ${p.first_name}`} sub={`MRN ${p.mrn} · ${fmtDate(p.dob)} · ${p.gender} · ${p.organization}${p.phone ? ' · ' + p.phone : ''}`} />
    <div className="grid lg:grid-cols-[2fr_1fr] gap-3">
      <Card className="overflow-x-auto"><h3 className="font-semibold p-4 pb-2">Encounter history</h3><table className="w-full text-[13.5px]"><tbody>{p.history.map((e: any) => <tr key={e.id} onClick={() => nav(`/encounters/${e.id}`)} className="border-t border-[#E4F1F4] cursor-pointer hover:bg-[#F7FCFD]"><td className="px-4 py-2 font-mono">{e.external_id}</td><td>{fmtDate(e.date_of_service)}</td><td>{e.encounter_type}</td><td><Pill value={e.coding_status} /></td></tr>)}</tbody></table></Card>
      <div className="grid gap-3 content-start"><Card className="p-4"><h3 className="font-semibold mb-1">Documentation history</h3>{p.documents.map((d: any) => <div key={d.id} className="text-[13px] py-1">{d.title} · <Mono>{d.encounter}</Mono></div>)}</Card>
        <Card className="p-4"><h3 className="font-semibold mb-1">Audit history</h3>{p.audit.map((a: any, i: number) => <div key={i} className="text-[12.5px] py-0.5 text-muted">{a.user} · {a.action} · {fmtTime(a.at)}</div>)}</Card></div>
    </div></>
}

export function Encounters() {
  const nav = useNavigate(), [sp] = useSearchParams(), [status, setStatus] = useState(sp.get('status') || ''), [priority, setPriority] = useState(''), [field, setField] = useState('all')
  useEffect(() => setStatus(sp.get('status') || ''), [sp])
  return <><PageHead title="Encounters" sub="Search across jobs by ID, FIN, patient or service date." />
    <DataTable key={sp.get('q') || ''} initialQ={sp.get('q') || ''} url="/encounters" params={{ status, priority, field }} placeholder="Search encounters" onRow={(r: any) => nav(`/encounters/${r.id}`)} columns={encCols}
      toolbar={<><Select label="Search field" value={field} onChange={setField} options={[['all', 'All fields'], ['job', 'Encounter ID'], ['fin', 'FIN'], ['dos', 'Service date']]} /><Select label="Status" value={status} onChange={setStatus} options={statusOpts} /><Select label="Priority" value={priority} onChange={setPriority} options={prioOpts} /></>} /></>
}

export function EncounterDetail() {
  const { id } = useParams(), nav = useNavigate(), toast = useToast(), { can } = useAuth(), { data: e, error, reload } = useFetch(`/encounters/${id}`, [id]), [err, setErr] = useState('')
  if (error) return <Err>{error}</Err>
  if (!e) return <Spinner />
  const st = async (action: string) => { setErr(''); try { await api(`/encounters/${id}/status`, { body: { action } }); toast(`Encounter ${action === 'hold' ? 'put on hold' : action + 'd'}`); action === 'archive' ? nav('/encounters') : reload() } catch (x: any) { setErr(x.message) } }
  const row = (k: string, v: any) => <><dt className="text-muted">{k}</dt><dd>{v}</dd></>
  return <><PageHead title={e.external_id} sub={`${e.patient} · ${fmtDate(e.date_of_service)}`}>
      {e.coding_status === 'on_hold' ? <Btn kind="secondary" onClick={() => st('resume')}>Resume</Btn> : !['approved', 'pending_qa'].includes(e.coding_status) && (can('cases.assign') || can('coding.perform')) && <><Btn kind="secondary" onClick={() => st('hold')}>Put on hold</Btn><Btn kind="secondary" onClick={() => st('escalate')}>Escalate</Btn></>}
      {can('cases.assign') && <Btn kind="danger" onClick={() => st('archive')}>Archive</Btn>}
      {can('qa.review') && e.coding_status === 'pending_qa' && <Btn onClick={() => nav(`/qa/${id}`)}>Open review</Btn>}
      {can('coding.perform') && <Btn onClick={() => nav(`/workspace/${id}`)}>Open workspace</Btn>}
    </PageHead><Err>{err}</Err>
    <div className="grid lg:grid-cols-[1fr_2fr] gap-3 mt-2"><Card className="p-4"><dl className="grid grid-cols-[110px_1fr] gap-y-1 text-[13.5px]">{row('Patient', <Link className="text-wine font-medium" to={`/patients/${e.patient_id}`}>{e.patient}</Link>)}{row('Provider', e.provider)}{row('Facility', e.facility)}{row('Type', e.encounter_type)}{row('FIN', <Mono>{e.fin}</Mono>)}{row('Coding', <Pill value={e.coding_status} />)}{row('QA', <Pill value={e.qa_status} />)}{row('Coder', e.coder || 'Unassigned')}{row('Auditor', e.auditor || 'None')}{row('Priority', <Pill value={e.priority} />)}{row('Queue', e.queue)}</dl></Card>
      <div className="grid gap-3"><Card className="p-4"><h3 className="font-semibold mb-1">Clinical notes</h3>{e.documents.map((d: any) => <p key={d.id} className="py-1"><b>{d.title}.</b> {d.text}</p>)}</Card>
        <Card className="p-4"><h3 className="font-semibold mb-1">Coding history</h3>{!e.sessions.length && <Empty>No coding has started.</Empty>}{e.sessions.map((s: any) => <div key={s.id} className="py-1 text-[13.5px]"><b>{s.coder}</b> · {label(s.status)} · {[...s.diagnoses, ...s.procedures].map((c: any) => c.code).join(', ') || 'No codes'}</div>)}</Card>
        <Card className="p-4"><h3 className="font-semibold mb-1">Review history</h3>{!e.reviews.length && <Empty>No reviews yet.</Empty>}{e.reviews.map((r: any) => <div key={r.id} className="py-1 text-[13.5px]"><Pill value={r.decision} /> {r.reviewer} {r.reason && `· ${r.reason}`}</div>)}</Card></div></div></>
}

export function Queues() {
  const nav = useNavigate(), toast = useToast(), { can } = useAuth(), { data: s, reload } = useFetch('/queues/summary'), [status, setStatus] = useState(''), [sel, setSel] = useState<number[]>([]), [tick, setTick] = useState(0), [modal, setModal] = useState(false)
  const assignable = can('cases.assign'), coders = useFetch(assignable ? '/coders' : null), [coder, setCoder] = useState(''), [err, setErr] = useState('')
  const assign = async () => { setErr(''); try { const r = await api('/encounters/assign', { body: { encounter_ids: sel, coder_id: +coder } }); toast(`${r.assigned} encounter(s) assigned`); setSel([]); setModal(false); setTick(t => t + 1); reload() } catch (e: any) { setErr(e.message) } }
  return <><PageHead title="Work queues" sub={s ? `${s.overdue} past SLA` : ''}>{assignable && <Btn disabled={!sel.length} onClick={() => setModal(true)}>Assign {sel.length || ''}</Btn>}</PageHead>
    <div className="flex flex-wrap gap-2 mb-3">{STATUSES.map(k => <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)} className={`px-3 h-9 rounded-full border text-[13px] font-medium ${status === k ? 'bg-plum text-white border-plum' : 'bg-white border-line'}`}>{k ? label(k) : 'All'} {k && s ? <span className="tnum opacity-70">{s.counts[k] || 0}</span> : ''}</button>)}</div>
    <div className="grid xl:grid-cols-[1fr_260px] gap-3 items-start"><DataTable url="/encounters" tick={tick} params={{ status }} placeholder="Search queue" selected={sel} onSelect={assignable ? setSel : undefined} onRow={(r: any) => nav(can('coding.perform') ? `/workspace/${r.id}` : `/encounters/${r.id}`)} columns={[encCols[0], encCols[1], encCols[7], encCols[9], encCols[10], { key: 'queue', label: 'Queue' }, { key: 'due_at', label: 'SLA', sort: 'due_at', render: (r: any) => <Sla r={r} /> }]} />
      <Card className="p-4"><h3 className="font-semibold mb-2">Team workload</h3>{!s?.workload.length && <Empty>No open work.</Empty>}{s?.workload.map((w: any) => <div key={w.coder} className="flex justify-between py-1.5 text-[13.5px]"><span>{w.coder}</span><b className="tnum">{w.open}</b></div>)}</Card></div>
    {modal && <Modal title={`Assign ${sel.length} encounter(s)`} onClose={() => setModal(false)}><div className="grid gap-3"><Err>{err}</Err><Select className="!w-full" label="Coder" value={coder} onChange={setCoder} options={[['', 'Choose a coder'], ...(coders.data || []).map((c: any) => [c.id, c.name])]} /><Btn disabled={!coder} onClick={assign}>Assign</Btn></div></Modal>}</>
}

export function QaQueue() {
  const nav = useNavigate(), [status, setStatus] = useState('pending_qa')
  return <><PageHead title="QA review" sub="Coding waiting for an independent check." /><DataTable url="/qa/queue" params={{ status }} placeholder="Search reviews" onRow={(r: any) => nav(`/qa/${r.id}`)} toolbar={<Select label="Status" value={status} onChange={setStatus} options={[['pending_qa', 'Pending QA'], ['approved', 'Approved'], ['rejected', 'Rejected']]} />} columns={[encCols[0], encCols[1], encCols[9], encCols[10], encCols[7], { key: 'auditor', label: 'Auditor', render: (r: any) => r.auditor || 'Unassigned' }, { key: 'due_at', label: 'Due', render: (r: any) => <Sla r={r} /> }]} /></>
}

export function Codes() {
  const { system } = useParams(), [open, setOpen] = useState<any>(null)
  const title = ({ ICD10: 'ICD-10-CM', CPT: 'CPT', HCPCS: 'HCPCS Level II' } as any)[system]
  const notice = system === 'CPT' ? 'Demo catalog in plain-language wording. Official CPT content requires an AMA license.' : 'Small demo catalog. Load the official versioned code set before real use.'
  const cols: any = { ICD10: [{ key: 'chapter', label: 'Chapter' }, { key: 'billable', label: 'Billable', render: (r: any) => <Pill value={r.billable ? 'Billable' : 'Not billable'} tone={r.billable ? 'ok' : 'amber'} /> }, { key: 'code_set_version', label: 'Version' }], CPT: [{ key: 'category', label: 'Category' }, { key: 'section', label: 'Section' }, { key: 'suggested_modifiers', label: 'Modifiers' }, { key: 'max_units', label: 'Max units' }], HCPCS: [{ key: 'kind', label: 'Type' }, { key: 'max_units', label: 'Max units' }, { key: 'effective_date', label: 'Effective', render: (r: any) => fmtDate(r.effective_date) }] }
  const hide = new Set(['id', '_sa_instance_state'])
  return <><PageHead title={title} sub={notice} /><DataTable key={system} url={`/codes/${system}`} placeholder="Search code or description" onRow={setOpen} columns={[{ key: 'code', label: 'Code', render: (r: any) => <Mono>{r.code}</Mono> }, { key: 'description', label: 'Description' }, ...cols[system]]} />
    {open && <Modal title={open.code} onClose={() => setOpen(null)}><dl className="grid gap-1.5 text-[13.5px]">{Object.entries(open).filter(([k, v]) => !hide.has(k) && v !== null && v !== '').map(([k, v]: any) => <div key={k}><dt className="text-muted text-[12px]">{label(k)}</dt><dd>{String(v)}</dd></div>)}</dl></Modal>}</>
}

export function Tasks() {
  const nav = useNavigate(), [status, setStatus] = useState('open'), { data: d, reload } = useFetch(`/tasks?status=${status}`, [status])
  return <><PageHead title="Your tasks"><Btn kind="secondary" onClick={() => reload()}>Refresh</Btn></PageHead>
    <div className="flex gap-2 mb-3">{['open', 'closed'].map(k => <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)} className={`px-3 h-9 rounded-full border font-medium text-[13px] ${status === k ? 'bg-plum text-white border-plum' : 'bg-white border-line'}`}>{label(k)} tasks {d?.[k] ?? ''}</button>)}</div>
    <Card>{!d?.items.length && <Empty>No {status} tasks.</Empty>}{d?.items.map((t: any) => <div key={t.id} className="flex flex-wrap items-center gap-3 p-3 border-b border-[#E4F1F4] last:border-0"><div className="flex-1 min-w-[200px]"><div className="font-medium">{t.title}</div><div className="text-[12.5px] text-muted">{t.due_at ? `Due ${fmtDate(t.due_at)}` : 'No due date'}</div></div>{t.encounter_id && <Btn kind="secondary" onClick={() => nav(`/workspace/${t.encounter_id}`)}>Open</Btn>}{t.status === 'open' && <Btn kind="ghost" onClick={async () => { await api(`/tasks/${t.id}/close`, { method: 'POST' }); reload() }}>Close</Btn>}</div>)}</Card></>
}

export function CaseCraft() {
  const nav = useNavigate(), pts = useFetch('/patients?size=100'), [pid, setPid] = useState(''), [type, setType] = useState('Office visit'), [note, setNote] = useState(''), [res, setRes] = useState<any>(null), [tab, setTab] = useState('summary'), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const create = async () => { setBusy(true); setErr(''); try { setRes(await api('/casecraft', { body: { patient_id: +pid, encounter_type: type, note } })) } catch (e: any) { setErr(e.message) } finally { setBusy(false) } }
  return <><PageHead title="CaseCraft" sub="Create a case from a pasted chart, then review the note and code it." />
    <div className="grid lg:grid-cols-2 gap-3 items-start"><Card className="p-4 grid gap-3"><Err>{err}</Err><div className="flex flex-wrap gap-2"><Select className="flex-1" label="Patient" value={pid} onChange={setPid} options={[['', 'Choose a patient'], ...(pts.data?.items || []).map((p: any) => [p.id, `${p.last_name}, ${p.first_name} (${p.mrn})`])]} /><Select label="Encounter type" value={type} onChange={setType} options={['Office visit', 'Inpatient', 'Telehealth'].map(x => [x, x])} /></div><textarea aria-label="Clinical note" className="field !h-64 py-2" placeholder="Paste the clinical note. Use synthetic text only in this environment." value={note} onChange={e => setNote(e.target.value)} /><Btn busy={busy} disabled={!pid || !note.trim()} onClick={create}>Create case</Btn></Card>
      <Card className="p-4">{!res ? <Empty>The note summary and CDI issues appear here after you create a case.</Empty> : <div className="grid gap-3"><div className="flex justify-between items-center"><h3 className="font-semibold font-mono">{res.external_id}</h3><Btn onClick={() => nav(`/workspace/${res.id}`)}>Code this chart</Btn></div><div className="flex gap-1">{[['full', 'Full note'], ['summary', 'Note summary'], ['cdi', 'CDI issues']].map(([k, n]) => <Btn key={k} kind={tab === k ? 'secondary' : 'ghost'} onClick={() => setTab(k)}>{n}</Btn>)}</div>{tab === 'full' && <p className="whitespace-pre-wrap">{note}</p>}{tab === 'summary' && <p>{res.summary}</p>}{tab === 'cdi' && (res.cdi_issues.length ? <Alerts items={res.cdi_issues} /> : <div className="text-muted">No CDI issues found by the rule checks.</div>)}<p className="text-[12px] text-muted">Summary and CDI output come from the rule mock.</p></div>}</Card></div></>
}

export function ArFollowup() {
  const { can } = useAuth(), [status, setStatus] = useState(''), [tick, setTick] = useState(0)
  const update = async (id: number, s: string) => { await api(`/ar/${id}`, { body: { status: s } }); setTick(t => t + 1) }
  return <><PageHead title="AR follow-up" sub="Open balances on approved encounters. Synthetic data." /><DataTable url="/ar" tick={tick} params={{ status }} placeholder="Search job ID or payer" toolbar={<Select label="Status" value={status} onChange={setStatus} options={[['', 'All statuses'], ['open', 'Open'], ['in_progress', 'In progress'], ['appealed', 'Appealed'], ['resolved', 'Resolved']]} />} columns={[{ key: 'job_id', label: 'Job ID', render: (r: any) => <Mono>{r.job_id}</Mono> }, { key: 'encounter', label: 'Encounter', render: (r: any) => <Mono>{r.encounter}</Mono> }, { key: 'patient', label: 'Patient' }, { key: 'payer', label: 'Payer' }, { key: 'balance', label: 'Balance', render: (r: any) => `$${r.balance.toFixed(2)}` }, { key: 'age_days', label: 'Age (days)' }, { key: 'status', label: 'Status', render: (r: any) => can('ar.manage') ? <Select label="Update status" value={r.status} onChange={(v: string) => update(r.id, v)} options={['open', 'in_progress', 'appealed', 'resolved']} /> : <Pill value={r.status} /> }]} /></>
}

export function Policies() {
  const { can } = useAuth(), [q, setQ] = useState(''), { data, reload } = useFetch(`/policies${qs({ q })}`, [q])
  return <><PageHead title="Policy review" sub="Payer rules that affect coding. Synthetic examples." /><input aria-label="Search policies" className="field mb-3 max-w-md" placeholder="Search payer, title or code" value={q} onChange={e => setQ(e.target.value)} /><div className="grid md:grid-cols-2 gap-3">{data?.map((p: any) => <Card key={p.id} className="p-4 grid gap-1.5"><div className="flex justify-between gap-2"><h3 className="font-semibold">{p.title}</h3><Pill value={p.status} /></div><div className="text-[13px] text-muted">{p.payer} · Codes <Mono>{p.code_scope}</Mono> · Effective {fmtDate(p.effective_date)}</div><p>{p.summary}</p>{can('policy.manage') && <div className="flex gap-2"><Btn kind="secondary" className="!h-8" onClick={async () => { await api(`/policies/${p.id}`, { body: { status: 'applied' } }); reload() }}>Mark applied</Btn><Btn kind="ghost" className="!h-8" onClick={async () => { await api(`/policies/${p.id}`, { body: { status: 'dismissed' } }); reload() }}>Dismiss</Btn></div>}</Card>)}</div>{data && !data.length && <Empty>No policies match.</Empty>}</>
}

const CATS = ['Clinical charts', 'Payer policies', 'Remittance', 'Other']
export function UploadPage() {
  const toast = useToast(), nav = useNavigate(), [cat, setCat] = useState(''), [files, setFiles] = useState<File[]>([]), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const go = async () => { const f = new FormData(); f.append('category', cat); files.forEach(x => f.append('files', x)); setBusy(true); setErr(''); try { await api('/uploads', { form: f }); toast('Files uploaded'); nav('/uploads') } catch (e: any) { setErr(e.message) } finally { setBusy(false) } }
  return <><PageHead title="Upload documents" sub="PDF, text, Office or image files up to 10 MB. Synthetic files only here." /><Card className="p-5 grid gap-3 max-w-xl"><Err>{err}</Err><Select className="!w-full" label="Category" value={cat} onChange={setCat} options={[['', 'Choose a category'], ...CATS.map(c => [c, c])]} /><label className="border-2 border-dashed border-line rounded-xl p-8 text-center cursor-pointer hover:border-wine/40"><FileUp className="mx-auto text-wine mb-1" /><span className="font-medium">Add files</span><input type="file" multiple className="sr-only" onChange={e => setFiles([...files, ...Array.from(e.target.files || [])])} /></label>{files.map((f, i) => <div key={i} className="flex justify-between text-[13.5px]"><span>{f.name}</span><button className="text-bad" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button></div>)}<Btn busy={busy} disabled={!cat || !files.length} onClick={go}>Upload {files.length} file{files.length === 1 ? '' : 's'}</Btn></Card></>
}

export function Uploads() {
  const [cat, setCat] = useState(''), { data } = useFetch(`/uploads${qs({ category: cat })}`, [cat]), [sel, setSel] = useState<any>(null)
  return <><PageHead title="View uploads"><Select label="Category" value={cat} onChange={setCat} options={[['', 'All categories'], ...CATS.map(c => [c, c])]} /></PageHead><div className="grid lg:grid-cols-[320px_1fr] gap-3"><Card>{!data?.length && <Empty>No files uploaded yet.</Empty>}{data?.map((u: any) => <button key={u.id} onClick={() => setSel(u)} className={`block w-full text-left p-3 border-b border-[#E4F1F4] last:border-0 ${sel?.id === u.id ? 'bg-wine-soft' : 'hover:bg-[#F7FCFD]'}`}><div className="font-medium truncate">{u.filename}</div><div className="text-[12px] text-muted">{u.category} · {u.user} · {fmtTime(u.at)}</div></button>)}</Card>
    <Card className="min-h-[420px] overflow-hidden">{sel ? (/\.(pdf|png|jpe?g|txt)$/i.test(sel.filename) ? <iframe sandbox="" title={sel.filename} src={`/api/uploads/${sel.id}/file`} className="w-full h-[70vh]" /> : <div className="p-8 text-center"><a className="text-wine font-semibold" href={`/api/uploads/${sel.id}/file`}>Download {sel.filename}</a></div>) : <Empty>Choose a file to preview.</Empty>}</Card></div></>
}

export function Insights() {
  const { data: d, error } = useFetch('/analytics')
  if (error) return <Err>{error}</Err>
  if (!d) return <Spinner />
  const bar = (data: any, x: string, keys: [string, string, string][]) => <ResponsiveContainer><BarChart data={data}><CartesianGrid stroke="rgba(32,166,181,.16)" vertical={false} /><XAxis dataKey={x} tick={axis} /><YAxis tick={axis} allowDecimals={false} width={28} /><Tooltip cursor={{ fill: '#EEF9FB' }} />{keys.map(([k, n, c]) => <Bar key={k} dataKey={k} name={n} fill={c} stackId="a" />)}</BarChart></ResponsiveContainer>
  return <><PageHead title="AI insights" sub="These measure the keyword mock on synthetic records. They say nothing about real model accuracy." /><div className="grid grid-cols-2 gap-3 mb-3 max-w-lg"><Kpi title="Suggestions made" value={d.total_recommendations} /><Kpi title="QA rejection rate" value={d.rejection_rate != null ? `${d.rejection_rate}%` : null} /></div>
    <div className="grid lg:grid-cols-2 gap-3"><ChartCard title="Suggestion outcome by code">{bar(d.code_accuracy, 'code', [['accepted', 'Accepted', '#0F8A73'], ['rejected', 'Rejected', '#48C4D0'], ['pending', 'Pending', '#718096']])}</ChartCard><ChartCard title="Documentation and coding findings">{d.deficiencies.length ? bar(d.deficiencies.map((x: any) => ({ ...x, rule: label(x.rule) })), 'rule', [['count', 'Findings', '#20A6B5']]) : <Empty>No findings recorded yet. They appear after coders validate.</Empty>}</ChartCard><ChartCard title="QA rejection reasons">{d.rejection_reasons.length ? bar(d.rejection_reasons, 'reason', [['count', 'Rejections', '#20A6B5']]) : <Empty>No rejections yet.</Empty>}</ChartCard></div></>
}

export function Reports() {
  const { can } = useAuth(), { data, reload } = useFetch('/reports'), [kind, setKind] = useState('daily'), prev = useFetch(`/reports/${kind}/preview`, [kind])
  return <><PageHead title="Reports"><Select label="Report" value={kind} onChange={setKind} options={(data?.types || []).map((t: any) => [t.id, t.name])} />{can('reports.export') && ['csv', 'pdf'].map(f => <a key={f} onClick={() => setTimeout(reload, 800)} href={`/api/reports/${kind}/export?fmt=${f}`} className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-[10px] border border-[#CFE0E6] bg-white font-semibold text-[13.5px]"><Download size={15} />{f.toUpperCase()}</a>)}</PageHead><Err>{prev.error}</Err>
    <Card className="overflow-x-auto mb-3"><table className="w-full text-[13.5px] tnum"><thead><tr className="text-left text-muted text-[12px] border-b border-line">{prev.data?.columns.map((c: string) => <th key={c} className="px-3 py-2.5">{c}</th>)}</tr></thead><tbody>{prev.data?.rows.map((r: any[], i: number) => <tr key={i} className="border-b border-[#E4F1F4] last:border-0">{r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}</tr>)}</tbody></table>{prev.data && !prev.data.rows.length && <Empty>This report has no data yet.</Empty>}</Card>
    <Card className="p-4"><h3 className="font-semibold mb-1">Recent exports</h3>{!data?.recent.length && <div className="text-muted">No exports yet.</div>}{data?.recent.map((j: any, i: number) => <div key={i} className="text-[13px] py-0.5">{j.type} · {j.fmt.toUpperCase()} · {j.rows} rows · {j.user} · {fmtTime(j.at)}</div>)}</Card></>
}

export function UsersPage() {
  const { can, user: me } = useAuth(), toast = useToast(), [tick, setTick] = useState(0), { data: rd, reload: rl } = useFetch('/roles'), [edit, setEdit] = useState<any>(null), [add, setAdd] = useState(false), [activity, setActivity] = useState<any>(null), [form, setForm] = useState<any>({ role: 'Medical Coder' }), [err, setErr] = useState(''), [tab, setTab] = useState('users')
  const roleOpts = (rd?.roles || []).filter((r: any) => r.name !== 'Super Admin' || can('users.manage_all')).map((r: any) => [r.name, r.name])
  const patch = async (id: number, body: any) => { setErr(''); try { await api(`/users/${id}`, { method: 'PATCH', body }); toast('User updated'); setTick(t => t + 1); setEdit(null) } catch (e: any) { setErr(e.message); toast(e.message) } }
  const create = async () => { setErr(''); try { await api('/users', { body: form }); toast('User created'); setAdd(false); setForm({ role: 'Medical Coder' }); setTick(t => t + 1) } catch (e: any) { setErr(e.message) } }
  const perm = async (role: string, permission: string, enabled: boolean) => { try { await api(`/roles/${encodeURIComponent(role)}/permissions`, { body: { permission, enabled } }); rl() } catch (e: any) { toast(e.message) } }
  return <><PageHead title="Users and roles"><div className="flex bg-[#E4F3F6] p-0.5 rounded-lg">{['users', 'permissions'].map(k => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)} className={`px-3 h-8 rounded-md text-[13px] font-medium ${tab === k ? 'bg-white shadow-card' : 'text-muted'}`}>{label(k)}</button>)}</div>{tab === 'users' && <Btn onClick={() => setAdd(true)}><UserPlus size={15} />Create user</Btn>}</PageHead>
    {tab === 'users' ? <DataTable url="/users" tick={tick} placeholder="Search name or email" columns={[{ key: 'full_name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'organization', label: 'Organization' }, { key: 'roles', label: 'Role', render: (r: any) => r.roles.join(', ') }, { key: 'state', label: 'Status', render: (r: any) => r.locked ? <Pill value="locked" tone="amber" /> : <Pill value={r.is_active ? 'active' : 'inactive'} /> }, { key: 'mfa', label: 'MFA', render: (r: any) => r.mfa_enabled ? 'On' : 'Off' }, { key: 'last', label: 'Last login', render: (r: any) => fmtTime(r.last_login_at) }, { key: 'act', label: '', render: (r: any) => <div className="flex gap-1"><Btn kind="ghost" className="!h-7" onClick={() => setEdit(r)}>Edit</Btn><Btn kind="ghost" className="!h-7" onClick={async () => setActivity({ name: r.full_name, rows: await api(`/users/${r.id}/activity`) })}>Activity</Btn>{r.locked && <Btn kind="ghost" className="!h-7" onClick={() => patch(r.id, { unlock: true })}>Unlock</Btn>}{r.id !== me.id && <Btn kind="ghost" className="!h-7" onClick={() => patch(r.id, { is_active: !r.is_active })}>{r.is_active ? 'Deactivate' : 'Activate'}</Btn>}</div> }]} />
      : <Card className="overflow-x-auto"><table className="text-[12.5px]"><thead><tr className="border-b border-line"><th className="text-left p-2.5 sticky left-0 bg-white">Permission</th>{rd?.roles.map((r: any) => <th key={r.name} className="p-2.5 whitespace-nowrap">{r.name}</th>)}</tr></thead><tbody>{rd?.permissions.map((p: any) => <tr key={p.code} className="border-b border-[#E4F1F4]"><td className="p-2 sticky left-0 bg-white whitespace-nowrap">{p.description}</td>{rd.roles.map((r: any) => <td key={r.name} className="text-center p-2"><input aria-label={`${r.name}: ${p.description}`} className="accent-wine" type="checkbox" disabled={!can('roles.manage') || r.name === 'Super Admin'} checked={r.permissions.includes(p.code)} onChange={e => perm(r.name, p.code, e.target.checked)} /></td>)}</tr>)}</tbody></table></Card>}
    {edit && <Modal title={`Edit ${edit.full_name}`} onClose={() => setEdit(null)}><div className="grid gap-3"><Err>{err}</Err><Select className="!w-full" label="Role" value={edit.roles[0]} onChange={(v: string) => setEdit({ ...edit, roles: [v] })} options={roleOpts} /><Btn onClick={() => patch(edit.id, { role: edit.roles[0] })}>Save</Btn></div></Modal>}
    {add && <Modal title="Create user" onClose={() => setAdd(false)}><div className="grid gap-2.5"><Err>{err}</Err><input aria-label="Full name" className="field" placeholder="Full name" onChange={e => setForm({ ...form, full_name: e.target.value })} /><input aria-label="Email" className="field" placeholder="Email" onChange={e => setForm({ ...form, email: e.target.value })} /><input aria-label="Temporary password" type="password" autoComplete="new-password" className="field" placeholder="Temporary password, 12+ characters" onChange={e => setForm({ ...form, password: e.target.value })} /><Select className="!w-full" label="Role" value={form.role} onChange={(v: string) => setForm({ ...form, role: v })} options={roleOpts} /><Btn onClick={create}>Create user</Btn></div></Modal>}
    {activity && <Modal title={`${activity.name}: activity`} onClose={() => setActivity(null)}>{!activity.rows.length && <Empty>No activity recorded.</Empty>}{activity.rows.map((a: any, i: number) => <div key={i} className="text-[13px] py-1 border-b border-[#E4F1F4]">{a.action} · <span className="text-muted">{fmtTime(a.at)}</span></div>)}</Modal>}</>
}

export function Audit() {
  return <><PageHead title="Audit log" sub="Sign-ins, record access and every coding decision." /><DataTable url="/audit" placeholder="Filter by action, such as phi or coding" columns={[{ key: 'at', label: 'When', render: (r: any) => fmtTime(r.at) }, { key: 'user', label: 'User' }, { key: 'action', label: 'Action', render: (r: any) => <Mono>{r.action}</Mono> }, { key: 'entity', label: 'Entity' }, { key: 'entity_id', label: 'ID' }, { key: 'detail', label: 'Detail' }, { key: 'ip', label: 'IP' }]} /></>
}

export function SettingsPage() {
  const { can, user, setUser } = useAuth(), toast = useToast(), s = useFetch(can('settings.view') ? '/settings' : null), [mfa, setMfa] = useState<any>(null), [code, setCode] = useState(''), [err, setErr] = useState('')
  const start = async () => { try { setMfa(await api('/auth/mfa/setup', { method: 'POST' })) } catch (e: any) { setErr(e.message) } }
  const enable = async () => { try { setUser(await api('/auth/mfa/enable', { body: { code } })); setMfa(null); toast('MFA is on') } catch (e: any) { setErr(e.message) } }
  const groups: any = {}; (s.data?.settings || []).forEach((x: any) => (groups[x.category] ||= []).push(x))
  return <><PageHead title="Settings" /><div className="grid lg:grid-cols-2 gap-3 items-start">
    <Card className="p-4 grid gap-2"><h3 className="font-semibold">Your security</h3><Err>{err}</Err><div>Multi-factor authentication is <b>{user.mfa_enabled ? 'on' : 'off'}</b>.</div>{!user.mfa_enabled && !mfa && <Btn className="justify-self-start" onClick={start}>Set up MFA</Btn>}{mfa && <div className="grid gap-2"><div className="text-[13px]">Add this key to your authenticator app:</div><code className="font-mono bg-canvas p-2 rounded-lg break-all">{mfa.secret}</code><input aria-label="Code" className="field" inputMode="numeric" placeholder="6-digit code" value={code} onChange={e => setCode(e.target.value)} /><Btn onClick={enable}>Turn on MFA</Btn></div>}</Card>
    {can('settings.view') && <Card className="p-4"><h3 className="font-semibold mb-2">AI models</h3>{s.data?.models.map((m: any) => <div key={m.id} className="flex justify-between gap-2 py-1.5 border-b border-[#E4F1F4] last:border-0"><div><div className="font-medium">{m.name}</div><div className="text-[12.5px] text-muted">{m.role} · {m.version}</div></div><Pill value={m.mode} tone={m.mode === 'mock' ? 'amber' : 'neutral'} /></div>)}</Card>}
    {Object.entries(groups).map(([g, rows]: any) => <Card key={g} className="p-4 grid gap-2"><h3 className="font-semibold">{g}</h3>{rows.map((x: any) => <label key={x.key} className="grid grid-cols-[1fr_170px] gap-2 items-center text-[13.5px]">{label(x.key)}<input className="field !h-9" disabled={!s.data.can_edit} defaultValue={x.value} onBlur={async e => { if (e.target.value !== x.value) { await api('/settings', { method: 'PUT', body: { key: x.key, value: e.target.value } }); toast('Setting saved'); s.reload() } }} /></label>)}</Card>)}
  </div></>
}
