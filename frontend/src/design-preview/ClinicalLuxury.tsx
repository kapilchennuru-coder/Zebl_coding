import { useRef } from 'react'
import { LoginPanel, PanelFooter, Switcher, Wordmark, useParallax } from './shared'
import { CODES, CodeCard, ClinicalNote, Ecg } from './visuals'

export default function ClinicalLuxury() {
  const root = useRef<HTMLDivElement>(null)
  useParallax(root)
  return (
    <div className="dp lx" ref={root}>
      <section className="lx-auth">
        <header className="lx-brand"><Wordmark variant="lux" size={38} /><p className="lx-mtag">Intelligent Medical Coding. <em>Smarter Revenue Cycles.</em></p></header>
        <div className="lx-mid">
          <div className="lx-card" aria-label="Sign in"><LoginPanel variant="lux" /></div>
        </div>
        <PanelFooter />
      </section>

      <section className="lx-scene" aria-hidden>
        <div className="lx-sky" />
        <div className="lx-eyebrow"><span>Evidence-linked</span><i /><span>Coder-approved</span><i /><span>Audit-ready</span></div>

        <div className="lx-arches">
          <div className="lx-par" style={{ ['--d' as any]: 10 }}><div className="arch a-back" /></div>
          <div className="lx-par" style={{ ['--d' as any]: 18 }}><div className="arch a-left" /></div>
          <div className="lx-par" style={{ ['--d' as any]: 24 }}><div className="arch a-right" /></div>
          <div className="lx-par lx-main" style={{ ['--d' as any]: 34 }}>
            <div className="arch a-main">
              <div className="lx-glass" />
              <ClinicalNote />
              <CodeCard s={CODES.e11} delay={1.3} />
              <CodeCard className="lx-c2" s={CODES.cpt} delay={2.0} />
            </div>
          </div>
          <div className="lx-light" />
          <Ecg className="lx-ecg" beats={6} />
          <div className="lx-floor" />
        </div>

        <div className="lx-copy">
          <h2>Intelligent Medical Coding.<br /><em>Smarter Revenue Cycles.</em></h2>
          <p>Transform clinical documentation into accurate, evidence-supported coding recommendations, with professional coders in control.</p>
        </div>
      </section>
      <Switcher current="lux" />
    </div>
  )
}
