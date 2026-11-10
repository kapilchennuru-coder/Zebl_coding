import { ClipboardEvent, FormEvent, KeyboardEvent, RefObject, useEffect, useId, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ArrowRight, Check, Eye, EyeOff, KeyRound, Lock, Mail, MailCheck, ShieldCheck } from 'lucide-react'

/* ───────────────────────── Concept metadata (used by selector + switcher) ───────────────────────── */

export type Variant = 'aqua' | 'lux' | 'ai'

export interface Concept {
  id: Variant
  n: string
  route: string
  name: string
  short: string
  tagline: string
  palette: { name: string; hex: string }[]
  typography: { role: string; font: string }[]
  background: string
  animation: string[]
  philosophy: string
  layout: string
}

export const CONCEPTS: Concept[] = [
  {
    id: 'aqua', n: '01', route: 'aqua-glass', name: 'Premium Aqua Glass', short: 'Aqua Glass',
    tagline: 'Luminous, light and layered. A glass card floating in an aqua atmosphere.',
    palette: [
      { name: 'Primary turquoise', hex: '#20A6B5' }, { name: 'Aqua', hex: '#48C4D0' }, { name: 'Soft cyan', hex: '#BCEEF1' },
      { name: 'Ice blue', hex: '#EAF9FB' }, { name: 'Pure white', hex: '#FFFFFF' }, { name: 'Dark teal text', hex: '#176273' }, { name: 'Slate', hex: '#718096' },
    ],
    typography: [{ role: 'Display and UI', font: 'Plus Jakarta Sans 500–800' }, { role: 'Code values', font: 'JetBrains Mono 500' }],
    background: 'Drifting aqua light orbs over an ice-blue wash, blurred clinical silhouettes, frosted glass surfaces.',
    animation: ['Slow orb drift (transform only)', 'Floating glass medical icons', 'ECG line that draws continuously', 'Document scan and evidence highlight', 'Code cards cascade in', 'Pointer parallax on every layer'],
    philosophy: 'Healthcare technology should feel calm and light. Depth comes from translucency and soft light, never from heavy colour.',
    layout: 'Centred composition. Document panel on the left, code results on the right, glass login card in the middle.',
  },
  {
    id: 'lux', n: '02', route: 'clinical-luxury', name: 'Clinical Luxury', short: 'Clinical Luxury',
    tagline: 'Architectural, quiet and timeless. Editorial typography with generous whitespace.',
    palette: [
      { name: 'Glacier blue', hex: '#D9EFF5' }, { name: 'Powder blue', hex: '#A9D6E5' }, { name: 'Ice white', hex: '#F8FCFE' },
      { name: 'Cloud white', hex: '#FFFFFF' }, { name: 'Steel blue', hex: '#4D7185' }, { name: 'Deep teal', hex: '#176477' }, { name: 'Silver gray', hex: '#E6EDF1' },
    ],
    typography: [{ role: 'Display', font: 'Fraunces 400–600 (serif)' }, { role: 'UI and body', font: 'Inter 400–600' }],
    background: 'Layered architectural arches in glacier and powder blue with a slow light reflection. Frames are ready for licensed clinical photography.',
    animation: ['Staggered fade-rise entrance', 'Light reflection sweeping across the arches', 'Three-depth pointer parallax', 'Underline focus animation on inputs', 'Hairline ECG that draws once', 'Cross-fade loading transitions'],
    philosophy: 'Restraint is the luxury. Few elements, precise spacing, serif headlines and one confident accent.',
    layout: 'Asymmetric split. Authentication on the left, an architectural clinical scene on the right.',
  },
  {
    id: 'ai', n: '03', route: 'medical-ai', name: 'Next-Generation Medical AI', short: 'Medical AI',
    tagline: 'A live pipeline from clinical document to evidence-linked codes.',
    palette: [
      { name: 'Deep teal', hex: '#087E8B' }, { name: 'Medical turquoise', hex: '#22B8C5' }, { name: 'Sky blue', hex: '#74D8E3' },
      { name: 'Pale cyan', hex: '#DFF8FA' }, { name: 'White', hex: '#FFFFFF' }, { name: 'Graphite text', hex: '#273746' }, { name: 'Blue-gray', hex: '#EDF5F8' },
    ],
    typography: [{ role: 'Display and UI', font: 'Sora 400–700' }, { role: 'Codes and data', font: 'JetBrains Mono 400–600' }],
    background: 'Deep-teal to turquoise gradient with a fine data grid and soft glow. The authentication side stays pure white.',
    animation: ['Document scan and evidence highlights', 'Pulsing AI core with processing steps', 'Flowing connection lines with travelling signals', 'ICD-10-CM, CPT and HCPCS cards resolve in sequence', 'Floating cards (transform only)', 'Pointer parallax'],
    philosophy: 'Show what the product does. The login screen is a calm, readable demonstration of document-to-code intelligence.',
    layout: 'Product-story panel on the left (58%), clean white authentication on the right (42%).',
  },
]

