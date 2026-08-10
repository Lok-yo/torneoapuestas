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
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `hsl(${hue} 60% 40%)`,
      }}
    >
      {initials}
    </div>
  )
}
