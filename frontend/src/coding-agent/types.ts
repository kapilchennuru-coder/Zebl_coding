/** Frontend-only data model for the Coding Agent module. Replace the store/engine with API calls later; these types are the integration boundary. */

export type Status = 'Unassigned' | 'Assigned' | 'In Progress' | 'Pending QA' | 'Rejected' | 'Escalated' | 'On Hold' | 'Approved' | 'Completed'
export const STATUSES: Status[] = ['Unassigned', 'Assigned', 'In Progress', 'Pending QA', 'Rejected', 'Escalated', 'On Hold', 'Approved', 'Completed']
export type Priority = 'Routine' | 'High' | 'Urgent'
export type System = 'ICD-10-CM' | 'CPT' | 'HCPCS'

export interface CodeItem {
  id: string
  system: System
  code: string
  desc: string
  /** Sentence from the document that supports the code. Empty for coder-added codes. */
  evidence: string
  /** Exact phrase matched in the document; used to highlight it in the PDF viewer. */
  term: string
  page: number | null
  source: 'Mock rule engine' | 'Coder' | 'Synthetic'
  rec: 'Suggested' | 'Accepted' | 'Rejected'
  validation: 'Valid' | 'Review' | 'Warning'
  note?: string
  pointer?: string
  modifiers: string[]
}

export interface CdiIssue {
  id: string
  type: string
  severity: 'High' | 'Medium' | 'Low'
  passage: string
  page: number | null
  action: string
  status: 'Open' | 'Acknowledged' | 'Resolved' | 'Dismissed'
}

export interface CaseRec {
  id: string
  batchId: string
  docId: string
  fileName: string
  fileType: string
  size: number
  pages: number | null
  encounterId: string
  encounterExtracted: boolean
  patientName: string | null
  dob: string | null
  ageSex: string | null
  fin: string | null
  mrn: string | null
  account: string | null
  claimId: string | null
  dos: string | null
  dosIso: string | null
  provider: string | null
  billingProvider: string | null
  processing: 'Processed' | 'Needs OCR' | 'Preview only' | 'Error'
  idUncertain: boolean
  holdReason: string | null
  status: Status
  coder: string | null
  priority: Priority
  codes: CodeItem[]
  cdi: CdiIssue[]
  synthetic: boolean
  /** Extracted text per page. Kept in memory only (may contain PHI), never persisted. */
  pageText: string[]
}

export interface Batch {
  id: string
  jobId: string
  source: string
  uploadedAt: string
  archived: boolean
  processing: 'Processing' | 'Ready'
  caseIds: string[]
  skipped: { name: string; reason: string }[]
  synthetic: boolean
  /** Hashes of the ZIP and member files, for duplicate detection. */
  hashes: string[]
}

export const NA = 'Not available'
