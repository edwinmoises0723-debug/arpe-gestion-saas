type EjnexaIconProps = {
  size?: number
  className?: string
  decorative?: boolean
}

export function EjnexaIcon({
  size = 42,
  className,
  decorative = true,
}: EjnexaIconProps) {
  const common = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img' as const, 'aria-label': 'EJNEXA Business' }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      focusable="false"
      {...common}
    >
      <defs>
        <linearGradient id="ej-r1" x1="66" y1="150" x2="149" y2="55" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00D9FF" />
          <stop offset=".55" stopColor="#0B84F3" />
          <stop offset="1" stopColor="#0A45B8" />
        </linearGradient>
        <linearGradient id="ej-r2" x1="162" y1="55" x2="194" y2="170" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0A65E8" />
          <stop offset=".52" stopColor="#00C7F3" />
          <stop offset="1" stopColor="#14D8C8" />
        </linearGradient>
        <linearGradient id="ej-r3" x1="184" y1="176" x2="69" y2="159" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#14D8C8" />
          <stop offset=".48" stopColor="#00D9FF" />
          <stop offset="1" stopColor="#0A57D0" />
        </linearGradient>
        <linearGradient id="ej-nTop" x1="142" y1="29" x2="175" y2="75" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#19C6FF" />
          <stop offset="1" stopColor="#0870E8" />
        </linearGradient>
        <linearGradient id="ej-nLeft" x1="36" y1="142" x2="72" y2="177" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1AE8E3" />
          <stop offset="1" stopColor="#00C9EF" />
        </linearGradient>
        <linearGradient id="ej-nRight" x1="179" y1="171" x2="214" y2="207" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#21EBD9" />
          <stop offset="1" stopColor="#00D0D8" />
        </linearGradient>
      </defs>

      <path d="M70 143 C88 111 111 78 140 57 C132 77 132 97 144 116 C127 110 111 112 97 122 C86 130 77 138 70 143Z" fill="url(#ej-r1)" />
      <path d="M164 65 C187 89 199 119 193 160 C183 145 170 134 153 127 C142 122 133 121 124 122 C136 101 149 82 164 65Z" fill="url(#ej-r2)" />
      <path d="M181 175 C151 187 116 182 76 164 C97 164 114 158 129 147 C141 138 148 130 153 122 C164 141 173 158 181 175Z" fill="url(#ej-r3)" />

      <circle cx="156" cy="49" r="30" fill="url(#ej-nTop)" />
      <circle cx="55" cy="158" r="28" fill="url(#ej-nLeft)" />
      <circle cx="195" cy="188" r="30" fill="url(#ej-nRight)" />

      <path d="M132 92 C136 103 140 111 144 116" fill="none" stroke="#0A2D6B" strokeOpacity=".22" strokeWidth="2" />
      <path d="M170 134 C179 142 186 151 193 160" fill="none" stroke="#0A2D6B" strokeOpacity=".18" strokeWidth="2" />
      <path d="M106 176 C131 183 157 183 181 175" fill="none" stroke="#0A2D6B" strokeOpacity=".15" strokeWidth="2" />
    </svg>
  )
}