/* ───────────────────────── Brand ───────────────────────── */

/** The ZEBL monogram (same geometry as the app logo) with a per-concept colourway. */
export function ZeblMark({ size = 40, a = '#2DAFC0', b = '#1B7F90', accent = '#E6A23C', accent2 = '#55C9D5', stroke = '#fff' }: { size?: number; a?: string; b?: string; accent?: string; accent2?: string; stroke?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="dp-mark" role="img" aria-label="ZEBL">
      <defs>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse"><stop stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
        <linearGradient id={`d${id}`} x1="28" y1="12" x2="12" y2="28" gradientUnits="userSpaceOnUse"><stop stopColor={accent} /><stop offset="1" stopColor={accent2} /></linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#b${id})`} />
      <path d="M28 12.5 12.5 27.5" fill="none" stroke={`url(#d${id})`} strokeWidth="3.6" strokeLinecap="round" />
      <path d="M11.5 12.5H28M12.5 27.5h9.8" fill="none" stroke={stroke} strokeWidth="3.6" strokeLinecap="round" />
      <circle cx="28.3" cy="27.5" r="2.5" fill={accent} />
    </svg>
  )
}

export function Wordmark({ variant, size = 40 }: { variant: Variant; size?: number }) {
  const mark = variant === 'lux'
    ? <ZeblMark size={size} a="#4D7185" b="#176477" accent="#A9D6E5" accent2="#D9EFF5" />
    : variant === 'ai'
      ? <ZeblMark size={size} a="#22B8C5" b="#087E8B" accent="#DFF8FA" accent2="#74D8E3" />
      : <ZeblMark size={size} a="#48C4D0" b="#20A6B5" accent="#FFFFFF" accent2="#BCEEF1" />
  return <div className="dp-brand">{mark}<div className="dp-brand-text"><span className="dp-brand-name">ZEBL</span><span className="dp-brand-sub">Coding Agent</span></div></div>
}

/* ───────────────────────── Motion helpers ───────────────────────── */

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Writes pointer position to --px/--py (-0.5..0.5) on the element. Layers read them with calc(). Skipped for reduced motion and touch. */
export function useParallax(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current
    if (!el || reducedMotion() || !window.matchMedia('(pointer: fine)').matches) return
    let raf = 0
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--px', (e.clientX / window.innerWidth - 0.5).toFixed(3))
        el.style.setProperty('--py', (e.clientY / window.innerHeight - 0.5).toFixed(3))
      })
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf) }
  }, [ref])
}

/* ───────────────────────── Prototype switcher ───────────────────────── */

export function useEmbed() { return useSearchParams()[0].get('embed') === '1' }

