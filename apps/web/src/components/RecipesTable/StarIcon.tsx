import { Star } from 'react-feather'

interface StarIconProps {
  filled: boolean
}

const StarIcon = ({ filled }: StarIconProps) => (
  <Star size={14} fill={filled ? 'currentColor' : 'none'} aria-hidden={true} />
)

export default StarIcon
