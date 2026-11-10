import { useEffect, useRef, useState } from 'react'
import { Cpu, Database, ShieldCheck, Sparkles } from 'lucide-react'
import { LoginPanel, PanelFooter, Switcher, Wordmark, useParallax } from './shared'
import { CODES, CodeCard, ClinicalNote } from './visuals'

const W = 640, H = 400
/** Scales the fixed-size stage to whatever room the panel has, in both axes. */
function useFit(ref: React.RefObject<HTMLElement>, max = 1.2) {
  const [s, setS] = useState(1)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(([e]) => { const { width, height } = e.contentRect; setS(Math.max(0.45, Math.min(max, width / W, height / H))) })
    ro.observe(el); return () => ro.disconnect()
  }, [ref, max])
  return s
}

const cardY = [0, 104, 208, 312]
const samples = [CODES.e11, CODES.i10, CODES.cpt, CODES.hcpcs]
const paths = cardY.map(y => `M368 200 C 402 200, 396 ${y + 44}, 430 ${y + 44}`)
const docPath = 'M212 150 C 242 150, 240 200, 272 200'
const steps = ['Reading document', 'Extracting clinical entities', 'Mapping ICD-10-CM, CPT, HCPCS', 'Evidence validated']

export default function MedicalAI() {
  const root = useRef<HTMLDivElement>(null), fit = useRef<HTMLDivElement>(null)
  useParallax(root)
  const s = useFit(fit)
  return (
    <div className="dp ai" ref={root}>
      <section className="ai-story" aria-label="Product overview">
        <div className="ai-grid" aria-hidden /><div className="ai-glow g1" aria-hidden /><div className="ai-glow g2" aria-hidden />
        <header className="ai-brand"><Wordmark variant="ai" size={40} /></header>

        <div className="ai-copy">
          <h2>Intelligent Medical Coding.<span> Smarter Revenue Cycles.</span></h2>
          <p>Transform clinical documentation into accurate, evidence-supported coding recommendations, with professional coders in control.</p>
        </div>

        <div className="ai-fit" ref={fit} aria-hidden>
          <div className="ai-stage" style={{ width: W, height: H, transform: `translate(-50%,-50%) scale(${s})` }}>
            <svg className="ai-wires" width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none">
              <path className="flow" d={docPath} />
              {paths.map((d, i) => <path key={i} className="flow" d={d} style={{ animationDelay: `${i * -0.4}s` }} />)}
            </svg>
            {[docPath, ...paths].map((d, i) => <span key={i} className="ai-dot" style={{ offsetPath: `path('${d}')`, animationDelay: `${i * 0.55}s` } as any} />)}

            <div className="ai-par" style={{ left: 0, top: 36, ['--d' as any]: 10 }}>
              <div className="ai-float"><ClinicalNote /></div>
            </div>

            <div className="ai-core">
              <span className="r r1" /><span className="r r2" /><span className="r r3" />
              <div className="ai-core-disc"><Sparkles size={26} strokeWidth={1.6} /></div>
              <div className="ai-steps">{steps.map((t, i) => <span key={t} style={{ animationDelay: `${i * 3}s` }}><b />{t}</span>)}</div>
            </div>

            {samples.map((c, i) => (
              <div key={c.code} className="ai-par" style={{ left: 430, top: cardY[i], ['--d' as any]: -6 - i * 3 }}>
                <div className="ai-float" style={{ animationDelay: `${-i * 1.7}s` }}><CodeCard s={c} delay={3.8 + i * 0.7} /></div>
              </div>
            ))}
          </div>
        </div>

        <ul className="ai-points" aria-hidden>
          <li><Database size={14} />Evidence-linked</li><li><Cpu size={14} />AI-assisted</li><li><ShieldCheck size={14} />Coder-approved</li>
        </ul>
      </section>

      <section className="ai-auth" aria-label="Sign in">
        <div className="ai-auth-brand"><Wordmark variant="ai" size={34} /></div>
        <div className="ai-auth-mid"><LoginPanel variant="ai" /></div>
        <PanelFooter />
      </section>
      <Switcher current="ai" />
    </div>
  )
}
