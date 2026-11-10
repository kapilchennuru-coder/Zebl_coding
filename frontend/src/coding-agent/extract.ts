import JSZip from 'jszip'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { CaseRec, NA } from './types'
import { findCdi, newId, suggestCodes, toIso } from './engine'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Everything in this file runs in the browser. Files are never uploaded anywhere. */
export const SUPPORTED: Record<string, string> = { pdf: 'PDF', docx: 'DOCX', txt: 'TXT', png: 'PNG', jpg: 'JPG', jpeg: 'JPG', tif: 'TIFF', tiff: 'TIFF' }
export const MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024
const MAX_TEXT_PAGES = 80
const MIME: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', tif: 'image/tiff', tiff: 'image/tiff', txt: 'text/plain', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }

export type Progress = { stage: string; done: number; total: number; current?: string }
export class UploadError extends Error {}

const sha = async (buf: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('')
export const hashFile = async (f: Blob) => sha(await f.arrayBuffer())
const tick = () => new Promise(r => setTimeout(r, 0))

async function pdfText(buf: ArrayBuffer) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise
  const pages: string[] = []
  for (let i = 1; i <= Math.min(doc.numPages, MAX_TEXT_PAGES); i++) {
    const tc = await (await doc.getPage(i)).getTextContent()
    let out = '', y: number | null = null
    for (const it of tc.items as any[]) {
      if (!('str' in it)) continue
      const yy = Math.round(it.transform[5])
      if (y !== null && Math.abs(yy - y) > 2) out += '\n'; else if (out && !out.endsWith(' ') && !out.endsWith('\n') && it.str && !it.str.startsWith(' ')) out += ' '
      out += it.str; y = yy
    }
    pages.push(out)
  }
  const n = doc.numPages; doc.destroy()
  return { pages, numPages: n }
}

async function docxText(buf: ArrayBuffer) {
  const mammoth: any = await import('mammoth/mammoth.browser')
  return ((await mammoth.extractRawText({ arrayBuffer: buf })).value as string) || ''
}

