import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import TimerWidget from './TimerWidget'
import ManualEntryModal from './ManualEntryModal'

export default function Layout() {
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
        <TimerWidget />
        <main className="flex-1 overflow-y-auto p-6">
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
