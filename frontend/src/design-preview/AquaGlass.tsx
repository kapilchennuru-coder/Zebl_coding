import { useRef } from 'react'
import { Activity, ClipboardList, HeartPulse, Pill, ShieldCheck, Sparkles, Stethoscope } from 'lucide-react'
import { LoginPanel, PanelFooter, Switcher, Wordmark, useParallax } from './shared'
import { CODES, CodeCard, ClinicalNote, Ecg } from './visuals'

/** Floating glass medical icon. Outer element = parallax, inner = float, so the two transforms never fight. */
const Bubble = ({ icon: I, x, y, size, depth, delay }: any) => (
  <div className="aq-par" style={{ left: x, top: y, ['--d' as any]: depth }}>
    <div className="aq-bubble" style={{ width: size, height: size, animationDelay: `${delay}s` }}><I size={size * 0.42} strokeWidth={1.5} /></div>
  </div>
)

/** The full Aqua Glass scene. `children` is the card content, so the real app login and the prototype share one scene. */
export function AquaShell({ children, switcher = true }: { children: React.ReactNode; switcher?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  useParallax(root)
  return (
    <div className="dp aq" ref={root}>
      {/* Atmosphere */}
      <div className="aq-bg" aria-hidden>
        <span className="orb o1" /><span className="orb o2" /><span className="orb o3" /><span className="orb o4" />
        {/* Blurred healthcare silhouettes: a cross and a stethoscope curve */}
        <svg className="sil s1" viewBox="0 0 200 200"><path d="M80 20h40v60h60v40h-60v60H80v-60H20V80h60z" /></svg>
        <svg className="sil s2" viewBox="0 0 240 240" fill="none" strokeLinecap="round"><path d="M50 30v70a50 50 0 0 0 100 0V30M100 150v20a40 40 0 0 0 80 0v-30" strokeWidth="14" /><circle cx="180" cy="120" r="20" strokeWidth="14" /></svg>
        <div className="aq-gloss" />
      </div>
      <div className="aq-icons" aria-hidden>
        <Bubble icon={Stethoscope} x="2.5%" y="13%" size={84} depth={34} delay={0} />
        <Bubble icon={HeartPulse} x="90%" y="18%" size={72} depth={-28} delay={-2.5} />
        <Bubble icon={Pill} x="4%" y="68%" size={60} depth={-20} delay={-4.5} />
        <Bubble icon={ShieldCheck} x="92%" y="64%" size={78} depth={30} delay={-1.5} />
        <Bubble icon={ClipboardList} x="23%" y="10%" size={52} depth={-14} delay={-3.5} />
        <Bubble icon={Activity} x="76%" y="9%" size={50} depth={16} delay={-5.5} />
      </div>
      <Ecg className="aq-ecg" beats={9} />

      <header className="aq-top"><Wordmark variant="aqua" size={42} /></header>

      <main className="aq-stage">
        <aside className="aq-side aq-left" aria-hidden>
          <div className="aq-par" style={{ ['--d' as any]: 14 }}>
            <div className="aq-panel aq-doc"><ClinicalNote /></div>
            <div className="aq-chip"><Sparkles size={13} />Reading note and linking evidence</div>
          </div>
        </aside>

        <section className="aq-card" aria-label="Sign in">
          <div className="aq-card-inner">{children}</div>
        </section>

        <aside className="aq-side aq-right" aria-hidden>
          <div className="aq-par" style={{ ['--d' as any]: -14 }}>
            <div className="aq-stack">
              <CodeCard s={CODES.e11} delay={1.2} />
              <CodeCard s={CODES.i10} delay={1.8} />
              <CodeCard s={CODES.cpt} delay={2.4} />
            </div>
            <div className="aq-chip"><ShieldCheck size={13} />Evidence linked. Coder approves.</div>
          </div>
        </aside>
      </main>

      <section className="aq-tag">
        <h2>Intelligent Medical Coding. <span>Smarter Revenue Cycles.</span></h2>
        <p>Transform clinical documentation into accurate, evidence-supported coding recommendations, with professional coders in control.</p>
      </section>
      {switcher && <Switcher current="aqua" />}
    </div>
  )
}

export default function AquaGlass() {
  return <AquaShell><LoginPanel variant="aqua" /><PanelFooter /></AquaShell>
}
