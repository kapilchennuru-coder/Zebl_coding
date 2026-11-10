import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './index.css'
import { api } from './api'
import Login from './Login'
import Shell from './Shell'
import Workspace from './Workspace'
import { DocumentsPage } from './Documents'
import CodingCases from './coding-agent/CodingCases'
import BatchDetail from './coding-agent/BatchDetail'
import CaseWorkspace from './coding-agent/CaseWorkspace'
import * as P from './pages'
import { AuthCtx, Empty, Spinner, ToastCtx, useAuth } from './ui'

function Guard({ perm, children }: any) {
  const { user, can } = useAuth(), loc = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (perm && ![perm].flat().some(can)) return <Empty>You don't have access to this page.</Empty>
  return children
}

function App() {
  const [user, setUser] = useState<any>(undefined), [toast, setToast] = useState(''), nav = useNavigate()
  useEffect(() => { api('/auth/me').then(setUser).catch(() => setUser(null)) }, [])
  useEffect(() => {
    const lost = (e: any) => { setUser(null); nav(e.detail === 'session_expired' ? '/login?expired=1' : '/login') }
    window.addEventListener('zebl-auth-lost', lost); return () => window.removeEventListener('zebl-auth-lost', lost)
  }, [nav])
  const show = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 2800) }, [])
  const ctx = useMemo(() => ({ user, setUser, can: (p: string) => !!user?.permissions.includes(p) }), [user])
  if (user === undefined) return <Spinner />
  const r = (path: string, el: any, perm?: any) => <Route path={path} element={<Guard perm={perm}>{el}</Guard>} />
  return (
    <AuthCtx.Provider value={ctx}><ToastCtx.Provider value={show}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route element={<Guard><Shell /></Guard>}>
          {r('/', <P.Dashboard />, 'dashboard.view')}{r('/tasks', <P.Tasks />)}{r('/casecraft', <P.CaseCraft />, 'casecraft.use')}{r('/queues', <P.Queues />, 'queues.view')}{r('/coding-agent', <CodingCases />, 'queues.view')}{r('/coding-agent/:batchId', <BatchDetail />, 'queues.view')}{r('/coding-agent/:batchId/case/:caseId', <CaseWorkspace />, 'queues.view')}
          {r('/qa', <P.QaQueue />, 'qa.review')}{r('/qa/:id', <Workspace />, 'qa.review')}{r('/documents/:view', <DocumentsPage />, 'documents.view')}{r('/patients', <P.Patients />, 'patients.view')}{r('/patients/:id', <P.PatientDetail />, 'patients.view')}
          {r('/encounters', <P.Encounters />, 'encounters.view')}{r('/encounters/:id', <P.EncounterDetail />, 'encounters.view')}{r('/workspace/:id', <Workspace />, 'encounters.view')}
          {r('/codes/:system', <P.Codes />, 'codes.view')}{r('/ar', <P.ArFollowup />, 'ar.view')}{r('/policies', <P.Policies />, 'policy.view')}{r('/upload', <P.UploadPage />, 'uploads.manage')}{r('/uploads', <P.Uploads />, 'uploads.view')}
          {r('/insights', <P.Insights />, 'analytics.view')}{r('/reports', <P.Reports />, 'reports.view')}{r('/users', <P.UsersPage />, ['users.manage_org', 'users.manage_all'])}{r('/audit', <P.Audit />, 'audit.view')}{r('/settings', <P.SettingsPage />)}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {toast && <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[60] bg-aubergine text-white rounded-[10px] px-4 py-2.5 text-[13.5px] shadow-float rise">{toast}</div>}
    </ToastCtx.Provider></AuthCtx.Provider>
  )
}

class Boundary extends React.Component<any, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <div className="min-h-screen grid place-items-center p-6 text-center"><div><h1 className="text-xl font-semibold mb-2">This page hit a problem</h1><p className="text-muted mb-3">Your saved work is safe. Reload to continue.</p><button className="text-wine font-semibold" onClick={() => location.reload()}>Reload</button></div></div>
  }
}

/** Design-selection prototypes live outside <App /> so they never touch real authentication. */
const DesignPreview = React.lazy(() => import('./design-preview'))
const Root = () => (
  <Routes>
    <Route path="/design-preview/*" element={<React.Suspense fallback={null}><DesignPreview /></React.Suspense>} />
    <Route path="*" element={<App />} />
  </Routes>
)

createRoot(document.getElementById('root')!).render(<React.StrictMode><Boundary><BrowserRouter><Root /></BrowserRouter></Boundary></React.StrictMode>)
