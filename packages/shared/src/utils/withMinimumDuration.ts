const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const withMinimumDuration = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
  const [result] = await Promise.all([promise, sleep(ms)])
  return result
}
