import { useEffect, useState } from 'react'

const useSecondTick = (active: boolean) => {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!active) return

    const interval = setInterval(() => setTick((tick) => tick + 1), 1000)

    return () => clearInterval(interval)
  }, [active])
}

export default useSecondTick
