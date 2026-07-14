export const createUuid = (): string => {
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'

  return template.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16)
    const digit = character === 'x' ? value : (value & 0x3) | 0x8

    return digit.toString(16)
  })
}
