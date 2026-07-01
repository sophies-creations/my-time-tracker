import { createContext, useContext, useEffect, useState } from 'react'
import { startOfDay } from 'date-fns'
import { useAuth } from './AuthContext'

const ReportsFilterContext = createContext(null)

const defaultRange = () => ({ from: startOfDay(new Date()), to: startOfDay(new Date()) })

export function ReportsFilterProvider({ children }) {
  const { user } = useAuth()

  const [tab, setTab] = useState('summary')
  const [range, setRange] = useState(defaultRange)

  const [filterProjects,    setFilterProjects]    = useState([])
  const [filterUsers,       setFilterUsers]       = useState([])
  const [filterClients,     setFilterClients]     = useState([])
  const [filterDescription, setFilterDescription] = useState('')
  const [filterStatus,      setFilterStatus]      = useState('completed')

  const [stagedProjects,    setStagedProjects]    = useState([])
  const [stagedUsers,       setStagedUsers]       = useState([])
  const [stagedClients,     setStagedClients]     = useState([])
  const [stagedDescription, setStagedDescription] = useState('')
  const [stagedStatus,      setStagedStatus]      = useState('completed')

  const [groupBy,     setGroupBy]     = useState('project')
  const [secondaryBy, setSecondaryBy] = useState('none')
  const [tertiaryBy,  setTertiaryBy]  = useState('none')
  const [descFilter,  setDescFilter]  = useState('all')

  // Session-only: clear everything back to defaults on logout.
  useEffect(() => {
    if (user) return
    setTab('summary')
    setRange(defaultRange())
    setFilterProjects([]); setFilterUsers([]); setFilterClients([]); setFilterDescription(''); setFilterStatus('completed')
    setStagedProjects([]); setStagedUsers([]); setStagedClients([]); setStagedDescription(''); setStagedStatus('completed')
    setGroupBy('project'); setSecondaryBy('none'); setTertiaryBy('none'); setDescFilter('all')
  }, [user])

  return (
    <ReportsFilterContext.Provider value={{
      tab, setTab,
      range, setRange,
      filterProjects, setFilterProjects,
      filterUsers, setFilterUsers,
      filterClients, setFilterClients,
      filterDescription, setFilterDescription,
      filterStatus, setFilterStatus,
      stagedProjects, setStagedProjects,
      stagedUsers, setStagedUsers,
      stagedClients, setStagedClients,
      stagedDescription, setStagedDescription,
      stagedStatus, setStagedStatus,
      groupBy, setGroupBy,
      secondaryBy, setSecondaryBy,
      tertiaryBy, setTertiaryBy,
      descFilter, setDescFilter,
    }}>
      {children}
    </ReportsFilterContext.Provider>
  )
}

export const useReportsFilters = () => useContext(ReportsFilterContext)
