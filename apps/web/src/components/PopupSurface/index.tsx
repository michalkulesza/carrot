import {
  motion,
  useIsPresent,
  useReducedMotion,
  type HTMLMotionProps,
} from 'framer-motion'

const PopupSurface = ({ children, ...props }: HTMLMotionProps<'div'>) => {
  const isPresent = useIsPresent()
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.97 }}
      transition={{ duration: reduceMotion ? 0 : 0.18 }}
      inert={!isPresent || undefined}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export default PopupSurface
