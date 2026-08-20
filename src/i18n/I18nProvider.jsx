import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { es } from './es.js'
import { en } from './en.js'
import { getLang, setStoredLang } from './lang.js'

const DICTS = { es, en }

const I18nContext = createContext({
  lang: 'es',
  setLang: () => {},
  t: (key) => key,
})

function lookup(dict, key) {
  return key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), dict)
}

function interpolate(str, vars) {
  if (!vars) return str
  return String(str).replace(/\{(\w+)\}/g, (_, name) => (vars[name] == null ? '' : String(vars[name])))
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const initial = getLang()
    setStoredLang(initial)
    return initial
  })

  const setLang = useCallback((next) => {
    setLangState(setStoredLang(next))
  }, [])

  const t = useCallback(
    (key, vars) => {
      const primary = lookup(DICTS[lang] || es, key)
      const fallback = primary == null ? lookup(es, key) : primary
      if (fallback == null) return key
      if (typeof fallback === 'object') return fallback
      return interpolate(fallback, vars)
    },
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
