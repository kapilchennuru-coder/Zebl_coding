import { CSSProperties } from 'react'
import { Check, FileText, Link2 } from 'lucide-react'

/** Generic sample codes only. No patient data anywhere in these prototypes. */
export interface CodeSample { sys: string; code: string; desc: string; conf: number; evidence: string }
export const CODES: Record<string, CodeSample> = {
  e11: { sys: 'ICD-10-CM', code: 'E11.65', desc: 'Type 2 diabetes mellitus with hyperglycemia', conf: 97, evidence: 'A/P · line 1' },
  i10: { sys: 'ICD-10-CM', code: 'I10', desc: 'Essential (primary) hypertension', conf: 94, evidence: 'A/P · line 3' },
  cpt: { sys: 'CPT', code: '99214', desc: 'Office visit, established patient, moderate MDM', conf: 92, evidence: 'Plan · line 5' },
  hcpcs: { sys: 'HCPCS', code: 'J3301', desc: 'Triamcinolone acetonide, per 10 mg', conf: 89, evidence: 'Proc · line 6' },
}

const css = (v: Record<string, string | number>) => v as CSSProperties

/** Confidence ring. The fill animates from the --c custom property. */
export function Ring({ value, size = 34 }: { value: number; size?: number }) {
  return (
    <span className="v-ring" style={css({ '--c': value / 100, width: size, height: size })} aria-label={`${value}% confidence`}>
      <svg viewBox="0 0 36 36" aria-hidden><circle className="t" cx="18" cy="18" r="15" /><circle className="f" cx="18" cy="18" r="15" pathLength="1" /></svg>
      <b>{value}</b>
    </span>
  )
}

/** A result card for one proposed code with its linked evidence. */
export function CodeCard({ s, delay = 0, className = '', style }: { s: CodeSample; delay?: number; className?: string; style?: CSSProperties }) {
  return (
    <article className={`v-code ${className}`} style={{ ...style, ['--d' as any]: `${delay}s` }}>
      <span className="v-code-tick"><Check size={13} strokeWidth={3} /></span>
      <div className="v-code-body">
        <div className="v-code-sys">{s.sys}</div>
        <div className="v-code-val">{s.code}</div>
        <div className="v-code-desc">{s.desc}</div>
        <div className="v-code-ev"><Link2 size={11} />{s.evidence}</div>
      </div>
      <Ring value={s.conf} />
    </article>
  )
}

/** A clinical note with the phrases that support each code highlighted. */
export function ClinicalNote({ className = '', scan = true }: { className?: string; scan?: boolean }) {
  return (
    <div className={`v-note ${className}`} aria-hidden>
      <div className="v-note-head"><span className="v-note-ico"><FileText size={14} /></span><div><b>Progress note</b><small>Sample document · Established visit</small></div></div>
      <div className="v-note-body">
        <p><span className="lbl">A/P</span><mark className="m1">Type 2 diabetes mellitus with hyperglycemia</mark>, A1c 9.4%.</p>
        <i style={css({ '--w': '86%' })} /><i style={css({ '--w': '64%' })} />
        <p><span className="lbl">Dx</span><mark className="m2">Essential hypertension</mark>, stable on current regimen.</p>
        <i style={css({ '--w': '78%' })} />
        <p><span className="lbl">Plan</span><mark className="m3">Moderate complexity decision making</mark>; adjust therapy.</p>
        <i style={css({ '--w': '58%' })} /><i style={css({ '--w': '72%' })} />
      </div>
      {scan && <span className="v-scan" />}
    </div>
  )
}

/** Repeating ECG trace. pathLength is normalised so one CSS animation works at any width. */
export function Ecg({ className = '', beats = 8 }: { className?: string; beats?: number }) {
  const beat = 'h70 l8 -6 l8 6 h16 l6 6 l10 -46 l12 62 l8 -22 h24 l12 -10 l14 10 h72'
  const d = `M0 60 ${Array.from({ length: beats }, () => beat).join(' ')}`
  return (
    <svg className={`v-ecg ${className}`} viewBox={`0 0 ${beats * 260} 120`} preserveAspectRatio="none" fill="none" aria-hidden>
      <path className="ghost" d={d} pathLength="1" vectorEffect="non-scaling-stroke" />
      <path className="live" d={d} pathLength="1" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
