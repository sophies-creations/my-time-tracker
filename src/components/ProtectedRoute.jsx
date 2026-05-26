import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ clientOnly = false }) {
  const { user, profile, loading, signOut } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-orchid-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (profile?.active === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-slate-800 mb-2">Account Deactivated</h1>
          <p className="text-sm text-slate-500 mb-5">
            Your account has been deactivated. Please contact your workspace administrator.
          </p>
          <button
            onClick={signOut}
            className="text-sm text-orchid-600 hover:text-orchid-700 font-medium"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  const isClient = profile?.role === 'client'

  if (clientOnly && !isClient) return <Navigate to="/tracker" replace />
  if (!clientOnly && isClient) return <Navigate to="/client" replace />

  return <Outlet />
}
