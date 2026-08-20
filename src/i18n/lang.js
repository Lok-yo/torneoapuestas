const STORAGE_KEY = 'coliseum-lang'

export function getLang() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'es'
  } catch {
    return 'es'
  }
}

export function setStoredLang(lang) {
  const next = lang === 'en' ? 'en' : 'es'
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // ignore
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next === 'en' ? 'en' : 'es-419'
  }
  return next
}