export function Switcher({ current }: { current: Variant }) {
  const embed = useEmbed()
  if (embed) return null
  return (
    <nav className="dp-switch" aria-label="Design prototypes">
      <Link to="/design-preview" className="dp-switch-all" title="Back to comparison">All concepts</Link>
      <span className="dp-switch-sep" />
      {CONCEPTS.map(c => (
        <Link key={c.id} to={`/design-preview/${c.route}`} className={c.id === current ? 'on' : ''} aria-current={c.id === current ? 'page' : undefined} title={`Option ${c.n} — ${c.name}`}>
          <b>{c.n}</b><span>{c.short}</span>
        </Link>
      ))}
    </nav>
  )
}

/* ───────────────────────── Login flow (frontend simulation only) ───────────────────────── */

type Step = 'signin' | 'mfa' | 'forgot' | 'sent' | 'done'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function useLoginFlow() {
  const [step, setStep] = useState<Step>('signin')
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [show, setShow] = useState(false), [remember, setRemember] = useState(true)
  const [submitted, setSubmitted] = useState(false), [touched, setTouched] = useState({ email: false, pw: false })
  const [busy, setBusy] = useState(false)
  const [otp, setOtp] = useState<string[]>(Array(6).fill('')), [resent, setResent] = useState(false)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)) }

  const emailErr = !email.trim() ? 'Enter your work email.' : !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address.' : ''
  const pwErr = !pw ? 'Enter your password.' : pw.length < 8 ? 'Use at least 8 characters.' : ''
  const showEmailErr = (submitted || touched.email) ? emailErr : ''
  const showPwErr = (submitted || touched.pw) ? pwErr : ''

  const go = (s: Step) => { setStep(s); setSubmitted(false); setBusy(false) }
  const signIn = (e: FormEvent) => {
    e.preventDefault(); setSubmitted(true)
    if (emailErr || pwErr || busy) return
    setBusy(true); later(() => { setOtp(Array(6).fill('')); go('mfa') }, 1500)
  }
  const verify = (e: FormEvent) => {
    e.preventDefault()
    if (otp.some(d => !d) || busy) return
    setBusy(true); later(() => go('done'), 1300)
  }
  const sendReset = (e: FormEvent) => {
    e.preventDefault(); setSubmitted(true)
    if (emailErr || busy) return
    setBusy(true); later(() => go('sent'), 1200)
  }
  const resend = () => { setResent(true); later(() => setResent(false), 3200) }
  const restart = () => { setPw(''); setShow(false); setTouched({ email: false, pw: false }); go('signin') }
  return { step, go, email, setEmail, pw, setPw, show, setShow, remember, setRemember, setTouched, busy, otp, setOtp, resent, resend,
    emailErr: showEmailErr, pwErr: showPwErr, signIn, verify, sendReset, restart }
}

/* ───────────────────────── Form pieces ───────────────────────── */

const Spinner = () => <span className="dp-spin" aria-hidden />
const FieldError = ({ id, msg }: { id: string; msg: string }) => (
  <div className="dpf-err" id={id} role={msg ? 'alert' : undefined} data-on={!!msg}><div><AlertCircle size={13} />{msg || ' '}</div></div>
)

function Otp({ otp, setOtp, autoFocus }: { otp: string[]; setOtp: (v: string[]) => void; autoFocus: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  useEffect(() => { if (autoFocus) refs.current[0]?.focus() }, [autoFocus])
  const put = (i: number, v: string) => {
    const d = v.replace(/\D/g, ''); if (!d) return
    const next = [...otp]; d.slice(0, 6 - i).split('').forEach((c, k) => { next[i + k] = c }); setOtp(next)
    refs.current[Math.min(i + d.length, 5)]?.focus()
  }
  const key = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') { e.preventDefault(); const next = [...otp]; if (next[i]) next[i] = ''; else if (i > 0) { next[i - 1] = ''; refs.current[i - 1]?.focus() } setOtp(next) }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus()
  }
  const paste = (e: ClipboardEvent<HTMLInputElement>) => { e.preventDefault(); put(0, e.clipboardData.getData('text')) }
  return (
    <div className="dpf-otp" role="group" aria-label="6-digit verification code">
      {otp.map((d, i) => (
        <input key={i} ref={el => { refs.current[i] = el }} value={d} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={6}
          aria-label={`Digit ${i + 1}`} data-filled={!!d} style={{ ['--i' as any]: i }}
          onChange={e => put(i, e.target.value)} onKeyDown={e => key(i, e)} onPaste={paste} onFocus={e => e.target.select()} />
      ))}
    </div>
  )
}

