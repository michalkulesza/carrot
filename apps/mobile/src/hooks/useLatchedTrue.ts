import { useState } from 'react'

export const useLatchedTrue = (value: boolean) => {
  const [latched, setLatched] = useState(value)

  if (value && !latched) setLatched(true)

  return value || latched
}
