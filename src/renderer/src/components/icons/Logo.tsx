import { useAppTheme } from '@renderer/hooks/theme'
import { cn } from '@renderer/lib/utils'
import type { FC } from 'react'

const LogoSvg = ({
  ref,
  ...props
}: React.SVGProps<SVGSVGElement> & { ref?: React.RefObject<SVGSVGElement> }) => (
  <svg
    version="1.0"
    xmlns="http://www.w3.org/2000/svg"
    width="1108.000000pt"
    height="1108.000000pt"
    viewBox="0 0 1108.000000 1108.000000"
    preserveAspectRatio="xMidYMid meet"
    {...props}
    ref={ref}
  >
    <g transform="translate(0.000000,1108.000000) scale(0.100000,-0.100000)" stroke="none">
      <path
        d="M3410 5541 c0 -2842 2 -3371 14 -3371 7 0 24 8 37 18 13 10 128 83
254 162 127 78 249 154 272 169 36 23 135 85 281 175 26 16 63 39 82 51 19 13
154 96 300 185 943 580 863 529 850 545 -6 7 -82 57 -168 111 -306 189 -367
227 -402 249 -19 12 -91 57 -160 98 -69 42 -134 82 -145 90 -19 14 -20 26 -20
348 0 306 1 334 17 337 9 2 30 -5 45 -16 15 -11 116 -73 223 -139 107 -66 267
-164 355 -218 88 -54 230 -141 315 -193 85 -52 178 -109 205 -127 248 -160
309 -195 329 -189 19 6 128 72 491 296 61 37 126 77 145 88 241 142 441 271
434 281 -7 13 -63 48 -267 173 -84 51 -264 162 -402 246 -137 84 -335 205
-440 270 -104 65 -309 191 -455 280 -146 90 -290 179 -320 198 -30 18 -185
114 -345 212 -159 98 -299 185 -310 193 -19 14 -20 28 -22 346 -2 270 0 333
11 337 7 3 116 -59 242 -137 237 -146 468 -289 924 -569 146 -89 281 -173 300
-185 19 -12 89 -55 155 -95 66 -40 136 -83 155 -95 19 -13 118 -74 220 -135
279 -170 800 -490 840 -515 67 -43 245 -152 267 -164 14 -7 30 -8 45 -2 13 5
118 68 233 141 116 73 219 138 230 144 11 6 31 19 45 27 14 9 77 48 140 86
327 199 451 276 455 283 7 12 -21 32 -190 135 -220 134 -460 281 -520 320 -53
34 -338 209 -383 236 -15 9 -200 123 -412 254 -212 131 -437 269 -500 308 -63
38 -155 95 -205 127 -49 31 -160 100 -245 152 -163 100 -334 205 -528 325 -64
40 -152 94 -195 120 -168 104 -161 100 -902 556 -143 88 -276 170 -295 182
-19 12 -60 38 -90 57 -156 99 -971 602 -982 606 -4 2 -8 -1513 -8 -3367z"
      />
    </g>
  </svg>
)

export const Logo: FC<{ clasNames?: { wrapper?: string; icon?: string }; round?: boolean }> = (
  props,
) => {
  const { isDarkMode } = useAppTheme()
  const wrapper = props.clasNames?.wrapper
  const icon = props.clasNames?.icon
  if (!props.round) {
    return <LogoSvg fill={isDarkMode ? '#A6ADBB' : '#000'} className={cn('size-full', icon)} />
  }
  return (
    <div className={cn('rounded-xl  bg-base-100', wrapper)}>
      <LogoSvg fill={isDarkMode ? '#A6ADBB' : '#000'} className={cn('size-full', icon)} />
    </div>
  )
}
