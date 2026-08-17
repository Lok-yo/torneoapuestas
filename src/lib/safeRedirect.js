// Allowlists a post-login redirect target to same-origin, in-app paths
// only. See authenticated-identity spec "Unauthorized command" and
// design.md threat matrix "Application routes/session redirects":
// "Allowlisted same-origin returns prevent loops/open redirects."
//
// RequireAuth.jsx passes `state={{ from: location }}` to the /login
// redirect it issues; LoginPage reads `location.state?.from?.pathname`
// back out after a successful sign-in. React Router's own `state` lives
// in `history.state`, not the URL — but `history.state` is standard
// browser API surface any script running on the page (a forged
// extension, an XSS payload, a stale/replayed history entry) can write
// directly, so it must never be trusted as an authoritative internal
// path without validation. See tasks.md 6.4.

/**
 * @param {unknown} candidate - an untrusted `location.state?.from?.pathname` value.
 * @returns {string} a validated in-app path, or '/' if the candidate is
 *   missing, malformed, points off-origin, or would redirect back to
 *   /login (which would loop: RequireAuth would just bounce the user
 *   straight back to /login again).
 */
export function safeRedirectPath(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) return '/'

  // Exactly one leading slash: rejects protocol-relative ("//evil.com"),
  // backslash tricks ("/\evil.com", which some browsers treat as "//"),
  // and absolute URLs ("https://evil.com/x", which never start with "/").
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.startsWith('/\\')) return '/'

  // Reject anything that still looks like it carries a scheme/host
  // component after the leading slash (defense in depth).
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(candidate)) return '/'

  // Never redirect back into /login itself — that would loop.
  if (candidate === '/login' || candidate.startsWith('/login/') || candidate.startsWith('/login?')) return '/'

  return candidate
}
