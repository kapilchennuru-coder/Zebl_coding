import { useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, PanelLeft, Search, ZoomIn, ZoomOut } from 'lucide-react'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

type Span = { start: number; end: number; it: any }
type Rect = { left: number; top: number; width: number; height: number }
const squash = (t: string) => t.replace(/\s+/g, ' ').trim()

/** Joins the page's text items into one string and remembers where each item sits in it. */
function pageText(items: any[]) {
  let text = ''
  const spans: Span[] = []
  for (const it of items) {
    if (!('str' in it)) continue
    const s = squash(it.str)
    if (!s) continue
    if (text) text += ' '
    spans.push({ start: text.length, end: text.length + s.length, it: { ...it, str: s } })
    text += s
  }
  return { text: text.toLowerCase(), spans }
}

/** Rectangles for every occurrence of needle. Positions come from the PDF's own text layout, so nothing is guessed. */
function findRects(text: string, spans: Span[], needle: string, viewport: any): Rect[] {
  const out: Rect[] = []
  const n = squash(needle).toLowerCase()
  if (n.length < 2) return out
  for (let i = text.indexOf(n); i !== -1; i = text.indexOf(n, i + n.length)) {
    const j = i + n.length
    for (const sp of spans) {
      if (sp.end <= i || sp.start >= j) continue
      const len = Math.max(1, sp.end - sp.start)
      const a = (Math.max(i, sp.start) - sp.start) / len, b = (Math.min(j, sp.end) - sp.start) / len
      const tx = pdfjs.Util.transform(viewport.transform, sp.it.transform)
      const h = Math.hypot(tx[2], tx[3]), w = sp.it.width * viewport.scale
      out.push({ left: tx[4] + w * a, top: tx[5] - h * 0.88, width: Math.max(2, w * (b - a)), height: h * 1.12 })
    }
  }
  return out
}

function Page({ pdf, num, scale, evidence, query, report, hold }: any) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 612 * scale, h: 792 * scale }), [layout, setLayout] = useState<any>(null)
  useEffect(() => {
    let task: any, dead = false
    pdf.getPage(num).then(async (page: any) => {
      const vp = page.getViewport({ scale }), ratio = window.devicePixelRatio || 1, c = canvas.current
      if (dead || !c) return
      c.width = vp.width * ratio; c.height = vp.height * ratio
      setSize({ w: vp.width, h: vp.height })
      task = page.render({ canvasContext: c.getContext('2d')!, viewport: vp, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined })
      const content = await page.getTextContent()
      await task.promise.catch(() => {})
      if (!dead) setLayout({ vp, ...pageText(content.items) })
    })
    return () => { dead = true; task?.cancel() }
  }, [pdf, num, scale])
  const ev = useMemo(() => (layout && evidence ? findRects(layout.text, layout.spans, evidence, layout.vp) : []), [layout, evidence])
  const hits = useMemo(() => (layout && query ? findRects(layout.text, layout.spans, query, layout.vp) : []), [layout, query])
  useEffect(() => { if (layout) report(num, ev.length > 0, hits.length) }, [layout, ev.length, hits.length]) // eslint-disable-line
  return (
    <div ref={hold} data-page={num} className="relative !bg-white shadow-card mx-auto mb-3 border border-line" style={{ width: size.w, height: size.h }}>
      <canvas ref={canvas} style={{ width: size.w, height: size.h }} />
      {hits.map((r, i) => <div key={'q' + i} className="absolute rounded-sm bg-sky/30 pointer-events-none" style={r} />)}
      {ev.map((r, i) => <div key={'e' + i} data-evidence className="absolute rounded-sm bg-amber/40 ring-1 ring-amber/70 pointer-events-none" style={r} />)}
    </div>
  )
}

function Thumb({ pdf, num, active, onClick }: any) {
  const c = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let task: any, dead = false
    pdf.getPage(num).then((page: any) => {
      const vp = page.getViewport({ scale: 0.2 })
      if (dead || !c.current) return
      c.current.width = vp.width; c.current.height = vp.height
      task = page.render({ canvasContext: c.current.getContext('2d')!, viewport: vp })
    })
    return () => { dead = true; task?.cancel() }
  }, [pdf, num])
  return <button onClick={onClick} aria-label={`Go to page ${num}`} className={`grid gap-1 justify-items-center p-1.5 rounded-lg ${active ? 'bg-wine-soft ring-1 ring-wine' : 'hover:bg-canvas'}`}><canvas ref={c} className="border border-line bg-white" /><span className="text-[11px] text-muted tnum">{num}</span></button>
}