export function PanelFooter() {
  const stop = (e: any) => e.preventDefault()
  return (
    <footer className="dpf-foot">
      <div className="dpf-secure"><Lock size={13} /><span>Encrypted session · Role-based access · Every action audit-logged</span></div>
      <div className="dpf-legal">
        <span>© 2026 ZEBL Coding Agent</span>
        <a href="#privacy" onClick={stop}>Privacy</a><a href="#security" onClick={stop}>Security</a><a href="#terms" onClick={stop}>Terms</a>
      </div>
    </footer>
  )
}

/** The full authentication experience. All behaviour is simulated in the browser. Nothing is sent anywhere. */
export function LoginPanel({ variant }: { variant: Variant }) {
  const f = useLoginFlow()
  const first = useRef(true)
  const emailRef = useRef<HTMLInputElement>(null), forgotRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (f.step === 'signin') emailRef.current?.focus()
    if (f.step === 'forgot') forgotRef.current?.focus()
  }, [f.step])

  const submitLabel = (idle: string, busy: string) => f.busy ? <><Spinner />{busy}</> : <>{idle}<ArrowRight size={17} className="dp-arrow" /></>
  const back = () => <button type="button" className="dpf-link dpf-back" onClick={() => f.go('signin')}><ArrowLeft size={15} />Back to sign in</button>

  return (
    <div className="dpf" data-variant={variant}>
      <div className="dpf-step" key={f.step}>
        {f.step === 'signin' && <>
          <header className="dpf-head"><h1>Welcome back</h1><p>Sign in to your coding workspace.</p></header>
          <form onSubmit={f.signIn} noValidate className="dpf-form">
            <div className="dpf-field" data-invalid={!!f.emailErr}>
              <label htmlFor={`${variant}-email`}>Email address</label>
              <div className="dpf-control"><Mail size={17} className="dpf-ico" />
                <input id={`${variant}-email`} ref={emailRef} type="email" inputMode="email" autoComplete="username" placeholder="name@organization.org" value={f.email}
                  onChange={e => f.setEmail(e.target.value)} onBlur={() => f.setTouched(t => ({ ...t, email: true }))} aria-invalid={!!f.emailErr} aria-describedby={`${variant}-email-err`} /></div>
              <FieldError id={`${variant}-email-err`} msg={f.emailErr} />
            </div>
            <div className="dpf-field" data-invalid={!!f.pwErr}>
              <label htmlFor={`${variant}-pw`}>Password</label>
              <div className="dpf-control"><Lock size={17} className="dpf-ico" />
                <input id={`${variant}-pw`} type={f.show ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={f.pw}
                  onChange={e => f.setPw(e.target.value)} onBlur={() => f.setTouched(t => ({ ...t, pw: true }))} aria-invalid={!!f.pwErr} aria-describedby={`${variant}-pw-err`} />
                <button type="button" className="dpf-eye" data-on={f.show} onClick={() => f.setShow(!f.show)} aria-label={f.show ? 'Hide password' : 'Show password'} aria-pressed={f.show}>
                  <Eye size={18} className="e-open" /><EyeOff size={18} className="e-shut" /></button></div>
              <FieldError id={`${variant}-pw-err`} msg={f.pwErr} />
            </div>
            <div className="dpf-row">
              <label className="dpf-check"><input type="checkbox" checked={f.remember} onChange={e => f.setRemember(e.target.checked)} /><span className="box"><Check size={12} strokeWidth={3.5} /></span>Remember me</label>
              <button type="button" className="dpf-link" onClick={() => f.go('forgot')}>Forgot password?</button>
            </div>
            <button className="dpf-btn" type="submit" disabled={f.busy} aria-busy={f.busy}><span className="shine" aria-hidden />{submitLabel('Sign in', 'Authenticating…')}</button>
            {variant === 'ai' && <>
              <div className="dpf-or"><span>or</span></div>
              <button type="button" className="dpf-btn2"><ShieldCheck size={16} />Continue with SSO <em>preview</em></button>
            </>}
          </form>
          <p className="dpf-demo"><i />Prototype · Sign-in is simulated. Use any valid email and an 8+ character password. Nothing is sent or stored.</p>
        </>}

        {f.step === 'mfa' && <>
          <header className="dpf-head"><span className="dpf-badge"><KeyRound size={20} /></span><h1>Verify it’s you</h1><p>Enter the 6-digit code from your authenticator app to continue.</p></header>
          <form onSubmit={f.verify} className="dpf-form" noValidate>
            <Otp otp={f.otp} setOtp={f.setOtp} autoFocus />
            <button className="dpf-btn" type="submit" disabled={f.busy || f.otp.some(d => !d)} aria-busy={f.busy}><span className="shine" aria-hidden />{submitLabel('Verify and continue', 'Verifying…')}</button>
            <div className="dpf-row center">
              <button type="button" className="dpf-link" onClick={f.resend}>{f.resent ? 'Code resent (simulated)' : 'Resend code'}</button>
              <span className="dot" />{back()}
            </div>
          </form>
          <p className="dpf-demo"><i />Multi-factor preview · any 6 digits are accepted in this prototype.</p>
        </>}

        {f.step === 'forgot' && <>
          <header className="dpf-head"><span className="dpf-badge"><Mail size={20} /></span><h1>Reset your password</h1><p>Enter your work email and we’ll send reset instructions.</p></header>
          <form onSubmit={f.sendReset} className="dpf-form" noValidate>
            <div className="dpf-field" data-invalid={!!f.emailErr}>
              <label htmlFor={`${variant}-femail`}>Email address</label>
              <div className="dpf-control"><Mail size={17} className="dpf-ico" />
                <input id={`${variant}-femail`} ref={forgotRef} type="email" autoComplete="username" placeholder="name@organization.org" value={f.email} onChange={e => f.setEmail(e.target.value)}
                  onBlur={() => f.setTouched(t => ({ ...t, email: true }))} aria-invalid={!!f.emailErr} aria-describedby={`${variant}-femail-err`} /></div>
              <FieldError id={`${variant}-femail-err`} msg={f.emailErr} />
            </div>
            <button className="dpf-btn" type="submit" disabled={f.busy} aria-busy={f.busy}><span className="shine" aria-hidden />{submitLabel('Send reset link', 'Sending…')}</button>
            <div className="dpf-row center">{back()}</div>
          </form>
        </>}

        {f.step === 'sent' && <>
          <header className="dpf-head"><span className="dpf-badge ok"><MailCheck size={20} /></span><h1>Check your inbox</h1>
            <p>If an account exists for <b>{f.email || 'that address'}</b>, a reset link is on its way. This is a simulated message.</p></header>
          <div className="dpf-form"><button className="dpf-btn" type="button" onClick={f.restart}><span className="shine" aria-hidden />Return to sign in<ArrowRight size={17} className="dp-arrow" /></button></div>
        </>}

        {f.step === 'done' && <>
          <header className="dpf-head center">
            <span className="dpf-done"><svg viewBox="0 0 52 52" aria-hidden><circle cx="26" cy="26" r="23" /><path d="M16 27l7 7 14-15" /></svg></span>
            <h1>You’re in</h1><p>Authentication simulated successfully. A real deployment would now open your coding workspace.</p></header>
          <div className="dpf-form"><button className="dpf-btn" type="button" onClick={f.restart}><span className="shine" aria-hidden />Restart demo</button></div>
        </>}
      </div>
    </div>
  )
}
