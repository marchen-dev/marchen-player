import { cn } from '@renderer/lib/utils'
import appIcon from '../../../../../resources/icon.png'

/** 关于页与各桌面平台共用已确认的猫耳图标。 */
export const Logo = ({ className }: { className?: string }) => (
  <img
    src={appIcon}
    alt="Marchen 应用图标"
    className={cn('size-full object-contain', className)}
    draggable={false}
  />
)

/**
 * 单色猫耳标志，取自应用图标的前景图形，不含圆角底板。
 *
 * 颜色跟随 currentColor，便于在黑白灰界面里与线性图标保持一致；
 * 播放三角与弹幕线的白色间隙用 mask 镂空，深色主题下不会露出白块。
 *
 * triangleClassName 用于在标志变为品牌色时把播放三角填回白色：镂空的三角在深色底上
 * 会变成黑洞，与应用图标的白色三角相反，看起来像负片。三角画在 mask 之外，
 * 默认透明，保持单色状态下的镂空效果；弹幕线外圈间隙始终镂空，避免深色下出现白边。
 */
export const LogoMark = ({
  className,
  triangleClassName,
}: {
  className?: string
  triangleClassName?: string
}) => (
  <svg
    viewBox="221 217 590 590"
    className={cn('size-[1em] shrink-0', className)}
    fill="currentColor"
    aria-hidden="true"
  >
    <defs>
      {/* 显式声明 mask 区域：默认区域按视口从原点计算，会裁掉偏移后的 viewBox 右下部分 */}
      <mask
        id="marchen-logo-mark-cutout"
        maskUnits="userSpaceOnUse"
        x="221"
        y="217"
        width="590"
        height="590"
      >
        <rect x="221" y="217" width="590" height="590" fill="white" />
        {/* 弹幕线外圈留出间隙，再画回弹幕线本身 */}
        <path
          d="M263 501 H367 M292 573 H390"
          fill="none"
          stroke="black"
          strokeWidth="66"
          strokeLinecap="round"
        />
        <path
          d="M263 501 H367 M292 573 H390"
          fill="none"
          stroke="white"
          strokeWidth="40"
          strokeLinecap="round"
        />
        <path
          d="M521 443 Q501 431 501 455 L501 604 Q501 628 522 615 L638 544 Q657 533 638 521 Z"
          fill="black"
        />
      </mask>
    </defs>
    <g mask="url(#marchen-logo-mark-cutout)">
      <path d="M350 405 C338 362 341 293 360 270 C375 253 436 297 468 329 C519 319 574 320 624 329 C658 300 715 261 731 270 C750 282 759 352 750 397 C789 434 802 488 802 555 C802 659 754 709 659 713 L470 713 L359 758 Q345 763 351 746 L376 679 C343 651 326 607 326 551 L326 490 C326 456 334 430 350 405 Z" />
      <path
        d="M263 501 H367 M292 573 H390"
        fill="none"
        stroke="currentColor"
        strokeWidth="40"
        strokeLinecap="round"
      />
    </g>
    <path
      d="M521 443 Q501 431 501 455 L501 604 Q501 628 522 615 L638 544 Q657 533 638 521 Z"
      className={cn('fill-transparent', triangleClassName)}
    />
  </svg>
)
