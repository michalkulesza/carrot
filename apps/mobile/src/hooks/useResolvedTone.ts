import { useResolvedColorScheme } from '../context/ColorSchemeContext'
import { paletteTones } from '../theme'

// Border colours are frozen to a CGColor when set; a dynamic colour resolved while the view is off-window picks the system trait.
export const useResolvedTone = (tone: keyof typeof paletteTones) => {
  const scheme = useResolvedColorScheme()
  return paletteTones[tone][scheme === 'dark' ? 1 : 0]
}
