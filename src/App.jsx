import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { DataProvider } from './contexts/DataContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'

const Login         = lazy(() => import('./pages/Login'))
const AcceptInvite  = lazy(() => import('./pages/AcceptInvite'))
const Tracker       = lazy(() => import('./pages/Tracker'))
const Dashboard     = lazy(() => import('./pages/Dashboard'))
const Reports       = lazy(() => import('./pages/Reports'))
const Calendar      = lazy(() => import('./pages/Calendar'))
const Projects      = lazy(() => import('./pages/Projects'))
const Clients       = lazy(() => import('./pages/Clients'))
const Tags          = lazy(() => import('./pages/Tags'))
const Team          = lazy(() => import('./pages/Team'))
const ClientPortal  = lazy(() => import('./pages/ClientPortal'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/accept-invite" element={<AcceptInvite />} />

              {/* Client portal */}
              <Route element={<ProtectedRoute clientOnly />}>
                <Route path="/client" element={<ClientPortal />} />
              </Route>

              {/* Main app */}
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route index element={<Navigate to="/tracker" replace />} />
                  <Route path="/tracker"   element={<Tracker />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/reports"   element={<Reports />} />
                  <Route path="/calendar"  element={<Calendar />} />
                  <Route path="/projects"  element={<Projects />} />
                  <Route path="/clients"   element={<Clients />} />
                  <Route path="/tags"      element={<Tags />} />
                  <Route path="/team"      element={<Team />} />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
