import NetworkImage from '../../components/NetworkImage'

interface RecipeThumbProps {
  src: string | null | undefined
  alt: string
  className?: string
}

const RecipeThumb = ({ src, alt, className = '' }: RecipeThumbProps) => (
  <NetworkImage src={src} alt={alt} className={className} />
)

export default RecipeThumb
