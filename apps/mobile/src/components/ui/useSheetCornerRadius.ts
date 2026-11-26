import { useEffect, useState } from 'react'
import { getScreenCornerRadius } from '../../../modules/screen-corners'
import { radius, sheetInset } from '../../theme'

let cachedRadius: number | undefined
let pendingRadius: Promise<number | null> | undefined

export const resolveSheetCornerRadius = (): Promise<number | null> => {
  pendingRadius ??= getScreenCornerRadius().then((screenRadius) => {
    // Null can mean no window yet, so allow a later sheet mount to measure again.
    if (screenRadius === null) {
      pendingRadius = undefined
      return null
    }

    cachedRadius = Math.max(screenRadius - sheetInset, 0)
    return cachedRadius
  })

  return pendingRadius
}

export const useSheetCornerRadius = (): number => {
  const [resolved, setResolved] = useState(cachedRadius)

  useEffect(() => {
    if (cachedRadius !== undefined) return

    let active = true
    void resolveSheetCornerRadius().then((value) => {
      if (active && value !== null) setResolved(value)
    })

    return () => {
      active = false
    }
  }, [])

  return resolved ?? radius.sheet
}
