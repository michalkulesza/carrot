import { useEffect, useState } from 'react'
import { toISODate } from '../utils/dateUtils'

const millisecondsUntilLocalMidnight = (): number => {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 100)
  return midnight.getTime() - now.getTime()
}

export const useTodayIso = () => {
  const [todayIso, setTodayIso] = useState(() => toISODate(new Date()))

  useEffect(() => {
    const timeout = setTimeout(() => {
      setTodayIso(toISODate(new Date()))
    }, millisecondsUntilLocalMidnight())

    return () => clearTimeout(timeout)
  }, [todayIso])

  return todayIso
}