const find = (t: string, re: RegExp) => { const m = re.exec(t); return m ? m[1].trim().replace(/\s+/g, ' ') : null }
const DATE = '(\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})'
/** Reads identifying fields only where the document labels them. Anything else stays null and is shown as "Not available". */
export function parseFields(all: string) {
  const name = find(all, /\bPatient(?: Name)?\s*:\s*([^\n]+?)(?=\s+(?:DOB|Acct|Account|MRN|FIN|Age|Unit|Room|Loc|Sex|Gender)\b|\n|$)/i)
  const patientName = name && /[A-Za-z]{2,}/.test(name) && name.length < 60 ? name : null
  const dos = find(all, new RegExp(`(?:Date of Service|DOS|Service Date)\\s*:?\\s*${DATE}`, 'i')) || find(all, new RegExp(`(?:Dis(?:charge)? Date|ADM(?:it)? Date|Arrival Date)\\s*:?\\s*${DATE}`, 'i'))
  const age = /Age(?:\/Sex)?\s*:?\s*(\d{1,3})\s*(?:\/\s*([MF]))?/i.exec(all)
  const provider = find(all, /(?:Rendering Provider|Attending(?: Physician| Provider)?|Provider Name)\s*:\s*([A-Z][^\n]{2,50}?)(?=\s{2,}|\n|$)/)
  return {
    patientName, dos, dob: find(all, new RegExp(`\\bDOB\\s*:?\\s*${DATE}`, 'i')), ageSex: age ? `${age[1]}${age[2] ? ' / ' + age[2] : ''}` : null,
    fin: find(all, /\bFIN\s*:?\s*([A-Z0-9-]{4,})/i), mrn: find(all, /\bMRN\s*:?\s*([A-Z0-9-]{4,})/i), account: find(all, /\bAcct\s*:?\s*([A-Z0-9-]{4,})/i) || find(all, /\bAccount(?: Number| #)?\s*:?\s*([A-Z0-9-]{4,})/i),
    claimId: find(all, /\bClaim(?: ID| #| Number)?\s*:?\s*([A-Z0-9-]{4,})/i), encounter: find(all, /\bEncounter(?: ID| #| Number)?\s*:?\s*([A-Z0-9-]{4,})/i),
    provider, billing: find(all, /Billing Provider\s*:\s*([A-Z][^\n]{2,50}?)(?=\s{2,}|\n|$)/),
  }
}

export interface Ingested { cases: CaseRec[]; files: Map<string, Blob>; skipped: { name: string; reason: string }[]; hashes: string[]; zipHash: string }

export async function ingestZip(zipFile: File, batchId: string, knownHashes: Set<string>, onProgress: (p: Progress) => void): Promise<Ingested> {
  if (!/\.zip$/i.test(zipFile.name)) throw new UploadError('Only .zip files can be uploaded here.')
  if (!zipFile.size) throw new UploadError('This file is empty.')
  if (zipFile.size > MAX_ZIP_BYTES) throw new UploadError('This ZIP is larger than 2 GB. Split it into smaller batches.')
  onProgress({ stage: 'Reading ZIP', done: 0, total: 1 })
  const zipHash = await hashFile(zipFile)
  if (knownHashes.has(zipHash)) throw new UploadError('This exact ZIP file was already uploaded. Archive the existing batch first if you want to upload it again.')
  let zip: JSZip
  try { zip = await JSZip.loadAsync(zipFile) } catch { throw new UploadError('This file is not a valid ZIP archive, or it is corrupted or password protected.') }
  const entries = Object.values(zip.files).filter(f => !f.dir && !/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|~\$)/i.test(f.name) && !/(^|\/)\./.test(f.name.split('/').pop()!))
  if (!entries.length) throw new UploadError('The ZIP does not contain any files.')
  const skipped: Ingested['skipped'] = [], files = new Map<string, Blob>(), cases: CaseRec[] = [], seen = new Set<string>(), hashes: string[] = []
  const seq = batchId.split('-').pop()
  let n = 0
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i], base = e.name.split('/').pop()!, ext = base.split('.').pop()!.toLowerCase()
    onProgress({ stage: 'Extracting and reading documents', done: i, total: entries.length, current: base })
    if (!SUPPORTED[ext]) { skipped.push({ name: base, reason: 'Unsupported file type' }); continue }
    const buf = await e.async('arraybuffer')
    if (!buf.byteLength) { skipped.push({ name: base, reason: 'Empty file' }); continue }
    const h = await sha(buf)
    if (seen.has(h)) { skipped.push({ name: base, reason: 'Duplicate of another file in this ZIP' }); continue }
    if (knownHashes.has(h)) { skipped.push({ name: base, reason: 'Already uploaded in an earlier batch' }); continue }
    seen.add(h); hashes.push(h)
    const docId = `DOC-${seq}-${String(++n).padStart(3, '0')}`
    let pageText: string[] = [], pages: number | null = null, processing: CaseRec['processing'] = 'Processed'
    try {
      if (ext === 'pdf') { const r = await pdfText(buf); pageText = r.pages; pages = r.numPages }
      else if (ext === 'docx') pageText = [await docxText(buf)]
      else if (ext === 'txt') pageText = [new TextDecoder().decode(buf)]
      else { processing = 'Preview only'; pages = 1 }
      if (processing === 'Processed' && pageText.join('').replace(/\s/g, '').length < 40) processing = 'Needs OCR'
    } catch { processing = 'Error' }
    const all = pageText.join('\n'), f = parseFields(all), stem = base.replace(/\.[^.]+$/, '')
    const dosIso = toIso(f.dos)
    const idUncertain = processing !== 'Preview only' ? !f.patientName || !f.dos : true
    const codes = processing === 'Processed' ? suggestCodes(pageText) : []
    const rec: CaseRec = {
      id: docId, batchId, docId, fileName: base, fileType: SUPPORTED[ext], size: buf.byteLength, pages, encounterId: f.encounter || f.fin || f.account || stem, encounterExtracted: !!(f.encounter || f.fin || f.account),
      patientName: f.patientName, dob: f.dob, ageSex: f.ageSex, fin: f.fin, mrn: f.mrn, account: f.account, claimId: f.claimId, dos: f.dos, dosIso, provider: f.provider, billingProvider: f.billing,
      processing, idUncertain, holdReason: idUncertain ? (processing === 'Preview only' ? 'Image or scan: patient details must be entered manually.' : processing === 'Error' ? 'The document could not be read.' : 'Patient identification could not be confirmed from the document.') : null,
      status: idUncertain ? 'On Hold' : 'Unassigned', coder: null, priority: 'Routine', codes, cdi: [], synthetic: false, pageText,
    }
    rec.cdi = findCdi(rec)
    cases.push(rec); files.set(docId, new Blob([buf], { type: MIME[ext] }))
    if (i % 3 === 0) await tick()
  }
  onProgress({ stage: 'Finalising', done: entries.length, total: entries.length })
  if (!cases.length) throw new UploadError(`No supported documents were found. Supported: ${Object.values(SUPPORTED).filter((v, i, a) => a.indexOf(v) === i).join(', ')}.`)
  return { cases, files, skipped, hashes: [...hashes, zipHash], zipHash }
}
export const display = (v: string | null | undefined) => v || NA
export { newId }
