type BrandMarkSize = 'sm' | 'lg'

const BOX_CLASS: Record<BrandMarkSize, string> = {
  sm: 'size-5.5 rounded-md',
  lg: 'size-10 rounded-xl',
}

const ICON_SIZE: Record<BrandMarkSize, number> = { sm: 12, lg: 22 }
const ICON_STROKE: Record<BrandMarkSize, number> = { sm: 3, lg: 2.6 }

type BrandMarkProps = {
  size: BrandMarkSize
}

const BrandMark = ({ size }: BrandMarkProps) => (
  <span
    aria-hidden="true"
    className={`flex shrink-0 items-center justify-center bg-carrot-bright ${BOX_CLASS[size]}`}
  >
    <svg
      width={ICON_SIZE[size]}
      height={ICON_SIZE[size]}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={ICON_STROKE[size]}
      strokeLinejoin="round"
      className="stroke-carrot-deep"
    >
      <path d="M6 3h12v18l-6-5-6 5z" />
    </svg>
  </span>
)

export default BrandMark
