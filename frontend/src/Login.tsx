import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react'
import { api } from './api'
import { Btn, Err, useAuth } from './ui'
import { AquaShell } from './design-preview/AquaGlass'
import { PanelFooter } from './design-preview/shared'
import './design-preview/design-preview.css'

const IconField = ({ icon: I, children }: any) => <div className="relative"><I size={17} className="absolute left-3.5 top-[15px] text-muted" />{children}</div>
const FieldErr = ({ id, children }: any) => children ? <div id={id} className="flex gap-1 items-center text-bad text-[12.5px]"><AlertCircle size={13} />{children}</div> : null

export default function Login() {
  const { setUser } = useAuth(), nav = useNavigate(), [sp] = useSearchParams()
  const [mode, setMode] = useState(sp.get('token') ? 'reset' : 'signin')
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [show, setShow] = useState(false), [remember, setRemember] = useState(false)
  const [code, setCode] = useState(''), [errs, setErrs] = useState<any>({}), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const expired = sp.get('expired')

  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn() } catch (e: any) { setError(e.message); setPw('') } finally { setBusy(false) } }
  const signin = (e: any) => {
    e.preventDefault()
    const v: any = { email: email.trim() ? '' : 'Enter your email.', pw: pw ? '' : 'Enter your password.' }
    setErrs(v)
    if (v.email || v.pw) return
    run(async () => {
      const r = await api('/auth/login', { body: { email, password: pw, remember } })
      setPw('')
      if (r.mfa_required) { setMode('mfa'); setCode('') } else { setUser(r.user); nav('/') }
    })
  }
  const mfa = (e: any) => { e.preventDefault(); run(async () => { const r = await api('/auth/mfa', { body: { code } }); setUser(r.user); nav('/') }) }
  const forgot = (e: any) => { e.preventDefault(); run(async () => { await api('/auth/forgot', { body: { email } }); setNotice('If an account exists for that email, a reset link has been issued.'); setMode('signin') }) }
  const reset = (e: any) => { e.preventDefault(); run(async () => { await api('/auth/reset', { body: { token: sp.get('token'), password: pw } }); setPw(''); setNotice('Password updated. Sign in with your new password.'); setMode('signin') }) }
  const back = <button type="button" className="text-wine font-semibold text-[14px] inline-flex gap-1 items-center justify-self-center" onClick={() => { setMode('signin'); setError('') }}><ArrowLeft size={15} />Back to sign in</button>

  return (
    <AquaShell switcher={false}>
      <div className="grid gap-5">
          {mode === 'signin' && <form className="grid gap-4" onSubmit={signin} noValidate>
            <div><h2 className="text-[27px] font-semibold tracking-tight text-aubergine">Welcome back</h2><p className="text-muted">Sign in to your coding workspace.</p></div>
            {expired && !error && !notice && <div className="bg-amber-soft text-amber-text rounded-[10px] px-3 py-2 text-[13.5px]">Your session expired. Sign in to continue.</div>}
            {notice && <div className="bg-ok-soft text-ok rounded-[10px] px-3 py-2 text-[13.5px]">{notice}</div>}
            <Err>{error}</Err>
            <div className="grid gap-1.5"><label htmlFor="email" className="text-[13px] font-semibold">Email</label><IconField icon={Mail}><input id="email" autoComplete="username" className="field !h-12 pl-10" placeholder="name@hospital.org" value={email} aria-invalid={!!errs.email} onChange={e => setEmail(e.target.value)} /></IconField><FieldErr>{errs.email}</FieldErr></div>
            <div className="grid gap-1.5"><label htmlFor="password" className="text-[13px] font-semibold">Password</label><IconField icon={Lock}><input id="password" autoComplete="current-password" type={show ? 'text' : 'password'} className="field !h-12 pl-10 pr-11" placeholder="Enter your password" value={pw} aria-invalid={!!errs.pw} onChange={e => setPw(e.target.value)} /><button type="button" aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 top-3.5 text-muted hover:text-ink" onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></IconField><FieldErr>{errs.pw}</FieldErr></div>
            <div className="flex justify-between items-center"><label className="flex gap-2 items-center cursor-pointer"><input type="checkbox" className="accent-wine w-4 h-4" checked={remember} onChange={e => setRemember(e.target.checked)} />Remember me</label><button type="button" className="text-wine font-semibold" onClick={() => { setMode('forgot'); setError('') }}>Forgot password?</button></div>
            <Btn type="submit" busy={busy} className="!h-[50px] w-full !text-[15.5px]">{busy ? 'Signing in' : <>Sign in<ArrowRight size={17} /></>}</Btn>
          </form>}
          {mode === 'mfa' && <form className="grid gap-4" onSubmit={mfa}>
            <div className="w-11 h-11 rounded-xl grid place-items-center bg-wine-soft text-wine"><ShieldCheck /></div>
            <div><h2 className="text-[27px] font-semibold tracking-tight text-aubergine">Verify it's you</h2><p className="text-muted">Enter the 6-digit code from your authenticator app.</p></div>
            <Err>{error}</Err>
            <input aria-label="Verification code" autoFocus inputMode="numeric" maxLength={6} className="field !h-14 text-center font-mono text-2xl tracking-[.4em]" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
            <Btn type="submit" busy={busy} disabled={code.length < 6} className="!h-[50px] w-full">Verify and continue</Btn>{back}
          </form>}
          {mode === 'forgot' && <form className="grid gap-4" onSubmit={forgot}>
            <div><h2 className="text-[27px] font-semibold tracking-tight text-aubergine">Reset your password</h2><p className="text-muted">Enter your work email and we'll issue a reset link.</p></div>
            <Err>{error}</Err>
            <input aria-label="Work email" type="email" required className="field !h-12" placeholder="name@hospital.org" value={email} onChange={e => setEmail(e.target.value)} />
            <Btn type="submit" busy={busy} className="!h-[50px] w-full">Send reset link</Btn>{back}
          </form>}
          {mode === 'reset' && <form className="grid gap-4" onSubmit={reset}>
            <div><h2 className="text-[27px] font-semibold tracking-tight text-aubergine">Choose a new password</h2><p className="text-muted">Use at least 12 characters with upper case, lower case and a number.</p></div>
            <Err>{error}</Err>
            <input aria-label="New password" type="password" autoComplete="new-password" className="field !h-12" value={pw} onChange={e => setPw(e.target.value)} />
            <Btn type="submit" busy={busy} className="!h-[50px] w-full">Update password</Btn>{back}
          </form>}
      </div>
      <PanelFooter />
    </AquaShell>
  )
}
