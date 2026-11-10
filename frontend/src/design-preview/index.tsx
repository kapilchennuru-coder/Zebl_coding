import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { ArrowUpRight, Monitor, Smartphone } from 'lucide-react'
import './design-preview.css'
import { CONCEPTS, Concept, ZeblMark } from './shared'

const AquaGlass = lazy(() => import('./AquaGlass'))
const ClinicalLuxury = lazy(() => import('./ClinicalLuxury'))
const MedicalAI = lazy(() => import('./MedicalAI'))

/** Isolated prototype routes. Nothing here touches the real authentication or the app shell. */
export default function DesignPreview() {
  return (
    <Suspense fallback={<div className="ds-loading" role="status">Loading prototype…</div>}>
      <Routes>
        <Route index element={<Selector />} />
        <Route path="aqua-glass" element={<AquaGlass />} />
        <Route path="clinical-luxury" element={<ClinicalLuxury />} />
        <Route path="medical-ai" element={<MedicalAI />} />
        <Route path="*" element={<Navigate to="/design-preview" replace />} />
      </Routes>
    </Suspense>
  )
}

type Device = 'desktop' | 'mobile'
const SIZE: Record<Device, [number, number]> = { desktop: [1440, 900], mobile: [390, 844] }

/** A live, scaled, non-interactive iframe of the real prototype route. */
function Preview({ c, device }: { c: Concept; device: Device }) {
  const box = useRef<HTMLDivElement>(null), [scale, setScale] = useState(0.3)
  const [w, h] = SIZE[device]
  useEffect(() => {
    const el = box.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setScale(Math.min(e.contentRect.width / w, e.contentRect.height / h)))
    ro.observe(el); return () => ro.disconnect()
  }, [w, h])
  return (
    <div className="ds-shot" ref={box} data-device={device}>
      <iframe title={`Preview of ${c.name}`} src={`/design-preview/${c.route}?embed=1`} loading="lazy" tabIndex={-1}
        style={{ width: w, height: h, transform: `translate(-50%,-50%) scale(${scale})` }} />
    </div>
  )
}

const ink = (hex: string) => {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#14343C' : '#fff'
}

function Selector() {
  const [device, setDevice] = useState<Device>('desktop')
  const [active, setActive] = useState<Concept>(CONCEPTS[0])
  return (
    <div className="ds">
      <header className="ds-head">
        <div className="ds-logo"><ZeblMark size={36} /><div><b>ZEBL Coding Agent</b><span>Login design review · Prototype stage</span></div></div>
        <div className="ds-toggle" role="group" aria-label="Preview size">
          <button className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')} aria-pressed={device === 'desktop'}><Monitor size={15} />Desktop</button>
          <button className={device === 'mobile' ? 'on' : ''} onClick={() => setDevice('mobile')} aria-pressed={device === 'mobile'}><Smartphone size={15} />Mobile</button>
        </div>
      </header>

      <section className="ds-intro">
        <h1>Three login concepts. One decision.</h1>
        <p>Each option is a complete, interactive, animated login experience with its own layout, palette, typography and motion language. Open them, try the form (sign-in is simulated), then tell me which one to carry across the whole ZEBL application.</p>
      </section>

      <section className="ds-grid" aria-label="Design options">
        {CONCEPTS.map(c => (
          <article key={c.id} className={`ds-card ${active.id === c.id ? 'on' : ''}`}>
            <Preview c={c} device={device} />
            <div className="ds-card-body">
              <div className="ds-opt">Option {c.n}</div>
              <h2>{c.name}</h2>
              <p>{c.tagline}</p>
              <div className="ds-sw" aria-label="Palette">{c.palette.map(p => <span key={p.hex} style={{ background: p.hex }} title={`${p.name} ${p.hex}`} />)}</div>
              <div className="ds-actions">
                <Link className="ds-open" to={`/design-preview/${c.route}`}>Open prototype<ArrowUpRight size={16} /></Link>
                <button className="ds-more" onClick={() => setActive(c)} aria-pressed={active.id === c.id}>Design details</button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="ds-info" aria-live="polite">
        <div className="ds-tabs" role="tablist" aria-label="Design information">
          {CONCEPTS.map(c => <button key={c.id} role="tab" aria-selected={active.id === c.id} className={active.id === c.id ? 'on' : ''} onClick={() => setActive(c)}><b>{c.n}</b>{c.name}</button>)}
        </div>
        <div className="ds-panel" key={active.id}>
          <div className="ds-block wide">
            <h3>Design philosophy</h3><p className="lead">{active.philosophy}</p><p>{active.layout}</p>
          </div>
          <div className="ds-block wide">
            <h3>Colour palette</h3>
            <div className="ds-pal">{active.palette.map(p => (
              <div key={p.hex} className="ds-swatch"><span style={{ background: p.hex, color: ink(p.hex) }}>{p.hex}</span><small>{p.name}</small></div>
            ))}</div>
          </div>
          <div className="ds-block">
            <h3>Typography</h3>
            <dl>{active.typography.map(t => <div key={t.role}><dt>{t.role}</dt><dd>{t.font}</dd></div>)}</dl>
          </div>
          <div className="ds-block">
            <h3>Background style</h3><p>{active.background}</p>
          </div>
          <div className="ds-block wide">
            <h3>Animation characteristics</h3>
            <ul>{active.animation.map(a => <li key={a}>{a}</li>)}</ul>
            <p className="ds-note">All motion uses transforms and opacity, pauses its parallax on touch devices, and is switched off when the visitor prefers reduced motion.</p>
          </div>
        </div>
      </section>

      <footer className="ds-foot">
        <p><b>Approval gate.</b> Nothing beyond these three prototypes has been changed. The existing login and application are untouched. Reply with <b>Option 01</b>, <b>Option 02</b> or <b>Option 03</b> and the chosen identity will then be applied across the full product.</p>
      </footer>
    </div>
  )
}
