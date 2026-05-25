import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { DataProvider } from './contexts/DataContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'

const Login       = lazy(() => import('./pages/Login'))
const Tracker     = lazy(() => import('./pages/Tracker'))
const Projects    = lazy(() => import('./pages/Projects'))
const Reports     = lazy(() => import('./pages/Reports'))
const Team        = lazy(() => import('./pages/Team'))
const AcceptInvite = lazy(() => import('./pages/AcceptInvite'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
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
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route index element={<Navigate to="/tracker" replace />} />
                  <Route path="/tracker" element={<Tracker />} />
                  <Route path="/projects" element={<Projects />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/team" element={<Team />} />
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
