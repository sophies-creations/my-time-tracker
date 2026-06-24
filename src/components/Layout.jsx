import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import TimerWidget from './TimerWidget'
import ManualEntryModal from './ManualEntryModal'

export default function Layout() {
  const location = useLocation()
  const isTrackerPage = location.pathname.startsWith('/tracker')
  const [modal, setModal] = useState({ open: false, entry: null })

  useEffect(() => {
    function onOpen(e) {
      setModal({ open: true, entry: e.detail?.entry ?? null })
    }
    window.addEventListener('manual-entry:open', onOpen)
    return () => window.removeEventListener('manual-entry:open', onOpen)
  }, [])

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        {/*
          Always keep TimerWidget mounted so its interval keeps ticking and
          timer:state events keep firing for the TopBar indicator.
          Hide it visually (display:none) on every page except Time Tracker.
        */}
        <div style={isTrackerPage ? undefined : { display: 'none' }}>
          <TimerWidget />
        </div>
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <Outlet />
        </main>
      </div>

      {modal.open && (
        <ManualEntryModal
          entry={modal.entry}
          onClose={() => setModal({ open: false, entry: null })}
          onSaved={() => {
            setModal({ open: false, entry: null })
            window.dispatchEvent(new CustomEvent('timeentry:saved'))
          }}
        />
      )}
    </div>
  )
}
