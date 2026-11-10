export async function api(path: string, opts: { method?: string; body?: any; form?: FormData } = {}): Promise<any> {
  const res = await fetch('/api' + path, {
    method: opts.method || (opts.body || opts.form ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers: { 'X-ZEBL-CSRF': '1', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.form || (opts.body ? JSON.stringify(opts.body) : undefined),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new CustomEvent('zebl-auth-lost', { detail: data.detail }))
    const detail = Array.isArray(data.detail) ? 'Check the highlighted fields and try again.' : data.detail
    throw Object.assign(new Error(detail || 'Something went wrong. Try again.'), { status: res.status })
  }
  return data
}

export const qs = (o: Record<string, any>) => {
  const p = new URLSearchParams()
  Object.entries(o).forEach(([k, v]) => { if (v !== '' && v !== undefined && v !== null) p.set(k, String(v)) })
  const s = p.toString()
  return s ? '?' + s : ''
}