export default function PdfViewer({ url, evidence, nonce, onFound }: { url: string; evidence?: string; nonce?: number; onFound?: (found: boolean | null) => void }) {
  const [pdf, setPdf] = useState<any>(null), [err, setErr] = useState(''), [scale, setScale] = useState(1.15), [query, setQuery] = useState(''), [thumbs, setThumbs] = useState(false)
  const [full, setFull] = useState(false), [cur, setCur] = useState(1), [found, setFound] = useState<Record<number, { ev: boolean; n: number }>>({})
  const box = useRef<HTMLDivElement>(null), scroller = useRef<HTMLDivElement>(null), pages = useRef<Record<number, HTMLDivElement | null>>({}), want = useRef(0)
  useEffect(() => {
    setPdf(null); setErr(''); setFound({})
    const task = pdfjs.getDocument({ url, httpHeaders: { 'X-ZEBL-CSRF': '1' }, withCredentials: true })
    task.promise.then(async (d: any) => { const w = (await d.getPage(1)).getViewport({ scale: 1 }).width; setScale(Math.max(.6, Math.min(1.6, +(((scroller.current?.clientWidth || 620) - 32) / w).toFixed(2)))); setPdf(d) }).catch((e: any) => setErr(e?.message || 'The document could not be opened.'))
    return () => { task.destroy() }
  }, [url])
  useEffect(() => { const f = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f) }, [])
  const go = (n: number) => { const el = pages.current[n]; if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' }) }
  const report = (num: number, ev: boolean, n: number) => setFound(f => (f[num]?.ev === ev && f[num]?.n === n ? f : { ...f, [num]: { ev, n } }))
  // An evidence click asks for a scroll. The target page is only known once its text layer has loaded, so wait for it.
  useEffect(() => { want.current = evidence ? nonce || 1 : 0 }, [evidence, nonce])
  useEffect(() => {
    if (!evidence || !pdf) { onFound?.(null); return }
    const first = Object.keys(found).map(Number).sort((a, b) => a - b).find(n => found[n].ev)
    const loaded = Object.keys(found).length >= pdf.numPages
    if (first && want.current) { go(first); want.current = 0 }
    onFound?.(first ? true : loaded ? false : null)
  }, [found, evidence, nonce, pdf]) // eslint-disable-line
  const onScroll = () => {
    const top = (scroller.current?.scrollTop || 0) + 80
    let best = 1
    Object.entries(pages.current).forEach(([n, el]) => { if (el && el.offsetTop <= top) best = +n })
    setCur(best)
  }
  const total = Object.values(found).reduce((a, f) => a + f.n, 0), N = pdf?.numPages || 0
  const btn = 'w-8 h-8 grid place-items-center rounded-lg hover:bg-canvas disabled:opacity-40'
  return (
    <div ref={box} className="flex flex-col h-full min-h-0 bg-sky-aqua/50">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 bg-white border-b border-line text-[13px]">
        <button className={btn} aria-label="Toggle thumbnails" aria-pressed={thumbs} onClick={() => setThumbs(!thumbs)}><PanelLeft size={16} /></button>
        <button className={btn} aria-label="Previous page" disabled={cur <= 1} onClick={() => go(cur - 1)}><ChevronLeft size={16} /></button>
        <span className="tnum min-w-[58px] text-center">{N ? `${cur} / ${N}` : '...'}</span>
        <button className={btn} aria-label="Next page" disabled={cur >= N} onClick={() => go(cur + 1)}><ChevronRight size={16} /></button>
        <span className="w-px h-5 bg-line mx-1" />
        <button className={btn} aria-label="Zoom out" onClick={() => setScale(s => Math.max(.6, +(s - .15).toFixed(2)))}><ZoomOut size={16} /></button>
        <span className="tnum w-11 text-center">{Math.round(scale * 100)}%</span>
        <button className={btn} aria-label="Zoom in" onClick={() => setScale(s => Math.min(2.4, +(s + .15).toFixed(2)))}><ZoomIn size={16} /></button>
        <div className="relative ml-auto"><Search size={14} className="absolute left-2.5 top-[9px] text-muted" /><input aria-label="Search in document" className="field !h-8 !w-40 pl-8 !text-[13px]" placeholder="Search text" value={query} onChange={e => setQuery(e.target.value)} /></div>
        {query.length > 1 && <span className="text-[12px] text-muted tnum">{total} match{total === 1 ? '' : 'es'}</span>}
        <button className={btn} aria-label={full ? 'Exit full screen' : 'Full screen'} onClick={() => (full ? document.exitFullscreen() : box.current?.requestFullscreen())}>{full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
      </div>
      <div className="flex flex-1 min-h-0">
        {thumbs && pdf && <div className="w-[88px] shrink-0 overflow-auto bg-white border-r border-line p-1 grid content-start gap-1">{Array.from({ length: N }, (_, i) => <Thumb key={i} pdf={pdf} num={i + 1} active={cur === i + 1} onClick={() => go(i + 1)} />)}</div>}
        <div ref={scroller} onScroll={onScroll} className="flex-1 overflow-auto p-3">
          {err && <div className="bg-bad-soft text-bad rounded-lg p-3 text-[13px]">{err}</div>}
          {!pdf && !err && <div className="text-muted text-center py-10">Opening document...</div>}
          {pdf && Array.from({ length: N }, (_, i) => <Page key={i} pdf={pdf} num={i + 1} scale={scale} evidence={evidence} query={query.length > 1 ? query : ''} report={report} hold={(el: any) => (pages.current[i + 1] = el)} />)}
        </div>
      </div>
    </div>
  )
}
