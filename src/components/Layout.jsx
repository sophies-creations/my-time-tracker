import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import TimerWidget from './TimerWidget'
import ManualEntryModal from './ManualEntryModal'

const BAR_HEIGHT_PX  = 56  // h-14
const PEEK_HEIGHT_PX = 8
const TOPBAR_HEIGHT_PX = 48  // h-12

export default function Layout() {
  const { user } = useAuth()
  const location = useLocation()
  const isTrackerPage = location.pathname.startsWith('/tracker')

  const [modal, setModal] = useState({ open: false, entry: null })
  const [hovering, setHovering] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)

  const pinKey = user ? `tt-timer-pinned:${user.id}` : null
  const [pinned, setPinned] = useState(() => {
    if (typeof window === 'undefined' || !pinKey) return false
    return localStorage.getItem(pinKey) === '1'
  })

  useEffect(() => {
    if (pinKey) localStorage.setItem(pinKey, pinned ? '1' : '0')
  }, [pinned, pinKey])

  const canCollapse = !isTrackerPage && !pinned
  const showTimer   = !canCollapse || hovering || focusWithin

  // Main reserves only the space that's always visible: full bar height
  // when always-shown (tracker / pinned), peek strip otherwise. The bar
  // itself is an absolute overlay so revealing it via hover does not
  // shift the page content.
  const reservedTopPx = isTrackerPage || pinned ? BAR_HEIGHT_PX : PEEK_HEIGHT_PX

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
      <div className="flex flex-col flex-1 min-w-0 relative">
        <TopBar />
        <main
          className="flex-1 overflow-y-auto px-6 pb-6"
          style={{ paddingTop: `${reservedTopPx + 24}px` }}
        >
          <Outlet />
        </main>
        <div
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onFocus={() => setFocusWithin(true)}
          onBlur={() => setFocusWithin(false)}
          className="absolute left-0 right-0 z-20 transition-[height] duration-200"
          style={{
            top: `${TOPBAR_HEIGHT_PX}px`,
            height: `${showTimer ? BAR_HEIGHT_PX : PEEK_HEIGHT_PX}px`,
          }}
        >
          <div
            className="absolute inset-x-0 top-0 transition-transform duration-200"
            style={{ transform: showTimer ? 'translateY(0)' : `translateY(-${BAR_HEIGHT_PX}px)` }}
          >
            <TimerWidget
              pinned={pinned}
              onTogglePin={() => setPinned(p => !p)}
              showPinControl={!isTrackerPage}
            />
          </div>
          {canCollapse && !showTimer && (
            <div className="absolute inset-x-0 bottom-0 h-2 bg-orchid-100/70 flex items-center justify-center pointer-events-none">
              <span className="block w-10 h-0.5 rounded-full bg-orchid-300" />
            </div>
          )}
        </div>
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
