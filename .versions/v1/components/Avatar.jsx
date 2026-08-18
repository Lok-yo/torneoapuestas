// Avatar de iniciales con color determinístico por username (sin depender de
// imágenes externas ni de un avatar real de Google todavía).
function hashHue(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360
  return h
}

export default function Avatar({ username = '?', size = 36 }) {
  const initials = username.slice(0, 2).toUpperCase()
  const hue = hashHue(username)

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white/10"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(145deg, hsl(${hue} 70% 48%), hsl(${(hue + 40) % 360} 65% 32%))`,
      }}
    >
      {initials}
    </div>
  )
}
