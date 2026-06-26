import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'

const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} })

export function ThemeProvider({ children }) {
  const { user } = useAuth()
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    if (!user) return
    const stored = localStorage.getItem(`tt-theme:${user.id}`)
    setTheme(stored === 'dark' ? 'dark' : 'light')
  }, [user?.id])

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    if (user) {
      localStorage.setItem(`tt-theme:${user.id}`, next)
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
